// audio/soundhelix-activite.ts — La matrice d'activité de SoundHelix écrite en texte, et ce qu'elle
// dit, tic par tic, de chaque voix.
//
// D'APRÈS SoundHelix 0.9 (Thomas Schürger), réécrit depuis la description de son modèle, sans rien
// en recopier : décision D1 du chantier, 2026-11-28.
//
// LE TEXTE, contenu `activite` : une ligne par voix, son nom, puis un signe par section d'accords,
// `x` quand elle joue, `.` quand elle se tait, puis deux décalages facultatifs en tics :
//
//   basse      ..xxxxxx..xx  debut=-2
//   melodie    ....xxx.....  debut=-12 fin=3
//
// Les espaces entre les signes sont permis. Une ligne qui commence par `#` est un commentaire. Le
// texte ne dit rien du temps : les sections viennent de l'harmonie, et la matrice doit en compter
// autant qu'elle.
//
// LES DÉCALAGES sont ceux de SoundHelix (`startShift`, `stopShift`) : `debut` déplace chaque entrée
// de la voix, négatif l'avance (une levée), positif la retarde ; `fin` déplace chaque sortie, positif
// la prolonge, négatif l'avance. Une voix qui joue dès le début du morceau y a une entrée, et une
// voix qui joue jusqu'à la fin y a une sortie : elles se déplacent aussi, sans sortir du morceau.
// Relevé sur l'essai de registre, où `fin=-4` tait la nappe quatre tics avant la fin.
//
// LA RÈGLE DE L'ACTIVITÉ, que les voix appliquent : une note ne part que si sa voix joue au tic où
// elle commence, et elle n'est pas coupée ensuite. Relevé sur les témoins du banc, 2 328 notes
// mélodiques : aucune ne part d'un tic où sa voix se tait.

/** Une voix de la matrice : son nom, ses signes par section, ses décalages. */
export interface VoixActivite {
  nom: string;
  sections: boolean[];
  debut: number;
  fin: number;
}

/** Une faute de matrice, qui nomme ce qu'elle n'a pas su lire, en français et en anglais. */
export class FauteActivite extends Error {
  readonly en: string;
  constructor(message: string, en: string) {
    super(message);
    this.en = en;
  }
}

/** Lit la matrice ; une ligne illisible lève en le disant. */
export function lireActivite(texte: string): VoixActivite[] {
  const voix: VoixActivite[] = [];
  for (const [i, brute] of texte.split(/\r?\n/).entries()) {
    const ligne = brute.trim();
    if (ligne === "" || ligne.startsWith("#")) continue;
    const m = /^(\S+)\s+([x. ]+?)((?:\s+(?:debut|fin)=-?\d+)*)$/.exec(ligne);
    if (!m) {
      throw new FauteActivite(`ligne ${i + 1} de la matrice illisible : « ${ligne} »`,
        `line ${i + 1} of the matrix is unreadable: « ${ligne} »`);
    }
    const signes = m[2].replace(/ /g, "");
    const debut = /debut=(-?\d+)/.exec(m[3])?.[1];
    const fin = /fin=(-?\d+)/.exec(m[3])?.[1];
    if (voix.some((v) => v.nom === m[1])) {
      throw new FauteActivite(`la voix « ${m[1]} » est écrite deux fois`, `the voice « ${m[1]} » is written twice`);
    }
    voix.push({ nom: m[1], sections: [...signes].map((s) => s === "x"), debut: Number(debut ?? 0), fin: Number(fin ?? 0) });
  }
  return voix;
}

/** Écrit la matrice : le nom aligné, un signe par section, les décalages quand ils ne sont pas nuls. */
export function ecrireActivite(voix: readonly VoixActivite[]): string {
  const large = Math.max(0, ...voix.map((v) => v.nom.length));
  return voix.map((v) => {
    const decalages = [v.debut ? `debut=${v.debut}` : "", v.fin ? `fin=${v.fin}` : ""].filter(Boolean).join(" ");
    return `${v.nom.padEnd(large)}  ${v.sections.map((a) => (a ? "x" : ".")).join("")}${decalages ? `  ${decalages}` : ""}`;
  }).join("\n");
}

/**
 * Les segments d'une voix en tics, positifs quand elle joue, négatifs quand elle se tait, une fois
 * ses décalages appliqués. `sections` est le premier tic de chaque section, `tics` la longueur.
 */
export function segmentsDeVoix(v: VoixActivite, sections: readonly number[], tics: number): number[] {
  if (v.sections.length !== sections.length) {
    throw new FauteActivite(`la voix « ${v.nom} » a ${v.sections.length} sections, l'harmonie ${sections.length}`,
      `the voice « ${v.nom} » has ${v.sections.length} sections, the harmony ${sections.length}`);
  }
  const actif = new Array<boolean>(tics).fill(false);
  sections.forEach((debut, k) => {
    const fin = sections[k + 1] ?? tics;
    for (let t = debut; t < fin; t++) actif[t] = v.sections[k];
  });
  // Les frontières, lues sur le vecteur d'avant les décalages : chacune bouge d'après son sens.
  const entrees: number[] = actif[0] ? [0] : [];
  const sorties: number[] = actif[tics - 1] ? [tics] : [];
  for (let t = 1; t < tics; t++) {
    if (!actif[t - 1] && actif[t]) entrees.push(t);
    if (actif[t - 1] && !actif[t]) sorties.push(t);
  }
  const decale = [...actif];
  for (const t of entrees) poser(decale, t, t + v.debut, true);
  for (const t of sorties) poser(decale, t, t + v.fin, false);
  return enSegments(decale);
}

/** Déplace une frontière de `de` à `a` : l'état qui suit la frontière gagne ou perd les tics entre les deux. */
function poser(vecteur: boolean[], de: number, a: number, etatApres: boolean) {
  const borne = Math.max(0, Math.min(vecteur.length, a));
  if (borne < de) for (let t = borne; t < de; t++) vecteur[t] = etatApres;
  else for (let t = de; t < borne; t++) vecteur[t] = !etatApres;
}

function enSegments(vecteur: readonly boolean[]): number[] {
  const out: number[] = [];
  for (let t = 0; t < vecteur.length;) {
    let fin = t;
    while (fin < vecteur.length && vecteur[fin] === vecteur[t]) fin++;
    out.push(vecteur[t] ? fin - t : -(fin - t));
    t = fin;
  }
  return out;
}

/** La voix joue-t-elle au tic donné ? Faux au-delà de la fin. */
export function joueAuTic(segments: readonly number[], tic: number): boolean {
  let debut = 0;
  for (const s of segments) {
    const fin = debut + Math.abs(s);
    if (tic >= debut && tic < fin) return s > 0;
    debut = fin;
  }
  return false;
}

/** Le nombre de tics jusqu'au prochain changement d'état de la voix, ou jusqu'à la fin. */
export function longueurIntervalle(segments: readonly number[], tic: number): number {
  let debut = 0;
  for (const s of segments) {
    const fin = debut + Math.abs(s);
    if (tic >= debut && tic < fin) return fin - tic;
    debut = fin;
  }
  return 0;
}
