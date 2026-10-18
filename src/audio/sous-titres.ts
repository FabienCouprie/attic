// audio/sous-titres.ts — Des mots datés deviennent des sous-titres SRT.
//
// QUATRE DÉCISIONS, ET CHACUNE RÉPOND À CE QU'UN SOUS-TITRE DOIT FAIRE : être lu en entier avant
// de disparaître, et disparaître avant que le suivant arrive.
//
//  1. LA COUPE SUIT LE SILENCE D'ABORD, LA LONGUEUR ENSUITE. Couper là où la voix s'arrête donne
//     une unité de sens ; couper au milieu d'un groupe parce que la ligne est pleine donne un
//     sous-titre qu'il faut relire. Le silence est donc examiné avant la place restante.
//
//  2. UN SOUS-TITRE NE RECOUVRE JAMAIS LE SUIVANT. La durée minimale allonge la fin d'un
//     sous-titre trop bref, mais jamais au-delà du début du suivant : deux sous-titres qui se
//     chevauchent s'empilent à l'écran chez la plupart des lecteurs, et le second devient
//     illisible.
//
//  3. LES INSTANTS VIENNENT DES MOTS, ET D'AUCUNE GRILLE. Le début est celui du premier mot, la
//     fin celle du dernier. Rien n'est arrondi à une image ni à une seconde : un sous-titre
//     recalé sur une grille dérive de la voix qu'il accompagne.
//
//  4. AUCUN MOT N'EST COUPÉ. Le repli cherche la fin d'un mot ; un mot plus long que la ligne
//     occupe sa ligne entière plutôt que d'être tronqué.
export interface MotDate {
  mot: string;
  /** Le début, en secondes. */
  debut: number;
  /** La fin, en secondes. */
  fin: number;
}

export interface ReglagesSousTitres {
  /** Caractères par ligne. */
  largeurLigne: number;
  /** Lignes par sous-titre. */
  lignesMax: number;
  /** Durée maximale d'un sous-titre, en secondes. */
  dureeMax: number;
  /** Le silence entre deux mots à partir duquel on coupe, en secondes. */
  silenceCoupe: number;
  /** Durée minimale affichée, en secondes, dans la limite du sous-titre suivant. */
  dureeMin: number;
}

export interface SousTitre {
  debut: number;
  fin: number;
  lignes: string[];
}

/** Un instant SRT : heures, minutes, secondes, et millisecondes après une virgule. */
export function instantSrt(secondes: number): string {
  const ms = Math.max(0, Math.round(secondes * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${deux(h)}:${deux(m)}:${deux(s)},${String(ms % 1000).padStart(3, "0")}`;
}

/**
 * Les mots repliés en lignes d'au plus `largeur` caractères, sans jamais couper un mot.
 *
 * SANS PLAFOND DE LIGNES : c'est cette forme que le découpage interroge pour savoir si un mot
 * de plus tient encore. Compter les caractères à la place reviendrait à compter aussi les espaces
 * qui disparaissent aux fins de ligne, et couperait des groupes qui tenaient.
 */
export function lignesBrutes(mots: readonly string[], largeur: number): string[] {
  const place = Math.max(1, Math.round(largeur));
  const lignes: string[] = [];
  let courante = "";
  for (const mot of mots) {
    if (courante === "") courante = mot;
    else if (courante.length + 1 + mot.length <= place) courante += ` ${mot}`;
    else { lignes.push(courante); courante = mot; }
  }
  if (courante !== "") lignes.push(courante);
  return lignes;
}

/** Les mots repliés en lignes, sans jamais couper un mot ni en perdre un. */
export function replierEnLignes(mots: readonly string[], largeur: number, lignesMax: number): string[] {
  const lignes = lignesBrutes(mots, largeur);
  // LE DÉBORDEMENT RESTE VISIBLE : les lignes en trop rejoignent la dernière plutôt que d'être
  // jetées. Un sous-titre trop haut se voit et se règle ; un mot disparu ne se voit pas.
  const garde = Math.max(1, Math.round(lignesMax));
  if (lignes.length <= garde) return lignes;
  return [...lignes.slice(0, garde - 1), lignes.slice(garde - 1).join(" ")];
}

/** Les mots datés découpés en sous-titres. */
export function decouperEnSousTitres(
  mots: readonly MotDate[], r: ReglagesSousTitres,
): SousTitre[] {
  // L'ORDRE DU TEMPS EST REFAIT ICI, et non supposé : le silence entre deux mots se mesure sur
  // des mots qui se suivent, et une fin bornée par le sous-titre suivant suppose que le suivant
  // commence plus tard.
  const retenus = mots.filter((m) =>
    m && typeof m.mot === "string" && m.mot.trim() !== ""
    && Number.isFinite(m.debut) && Number.isFinite(m.fin) && m.fin >= m.debut)
    .slice()
    .sort((a, b) => a.debut - b.debut);
  if (retenus.length === 0) return [];

  const lignesMax = Math.max(1, Math.round(r.lignesMax));
  const groupes: MotDate[][] = [];
  let courant: MotDate[] = [];
  for (const mot of retenus) {
    const precedent = courant[courant.length - 1];
    const silence = precedent ? mot.debut - precedent.fin : 0;
    const debordeLaPlace = precedent
      && lignesBrutes([...courant, mot].map((m) => m.mot), r.largeurLigne).length > lignesMax;
    const trop = precedent
      && (silence >= r.silenceCoupe || debordeLaPlace || mot.fin - courant[0].debut > r.dureeMax);
    if (trop) { groupes.push(courant); courant = []; }
    courant.push(mot);
  }
  if (courant.length > 0) groupes.push(courant);

  return groupes.map((groupe, i) => {
    const debut = groupe[0].debut;
    const brute = groupe[groupe.length - 1].fin;
    const suivant = groupes[i + 1]?.[0].debut ?? Infinity;
    return {
      debut,
      fin: Math.min(Math.max(brute, debut + r.dureeMin), suivant),
      lignes: replierEnLignes(groupe.map((m) => m.mot), r.largeurLigne, r.lignesMax),
    };
  });
}

/**
 * Les instants d'une ligne de temps SRT, ou `null` si ce n'en est pas une.
 *
 * LES DEUX FORMES SONT ADMISES : la virgule du SRT et le point que beaucoup d'outils écrivent à sa
 * place. Refuser le point rejetterait des fichiers que tous les lecteurs acceptent.
 */
function instantsDeLigne(ligne: string): [number, number] | null {
  const m = ligne.match(
    /^\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/);
  if (!m) return null;
  const secondes = (h: string, mn: string, s: string, ms: string) =>
    Number(h) * 3600 + Number(mn) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
  return [secondes(m[1], m[2], m[3], m[4]), secondes(m[5], m[6], m[7], m[8])];
}

/**
 * Un SRT relu : ses sous-titres, dans l'ordre du temps.
 *
 * LA LIGNE DE TEMPS DÉCIDE, ET NON LE NUMÉRO. Un fichier corrigé à la main perd souvent sa
 * numérotation, ou la garde fausse après une coupe ; les instants, eux, sont ce qui compte, et
 * tout ce qui suit la flèche jusqu'à la ligne vide est le texte.
 */
export function analyserSrt(texte: string): SousTitre[] {
  const lignes = String(texte ?? "").split(/\r?\n/);
  const sous: SousTitre[] = [];
  for (let i = 0; i < lignes.length; i++) {
    const instants = instantsDeLigne(lignes[i]);
    if (!instants) continue;
    const corps: string[] = [];
    for (let j = i + 1; j < lignes.length; j++) {
      if (lignes[j].trim() === "") break;
      if (instantsDeLigne(lignes[j])) break;
      corps.push(lignes[j].trim());
      i = j;
    }
    if (corps.length > 0 && instants[1] >= instants[0]) {
      sous.push({ debut: instants[0], fin: instants[1], lignes: corps });
    }
  }
  return sous.sort((a, b) => a.debut - b.debut);
}

/**
 * Le sous-titre à montrer à l'instant `t`, ou `null`.
 *
 * LE DERNIER QUI A COMMENCÉ GAGNE. Deux sous-titres qui se recouvrent arrivent d'un fichier écrit
 * ailleurs ; en montrer deux à la fois empilerait du texte, et en montrer le premier laisserait le
 * second invisible jusqu'à la fin du premier.
 */
export function sousTitreA(sous: readonly SousTitre[], t: number): SousTitre | null {
  let trouve: SousTitre | null = null;
  for (const s of sous) {
    if (s.debut > t) break;
    if (t < s.fin) trouve = s;
  }
  return trouve;
}

/** Les sous-titres au format SRT : un numéro, deux instants, le texte, une ligne vide. */
export function versSrt(sous: readonly SousTitre[]): string {
  return sous
    .map((s, i) => `${i + 1}\n${instantSrt(s.debut)} --> ${instantSrt(s.fin)}\n${s.lignes.join("\n")}\n`)
    .join("\n");
}
