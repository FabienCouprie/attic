// audio/matrice-parametres.ts — Une matrice de paramètres pour des centaines d'événements.
//
// CE QUE C'EST. La dernière structure que `COMPOSITION-ASSISTEE.md` laissait ouverte : le
// `class-array` d'OMChroma. On y décrit une synthèse non pas événement par événement mais PARAMÈTRE
// par paramètre : une ligne pour les fréquences, une pour les amplitudes, une pour les durées, et
// chacune vaut pour les cent ou les mille événements d'un coup. C'est la façon dont on écrit une
// synthèse additive de deux cents partiels, qu'aucune liste d'événements ne permet de tenir à la
// main.
//
// LA RÈGLE QUI FAIT TOUT LE CONFORT : UNE LISTE PLUS COURTE SE COMPLÈTE EN RÉPÉTANT SA DERNIÈRE
// VALEUR. Écrire une fréquence pour cent événements en donne cent ; en écrire trois en donne trois
// puis quatre-vingt-dix-sept fois la troisième. Le choix de répéter plutôt que de boucler n'est pas
// indifférent : une liste bouclée fabriquerait une périodicité que personne n'a demandée, et qui
// s'entendrait comme un rythme. La répétition, elle, ne dit rien de plus que ce qui a été écrit.
//
// TROIS FAÇONS D'ÉCRIRE UN CHAMP, et elles se distinguent à la lecture. Un nombre seul vaut pour
// tous ; une suite de nombres donne les premières valeurs et complète comme ci-dessus ; deux
// nombres séparés par deux points décrivent une rampe droite du premier au second, répartie sur les
// événements. La rampe tient la place qu'une courbe tient dans OMChroma, sans demander qu'on en
// branche une pour un simple glissement.
//
// LE NOMBRE D'ÉVÉNEMENTS SE DÉDUIT quand on ne le donne pas : c'est la plus longue des listes
// écrites. Une matrice dont tous les champs sont des constantes n'en a aucun, et ne rend rien
// plutôt que d'en inventer un.

/** Une manière d'écrire un champ. */
export type Champ =
  | { forme: "liste"; valeurs: number[] }
  | { forme: "rampe"; de: number; a: number };

/**
 * Étend une liste au nombre voulu, en répétant sa dernière valeur.
 *
 * Une liste plus longue est tronquée : ce qui dépasse le nombre d'événements ne se joue pas, et le
 * garder donnerait une matrice dont les lignes n'ont pas la même longueur.
 */
export function etendre(valeurs: readonly number[], combien: number): number[] {
  if (combien <= 0) return [];
  if (valeurs.length === 0) return new Array(combien).fill(0);
  const sortie = valeurs.slice(0, combien);
  const derniere = valeurs[valeurs.length - 1];
  while (sortie.length < combien) sortie.push(derniere);
  return sortie;
}

/**
 * Lit un champ écrit à la main.
 *
 * Rend `null` quand rien n'est lisible, ce qui n'est pas la même chose qu'un champ à zéro : un
 * champ illisible doit être signalé, un champ à zéro est une valeur.
 */
export function lireChamp(texte: string): Champ | null {
  const t = String(texte ?? "").trim();
  if (t.length === 0) return null;
  const rampe = /^(-?[\d.]+)\s*:\s*(-?[\d.]+)$/.exec(t);
  if (rampe) {
    const de = Number(rampe[1]), a = Number(rampe[2]);
    if (Number.isFinite(de) && Number.isFinite(a)) return { forme: "rampe", de, a };
    return null;
  }
  const valeurs = t.split(/[\s,;]+/).map(Number).filter((n) => Number.isFinite(n));
  return valeurs.length > 0 ? { forme: "liste", valeurs } : null;
}

/** Les valeurs d'un champ, pour un nombre d'événements donné. */
export function deployer(champ: Champ, combien: number): number[] {
  if (combien <= 0) return [];
  if (champ.forme === "liste") return etendre(champ.valeurs, combien);
  // LA RAMPE COMPTE SES BORNES : à un seul événement elle vaut son départ, et à deux elle donne le
  // départ puis l'arrivée, sans quoi l'arrivée écrite ne serait jamais atteinte.
  if (combien === 1) return [champ.de];
  return Array.from({ length: combien },
    (_, i) => champ.de + ((champ.a - champ.de) * i) / (combien - 1));
}

/** Combien d'événements une liste de champs demande : la plus longue liste écrite. */
export function combienDEvenements(champs: readonly (Champ | null)[]): number {
  let n = 0;
  for (const c of champs) {
    if (c && c.forme === "liste") n = Math.max(n, c.valeurs.length);
  }
  return n;
}

export interface Colonne {
  /** Le rang du champ dans la partition : 4 pour p4, et ainsi de suite. */
  rang: number;
  nom: string;
  champ: Champ;
}

export interface Matrice {
  combien: number;
  /** Les rangs des colonnes, dans l'ordre où elles sont écrites. */
  rangs: number[];
  /** Une ligne par événement, dans l'ordre des rangs. */
  lignes: number[][];
}

/**
 * Déploie les colonnes en une matrice, une ligne par événement.
 *
 * LES COLONNES SONT RANGÉES PAR LEUR RANG, non par l'ordre où on les a écrites : un p-field a une
 * place fixe dans la partition, et l'instrument Csound qui la lit attend p5 en cinquième position
 * quoi qu'il arrive.
 */
export function construireMatrice(colonnes: readonly Colonne[], combien: number): Matrice {
  const triees = [...colonnes].sort((a, b) => a.rang - b.rang);
  const n = Math.max(0, Math.round(combien));
  const deployees = triees.map((c) => deployer(c.champ, n));
  return {
    combien: n,
    rangs: triees.map((c) => c.rang),
    lignes: Array.from({ length: n }, (_, i) => deployees.map((v) => v[i])),
  };
}

export interface OptionsPartition {
  /** Le numéro d'instrument, p1. */
  instrument?: number;
  decimales?: number;
  /** Des lignes de commentaire écrites en tête. */
  entete?: string[];
}

/**
 * Écrit la matrice en partition Csound.
 *
 * LES DEUX PREMIÈRES COLONNES SONT LE DÉPART ET LA DURÉE, p2 et p3, et elles ne sont pas des champs
 * comme les autres : Csound les attend à cette place et les interprète lui-même. Elles sont donc
 * données à part plutôt que rangées parmi les rangs, où l'on pourrait les oublier.
 */
export function matriceVersPartition(
  debuts: readonly number[], durees: readonly number[], m: Matrice, o: OptionsPartition = {},
): string {
  const instrument = Math.max(1, Math.round(o.instrument ?? 1));
  const d = Math.max(0, Math.min(6, Math.round(o.decimales ?? 4)));
  const nombre = (x: number) => (Number.isFinite(x) ? x.toFixed(d) : "0");
  const lignes = [...(o.entete ?? []).map((l) => `; ${l}`)];
  for (let i = 0; i < m.combien; i++) {
    const reste = m.lignes[i] ?? [];
    lignes.push(
      `i${instrument} ${nombre(debuts[i] ?? 0)} ${nombre(durees[i] ?? 0)}`
      + (reste.length > 0 ? " " + reste.map(nombre).join(" ") : ""),
    );
  }
  return lignes.join("\n");
}
