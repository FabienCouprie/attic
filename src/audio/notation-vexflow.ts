// audio/notation-vexflow.ts — La notation des portées VexFlow, « C4/q D4/8 », lue puis mise en mesures.
//
// LA REVUE DES NOTATIONS EN TEXTE, troisième format, 2026-11-22. La portée traduisait la notation en
// texte EasyScore sans la lire : une durée hors des six devenait une noire, une note illisible
// arrivait à la bibliothèque, tout tenait dans une seule mesure de N noires, et une note naturelle
// après la même note altérée se gravait sans bécarre, si bien qu'un musicien la lisait altérée.
// Décisions de Fabien du 2026-11-22 : les points se lisent, toute autre durée est refusée en la
// nommant, et la portée se coupe en mesures.
//
// CE QUI EST LU. Un jeton par note, séparé par des espaces : la note ou l'accord, une barre, la durée,
// et « /r » pour un silence. La note : une lettre de A à G, en majuscule ou en minuscule, une
// altération (#, ##, b, bb, n), une octave de 0 à 9. L'accord : des notes jointes par « + », ou
// entre parenthèses et séparées par des espaces. La durée : w, h, q, 8, 16 ou 32, suivie de un à
// trois points. Une note sans altération est naturelle : le texte dit la hauteur, et la gravure
// décide seule des signes à dessiner.
//
// LA MISE EN MESURES. Une note qui franchit la barre est coupée, et ses morceaux sont liés. Une
// mesure inachevée se finit par des silences posés sur les temps. Chaque altération se dessine
// quand elle change ce qui est en vigueur dans la mesure, bécarre compris ; la barre efface tout ;
// la suite d'une note liée ne redessine rien et ne change rien.

export type Duree = "w" | "h" | "q" | "8" | "16" | "32";
const NOIRES: Record<Duree, number> = { w: 4, h: 2, q: 1, "8": 0.5, "16": 0.25, "32": 0.125 };
const ORDRE: Duree[] = ["w", "h", "q", "8", "16", "32"];
const ALTERATIONS: Record<string, number> = { "": 0, n: 0, "#": 1, "##": 2, b: -1, bb: -2 };
const SIGNES: Record<number, string> = { [-2]: "bb", [-1]: "b", 0: "n", 1: "#", 2: "##" };
const EPS = 1e-6;

export type Hauteur = { lettre: string; alteration: number; octave: number };
/** Un événement à graver : une note, un accord ou un silence, posé à `debut` pour `longueur` noires. */
export type Evenement = {
  debut: number;
  longueur: number;
  hauteurs: Hauteur[];
  silence: boolean;
  /** La durée telle qu'écrite, gardée quand l'événement tient dans sa mesure. */
  ecrite?: { duree: Duree; points: number };
};
/** Ce que la portée dessine : `signe` est l'altération à dessiner, ou null ; `lie` lie à l'élément suivant. */
export type ElementGrave = {
  hauteurs: (Hauteur & { signe: string | null })[];
  duree: Duree;
  points: number;
  silence: boolean;
  lie: boolean;
};
export type FauteGravure = { jeton: string; raison: "note" | "duree" | "forme" };

const NOTE = /^([A-Ga-g])(##|#|bb|b|n)?(\d)$/;
const DUREE = /^(w|h|q|8|16|32)(\.{0,3})$/;
const REPOS: Hauteur[] = [{ lettre: "B", alteration: 0, octave: 4 }];

/** La longueur, en noires, d'une durée pointée. */
export const longueurDe = (duree: Duree, points: number) => NOIRES[duree] * (2 - 1 / 2 ** points);

/** Une hauteur écrite « F#4 », ou null. */
export function lireHauteur(texte: string): Hauteur | null {
  const m = NOTE.exec(texte.trim());
  return m ? { lettre: m[1].toUpperCase(), alteration: ALTERATIONS[m[2] ?? ""], octave: Number(m[3]) } : null;
}

/** L'indice de la barre qui sépare les notes de leur durée, hors parenthèses, ou −1. */
export function barreDeDuree(jeton: string): number {
  let profondeur = 0;
  for (let i = 0; i < jeton.length; i++) {
    if (jeton[i] === "(") profondeur++;
    else if (jeton[i] === ")") profondeur--;
    else if (jeton[i] === "/" && profondeur === 0) return i;
  }
  return -1;
}

/** Les jetons d'un texte, séparés par des espaces, sans couper un accord entre parenthèses. */
export function jetonsDe(texte: string): string[] {
  const jetons: string[] = [];
  let courant = "", profondeur = 0;
  for (const c of texte.trim()) {
    if (c === "(") profondeur++;
    else if (c === ")") profondeur--;
    if (/\s/.test(c) && profondeur === 0) { if (courant) jetons.push(courant); courant = ""; } else courant += c;
  }
  if (courant) jetons.push(courant);
  return jetons;
}

/** Lit la notation : les événements, mis bout à bout, et les fautes, chacune avec son jeton. */
export function lireNotationVexflow(texte: string): { evenements: Evenement[]; fautes: FauteGravure[] } {
  const evenements: Evenement[] = [];
  const fautes: FauteGravure[] = [];
  let t = 0;
  for (const jeton of jetonsDe(texte)) {
    const barre = barreDeDuree(jeton);
    if (barre < 0) { fautes.push({ jeton, raison: "forme" }); continue; }
    const [dureeTexte, type, ...reste] = jeton.slice(barre + 1).split("/");
    if (reste.length > 0 || (type !== undefined && type !== "r")) { fautes.push({ jeton, raison: "forme" }); continue; }
    const d = DUREE.exec(dureeTexte);
    if (!d) { fautes.push({ jeton, raison: "duree" }); continue; }
    const notes = jeton.slice(0, barre);
    const ecrites = notes.startsWith("(") && notes.endsWith(")") ? notes.slice(1, -1).split(/\s+/) : notes.split("+");
    const hauteurs = ecrites.filter(Boolean).map(lireHauteur);
    if (hauteurs.length === 0 || hauteurs.some((h) => h === null)) { fautes.push({ jeton, raison: "note" }); continue; }
    const ecrite = { duree: d[1] as Duree, points: d[2].length };
    const longueur = longueurDe(ecrite.duree, ecrite.points);
    evenements.push({ debut: t, longueur, hauteurs: hauteurs as Hauteur[], silence: type === "r", ecrite });
    t += longueur;
  }
  return { evenements, fautes };
}

/** Les valeurs écrivables, de la plus longue à la plus courte, pointées jusqu'à deux fois. */
const VALEURS = ORDRE.flatMap((duree) => [0, 1, 2].map((points) => ({ duree, points, longueur: longueurDe(duree, points) })))
  .sort((a, b) => b.longueur - a.longueur);

/** Découpe une longueur en valeurs écrivables liées, la plus longue d'abord. */
function decomposer(longueur: number): { duree: Duree; points: number }[] {
  const valeurs: { duree: Duree; points: number }[] = [];
  let reste = longueur;
  while (reste > EPS) {
    const v = VALEURS.find((x) => x.longueur <= reste + EPS);
    if (!v) break;
    valeurs.push(v);
    reste -= v.longueur;
  }
  return valeurs;
}

/** Découpe un silence en valeurs simples posées sur leurs propres temps, depuis `position` dans la mesure. */
function decomposerSilence(position: number, longueur: number): { duree: Duree; points: number }[] {
  const valeurs: { duree: Duree; points: number }[] = [];
  let p = position, reste = longueur;
  while (reste > EPS) {
    const d = ORDRE.find((x) => NOIRES[x] <= reste + EPS && Math.abs(p / NOIRES[x] - Math.round(p / NOIRES[x])) < EPS);
    if (!d) break;
    valeurs.push({ duree: d, points: 0 });
    p += NOIRES[d];
    reste -= NOIRES[d];
  }
  return valeurs;
}

/**
 * Met les événements en mesures de `longueurMesure` noires. Les événements sont triés et ne se
 * chevauchent pas ; un écart entre deux devient un silence.
 */
export function mettreEnMesures(evenements: readonly Evenement[], longueurMesure = 4): ElementGrave[][] {
  const fin = evenements.reduce((m, e) => Math.max(m, e.debut + e.longueur), 0);
  const nombre = Math.max(1, Math.ceil(fin / longueurMesure - EPS));
  const brutes: { k: number; hauteurs: Hauteur[]; duree: Duree; points: number; silence: boolean; lie: boolean }[] = [];
  const poser = (debut: number, longueur: number, hauteurs: Hauteur[], silence: boolean, ecrite?: Evenement["ecrite"]) => {
    let a = debut, reste = longueur;
    while (reste > EPS) {
      const k = Math.floor(a / longueurMesure + EPS);
      const segment = Math.min(reste, (k + 1) * longueurMesure - a);
      const valeurs = ecrite && Math.abs(segment - longueur) < EPS ? [ecrite]
        : silence ? decomposerSilence(a - k * longueurMesure, segment) : decomposer(segment);
      a += segment;
      reste -= segment;
      valeurs.forEach((v, i) => brutes.push({ k, hauteurs, ...v, silence, lie: !silence && (reste > EPS || i < valeurs.length - 1) }));
    }
  };
  let t = 0;
  for (const e of evenements) {
    if (e.debut > t + EPS) poser(t, e.debut - t, REPOS, true);
    poser(e.debut, e.longueur, e.silence ? e.hauteurs.slice(0, 1) : e.hauteurs, e.silence, e.ecrite);
    t = Math.max(t, e.debut + e.longueur);
  }
  if (t < nombre * longueurMesure - EPS) poser(t, nombre * longueurMesure - t, REPOS, true);

  const rendu: ElementGrave[][] = Array.from({ length: nombre }, () => []);
  let enVigueur = new Map<string, number>(), mesureCourante = 0, suite = false;
  for (const b of brutes) {
    if (b.k !== mesureCourante) { enVigueur = new Map(); mesureCourante = b.k; }
    const hauteurs = b.hauteurs.map((h) => {
      const cle = `${h.lettre}${h.octave}`;
      if (b.silence || suite || (enVigueur.get(cle) ?? 0) === h.alteration) return { ...h, signe: null };
      enVigueur.set(cle, h.alteration);
      return { ...h, signe: SIGNES[h.alteration] };
    });
    rendu[b.k].push({ hauteurs, duree: b.duree, points: b.points, silence: b.silence, lie: b.lie });
    suite = b.lie;
  }
  return rendu;
}

/** Une note de tablature : la corde, comptée depuis l'aiguë, la frette, et la durée. */
export type NoteTab = { corde: number; frette: number; duree: Duree; points: number };
export type FauteTab = { jeton: string; raison: "forme" | "duree" | "corde" };
const TAB = /^(\d+)-(\d+)(?:\/(.*))?$/;

/**
 * Lit une tablature « corde-frette/durée ». Un jeton sans durée vaut une noire. Une corde que
 * l'instrument n'a pas, un accord, une durée hors des six ou une forme illisible sont refusés, chacun
 * avec son jeton : mesuré avant, « 7-3 » se dessinait sous la portée, « 6-3+5-2 » perdait le 5-2, et
 * « 6-3/x » devenait une noire.
 */
export function lireTablature(texte: string, cordes: number): { notes: NoteTab[]; fautes: FauteTab[] } {
  const notes: NoteTab[] = [];
  const fautes: FauteTab[] = [];
  for (const jeton of texte.split(/\s+/).filter(Boolean)) {
    const m = TAB.exec(jeton);
    if (!m) { fautes.push({ jeton, raison: "forme" }); continue; }
    const d = DUREE.exec(m[3] ?? "q");
    if (!d) { fautes.push({ jeton, raison: "duree" }); continue; }
    const corde = Number(m[1]);
    if (corde < 1 || corde > cordes) { fautes.push({ jeton, raison: "corde" }); continue; }
    notes.push({ corde, frette: Number(m[2]), duree: d[1] as Duree, points: d[2].length });
  }
  return { notes, fautes };
}

/** Le texte EasyScore d'un élément : seules les altérations à dessiner y figurent. */
export function easyScoreDe(e: ElementGrave): string {
  const nom = (h: ElementGrave["hauteurs"][number]) => `${h.lettre}${h.signe ?? ""}${h.octave}`;
  const notes = e.hauteurs.length > 1 ? `(${e.hauteurs.map(nom).join(" ")})` : nom(e.hauteurs[0]);
  return `${notes}/${e.duree}${".".repeat(e.points)}${e.silence ? "/r" : ""}`;
}
