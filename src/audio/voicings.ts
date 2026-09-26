import type { Note } from "./note";
// audio/voicings.ts — Renversements, voicings et conduite des voix.
//
// Attic sait fabriquer des accords, et il les empile depuis toujours de la même façon :
// fondamentale, tierce, quinte, septième, de bas en haut, serrés dans une octave. C'est la
// position la plus lourde qui soit — celle qu'aucun pianiste ne joue et qu'aucun arrangeur
// n'écrit. Ce module fait ce qu'on fait à la main : tourner l'accord, écarter les voix,
// descendre une voix d'une octave, et surtout enchaîner deux accords en bougeant le moins
// possible.
//
// La CONDUITE DES VOIX est le point qui compte. Entre do majeur et fa majeur, il y a une
// version qui déplace les trois voix de plusieurs tons et une qui n'en déplace qu'une d'un
// demi-ton ; la seconde s'entend comme une harmonie qui avance, la première comme deux
// accords sans rapport. Le module choisit, pour chaque accord, la disposition la plus
// proche de la précédente.

export type NoteAccord = Note;

/** Les notes qui commencent ensemble forment un accord — même seuil que pour les motifs. */
export function accords(notes: NoteAccord[], seuil = 0.02): NoteAccord[][] {
  const groupes: NoteAccord[][] = [];
  for (const n of [...notes].sort((a, b) => a.debut - b.debut || a.note - b.note)) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && Math.abs(n.debut - dernier[0].debut) <= seuil) dernier.push(n);
    else groupes.push([n]);
  }
  return groupes;
}

const trie = (accord: number[]): number[] => [...accord].sort((a, b) => a - b);

/**
 * RENVERSEMENT : les n notes les plus basses montent d'une octave, une par une.
 *
 * C'est la définition littérale du renversement — la basse passe au-dessus —, et elle a
 * l'avantage de garder les mêmes classes de hauteur : un renversement ne change pas
 * l'accord, seulement qui le porte.
 *
 * Un renversement égal au nombre de notes redonne l'accord à l'octave supérieure ; on
 * préfère alors rendre l'accord tel quel, pour qu'un réglage poussé au maximum ne fasse
 * pas monter la musique indéfiniment.
 */
export function renverser(accord: number[], n: number): number[] {
  const notes = trie(accord);
  if (notes.length === 0) return [];
  const tours = ((Math.floor(n) % notes.length) + notes.length) % notes.length;
  for (let k = 0; k < tours; k++) {
    const basse = notes.shift() as number;
    notes.push(basse + 12);
  }
  return trie(notes);
}

export type TypeVoicing = "serre" | "ouvert" | "drop2" | "drop3" | "drop24";

/**
 * VOICING : la façon de répartir les mêmes notes entre les voix.
 *
 * « Ouvert » monte une note sur deux d'une octave, ce qui écarte l'accord sans en changer
 * l'ordre. Les « drop » viennent de la guitare et de l'écriture pour quatre cuivres : on
 * descend d'une octave la deuxième (ou la troisième) voix EN PARTANT DU HAUT, ce qui creuse
 * l'accord au milieu et lui donne cette sonorité ouverte qu'une position serrée n'a pas.
 * Drop 2 et 4 descend les deux, et demande donc au moins quatre notes.
 */
export function voicing(accord: number[], type: TypeVoicing): number[] {
  const notes = trie(accord);
  if (notes.length < 2) return notes;
  if (type === "ouvert") {
    return trie(notes.map((n, i) => (i % 2 === 1 ? n + 12 : n)));
  }
  // Rang depuis le haut : 1 = voix supérieure, 2 = celle du dessous, etc.
  const depuisLeHaut = (rang: number) => notes.length - rang;
  const descendre = (indices: number[]) =>
    trie(notes.map((n, i) => (indices.includes(i) ? n - 12 : n)));
  if (type === "drop2" && notes.length >= 3) return descendre([depuisLeHaut(2)]);
  if (type === "drop3" && notes.length >= 4) return descendre([depuisLeHaut(3)]);
  if (type === "drop24" && notes.length >= 4) return descendre([depuisLeHaut(2), depuisLeHaut(4)]);
  return notes;
}

/** Le déplacement total entre deux accords, voix par voix du grave vers l'aigu. */
export function mouvementTotal(avant: number[], apres: number[]): number {
  const a = trie(avant), b = trie(apres);
  const n = Math.min(a.length, b.length);
  let somme = 0;
  for (let i = 0; i < n; i++) somme += Math.abs(b[i] - a[i]);
  // Une voix ajoutée ou retirée compte comme un déplacement, sinon changer de nombre de
  // voix paraîtrait gratuit au moment de comparer deux dispositions.
  return somme + Math.abs(a.length - b.length) * 12;
}

/**
 * Les dispositions candidates d'un accord : tous ses renversements, à toutes les octaves
 * qui restent dans le clavier.
 */
export function dispositions(
  accord: number[], graveMin = 36, aiguMax = 96, avecRenversements = true,
): number[][] {
  const base = trie(accord);
  if (base.length === 0) return [];
  const sortie: number[][] = [];
  for (let r = 0; r < (avecRenversements ? base.length : 1); r++) {
    const renverse = renverser(base, r);
    for (let oct = -3; oct <= 3; oct++) {
      const candidat = renverse.map((n) => n + 12 * oct);
      if (candidat[0] >= graveMin && candidat[candidat.length - 1] <= aiguMax) sortie.push(candidat);
    }
  }
  return sortie;
}

/**
 * CONDUITE DES VOIX : chaque accord prend la disposition la plus proche du précédent.
 *
 * Le premier accord est laissé tel quel — c'est lui qui fixe le registre, et le déplacer
 * reviendrait à décider du registre à la place de celui qui a écrit l'accord. La suite est
 * gloutonne : on choisit à chaque pas le moindre mouvement, sans revenir sur les choix
 * passés. Une recherche globale ferait parfois mieux d'un demi-ton, pour un coût
 * exponentiel et un résultat qu'on n'entendrait pas.
 *
 * `avecRenversements` à faux ne déplace les accords que par OCTAVES entières : la
 * disposition choisie ailleurs — un drop 2, un accord ouvert — est alors conservée telle
 * quelle, et la conduite ne fait plus que trouver le bon registre.
 */
export function conduireVoix(
  suite: number[][], graveMin = 36, aiguMax = 96, avecRenversements = true,
): number[][] {
  const sortie: number[][] = [];
  let precedent: number[] | null = null;
  for (const accord of suite) {
    if (!precedent) {
      const premier = trie(accord);
      sortie.push(premier);
      precedent = premier;
      continue;
    }
    const candidats = dispositions(accord, graveMin, aiguMax, avecRenversements);
    if (candidats.length === 0) {
      sortie.push(trie(accord));
      precedent = trie(accord);
      continue;
    }
    let meilleur = candidats[0], cout = Infinity;
    for (const c of candidats) {
      const m = mouvementTotal(precedent, c);
      if (m < cout) { cout = m; meilleur = c; }
    }
    sortie.push(meilleur);
    precedent = meilleur;
  }
  return sortie;
}

/**
 * Applique une disposition aux notes d'un accord, en gardant les départs, les durées et
 * les vélocités : seules les hauteurs changent.
 */
export function remplacerHauteurs(groupe: NoteAccord[], hauteurs: number[]): NoteAccord[] {
  const tri = [...groupe].sort((a, b) => a.note - b.note);
  return hauteurs.map((note, i) => ({ ...(tri[Math.min(i, tri.length - 1)]), note }));
}
