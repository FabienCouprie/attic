// audio/gammes.ts — Les gammes, déclarées une fois.
//
// POURQUOI CE MODULE EXISTE, relevé par Fabien : « les gammes de la boîte à groove et du générateur
// musical ne sont pas alignées et il n'y a aucune raison pour cela ». Il y en avait sept listes
// indépendantes, et le même savoir écrit sept fois ne reste pas d'accord. Le compte allait de deux
// gammes à onze selon le composant, et **la même gamme portait quatre orthographes** : la
// pentatonique majeure s'appelait `pentatonique-majeure`, `penta-majeure`, `pentatonique`, et
// `pentatonique majeur` avec une espace. Un commentaire d'un de ces fichiers relevait déjà que deux
// listes « s'étaient désaccordées et cachaient deux gammes ».
//
// CE QUI MANQUAIT, et qu'il a nommé. « Diminué » n'existait dans tout le dépôt que comme ACCORD,
// jamais comme gamme : les deux octatoniques manquaient, donc tout le vocabulaire diminué du jazz.
// L'altérée manquait aussi, celle qu'on emploie sur un accord de neuvième augmentée. Et avec elles
// la gamme par tons, la mineure mélodique, la lydienne dominante, la phrygienne dominante et la
// bebop dominante — c'est-à-dire la moitié du matériau modal d'après 1940.
//
// LES ANCIENNES ORTHOGRAPHES SONT DES ALIAS, ET IL LE FAUT : la valeur d'un réglage est enregistrée
// dans le projet. Renommer sans alias ferait qu'un graphe rouvert retomberait en silence sur la
// gamme par défaut, ce qui change la musique sans rien dire.

// CE QUI TIENT ICI, ET CE QUI N'Y TIENT PAS. Cette table est en DEMI-TONS : elle ne porte que ce que
// le tempérament égal sait écrire. Les maqamat, les ragas et les gammes de gamelan n'y tiennent pas,
// leurs degrés se mesurant en cents — ils vivent dans `gammes-monde.ts`, et l'en-tête de ce
// fichier-là dit pourquoi. Les pentatoniques japonaises et les gammes à seconde augmentée, elles,
// tombent bien sur les douze demi-tons : leur place est ici.

/** Ce à quoi une gamme sert, pour qu'un composant puisse n'en proposer qu'une part. */
export type FamilleGamme =
  | "modale" | "pentatonique" | "jazz" | "symetrique" | "exotique" | "chromatique";

export interface Gamme {
  id: string;
  fr: string;
  en: string;
  /** Les degrés en demi-tons depuis la tonique, dans une octave, triés. */
  degres: number[];
  familles: FamilleGamme[];
  /** Les orthographes qu'un projet enregistré peut porter. */
  alias?: string[];
}

export const GAMMES: Gamme[] = [
  // ── Les sept modes, et les deux mineures d'usage ──
  // LES DEUX PREMIERS PORTENT LEUR NOM MODAL EN ALIAS : le majeur EST l'ionien et le mineur naturel
  // EST l'éolien. Les cinq autres modes sont listés sous leur nom grec, et qui les cherche tous les
  // sept doit trouver les sept, sans avoir à savoir que deux d'entre eux ont un second nom.
  { id: "majeur", fr: "Majeur", en: "Major", degres: [0, 2, 4, 5, 7, 9, 11],
    familles: ["modale"], alias: ["majeure", "ionien"] },
  { id: "mineur", fr: "Mineur naturel", en: "Natural minor", degres: [0, 2, 3, 5, 7, 8, 10],
    familles: ["modale"], alias: ["mineure", "eolien"] },
  { id: "dorien", fr: "Dorien", en: "Dorian", degres: [0, 2, 3, 5, 7, 9, 10], familles: ["modale"] },
  { id: "phrygien", fr: "Phrygien", en: "Phrygian", degres: [0, 1, 3, 5, 7, 8, 10], familles: ["modale"] },
  { id: "lydien", fr: "Lydien", en: "Lydian", degres: [0, 2, 4, 6, 7, 9, 11], familles: ["modale"] },
  { id: "mixolydien", fr: "Mixolydien", en: "Mixolydian", degres: [0, 2, 4, 5, 7, 9, 10], familles: ["modale"] },
  { id: "locrien", fr: "Locrien", en: "Locrian", degres: [0, 1, 3, 5, 6, 8, 10], familles: ["modale"] },
  { id: "mineur-harmonique", fr: "Mineur harmonique", en: "Harmonic minor", degres: [0, 2, 3, 5, 7, 8, 11],
    familles: ["modale"], alias: ["mineure-harmonique"] },
  // LA MINEURE MÉLODIQUE MANQUAIT, et c'est elle qui engendre l'altérée et la lydienne dominante :
  // sans elle, tout un pan du vocabulaire n'avait pas de racine dans le dépôt.
  { id: "mineur-melodique", fr: "Mineur mélodique", en: "Melodic minor", degres: [0, 2, 3, 5, 7, 9, 11],
    familles: ["modale", "jazz"] },

  // ── Les pentatoniques ──
  { id: "pentatonique-majeure", fr: "Pentatonique majeure", en: "Major pentatonic", degres: [0, 2, 4, 7, 9],
    familles: ["pentatonique"], alias: ["penta-majeure", "pentatonique", "pentatonique majeur"] },
  { id: "pentatonique-mineure", fr: "Pentatonique mineure", en: "Minor pentatonic", degres: [0, 3, 5, 7, 10],
    familles: ["pentatonique"], alias: ["penta-mineure", "pentatonique mineur"] },

  // ── Le vocabulaire du jazz ──
  { id: "blues", fr: "Blues", en: "Blues", degres: [0, 3, 5, 6, 7, 10], familles: ["jazz", "pentatonique"] },
  // L'ALTÉRÉE EST CELLE DE LA NEUVIÈME AUGMENTÉE, septième mode de la mineure mélodique : sur un
  // accord de septième, son troisième degré est la neuvième augmentée, et elle porte aussi la
  // quinte diminuée et la quinte augmentée.
  { id: "alteree", fr: "Altérée", en: "Altered", degres: [0, 1, 3, 4, 6, 8, 10], familles: ["jazz"] },
  // Quatrième mode de la mineure mélodique : la quarte augmentée sur une septième mineure.
  { id: "lydien-dominant", fr: "Lydien dominant", en: "Lydian dominant", degres: [0, 2, 4, 6, 7, 9, 10],
    familles: ["jazz", "modale"] },
  // Cinquième mode de la mineure harmonique. Le nom espagnol ou klezmer de la même échelle.
  { id: "phrygien-dominant", fr: "Phrygien dominant", en: "Phrygian dominant", degres: [0, 1, 4, 5, 7, 8, 10],
    familles: ["jazz", "modale"] },
  // Le mixolydien avec sa septième majeure de passage : huit degrés, donc une note par croche sur
  // une mesure à quatre temps, ce qui est sa raison d'être.
  { id: "bebop-dominant", fr: "Bebop dominante", en: "Bebop dominant", degres: [0, 2, 4, 5, 7, 9, 10, 11],
    familles: ["jazz"] },

  // ── Les symétriques ──
  { id: "ton-entier", fr: "Par tons", en: "Whole tone", degres: [0, 2, 4, 6, 8, 10], familles: ["symetrique"] },
  // LES DEUX OCTATONIQUES, et elles ne se confondent pas : celle qui commence par un ton se pose sur
  // un accord diminué, celle qui commence par un demi-ton sur une septième à neuvième altérée.
  { id: "diminuee-ton-demi", fr: "Diminuée ton, demi-ton", en: "Diminished whole-half",
    degres: [0, 2, 3, 5, 6, 8, 9, 11], familles: ["symetrique", "jazz"] },
  { id: "diminuee-demi-ton", fr: "Diminuée demi-ton, ton", en: "Diminished half-whole",
    degres: [0, 1, 3, 4, 6, 7, 9, 10], familles: ["symetrique", "jazz"] },
  // L'AUGMENTÉE ALTERNE UNE TIERCE MINEURE ET UN DEMI-TON, six notes : c'est la troisième symétrie
  // possible dans l'octave, après les tons et le diminué.
  { id: "augmentee", fr: "Augmentée", en: "Augmented", degres: [0, 3, 4, 7, 8, 11],
    familles: ["symetrique"] },

  // ── Ce qui tient dans les douze demi-tons sans venir de l'Occident ──
  //
  // LES GAMMES À SECONDE AUGMENTÉE, dont l'intervalle d'une tierce mineure entre deux degrés voisins
  // fait toute la couleur. La majeure en porte deux, d'où son autre nom de double harmonique.
  { id: "double-seconde-augmentee", fr: "Double seconde augmentée", en: "Double harmonic major",
    degres: [0, 1, 4, 5, 7, 8, 11], familles: ["exotique"], alias: ["byzantine"] },
  { id: "hongroise-mineure", fr: "Hongroise mineure", en: "Hungarian minor",
    degres: [0, 2, 3, 6, 7, 8, 11], familles: ["exotique"] },
  // LES DEUX PENTATONIQUES JAPONAISES tombent sur les douze demi-tons, à la différence des maqamat
  // et des ragas : leur place est donc ici et non dans les gammes mesurées en cents.
  { id: "hirajoshi", fr: "Hirajōshi", en: "Hirajoshi", degres: [0, 2, 3, 7, 8],
    familles: ["exotique", "pentatonique"] },
  { id: "in-sen", fr: "In sen", en: "In sen", degres: [0, 1, 5, 7, 10],
    familles: ["exotique", "pentatonique"] },

  // ── Et le total ──
  { id: "chromatique", fr: "Chromatique", en: "Chromatic",
    degres: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], familles: ["chromatique"] },
];

const PAR_ID = new Map<string, Gamme>();
for (const g of GAMMES) {
  PAR_ID.set(g.id, g);
  for (const a of g.alias ?? []) PAR_ID.set(a, g);
}

/**
 * La gamme d'un identifiant, ancienne orthographe comprise.
 *
 * Rend `undefined` plutôt qu'un défaut : c'est à l'appelant de dire ce qu'il fait d'un identifiant
 * inconnu, et un défaut posé ici le lui cacherait.
 */
export const gammeDe = (id: string): Gamme | undefined => PAR_ID.get(id);

/** Les degrés d'un identifiant, ou ceux de `secours` s'il est inconnu. */
export function degresDeGamme(id: string, secours = "majeur"): number[] {
  return (PAR_ID.get(id) ?? PAR_ID.get(secours))!.degres;
}

/** Les gammes d'une ou plusieurs familles, dans l'ordre de la table. */
export function gammesDe(...familles: FamilleGamme[]): Gamme[] {
  return GAMMES.filter((g) => g.familles.some((f) => familles.includes(f)));
}

/**
 * Les gammes nommées, dans l'ordre demandé.
 *
 * Sert aux listes qu'un composant propose : la MEMBRE reste décidée par le composant, les DEGRÉS
 * viennent d'ici. Un identifiant inconnu jette, plutôt que de rendre une liste amputée en silence.
 */
export function gammesParIds(ids: readonly string[]): Gamme[] {
  return ids.map((id) => {
    const g = PAR_ID.get(id);
    if (!g) throw new Error(`gamme inconnue : ${id}`);
    return g;
  });
}

/**
 * Les libellés que les listes de gammes ont portés avant cette table, et ce qu'ils désignaient.
 *
 * SIX COMPOSANTS LES ÉCRIVAIENT EN CLAIR, et pas de la même façon : la pentatonique majeure
 * s'appelait « pentatonique majeur » sans e chez trois d'entre eux, « Pentatonique majeure » chez
 * trois autres, et la chromatique s'écrivait « chromatonic » en anglais, par faute de frappe. Le
 * mineur naturel se disait « minor » ici et « Natural minor » là. Rien de tout cela ne peut se
 * deviner : c'est déclaré, pour qu'un projet enregistré retrouve sa gamme.
 */
export const LIBELLES_HERITES_GAMMES: Record<string, string> = {
  // Les libellés français d'avant, en minuscules et sans accord.
  "majeur": "majeur", "mineur": "mineur", "dorien": "dorien", "phrygien": "phrygien",
  "lydien": "lydien", "mixolydien": "mixolydien", "locrien": "locrien",
  "pentatonique majeur": "pentatonique-majeure", "pentatonique mineur": "pentatonique-mineure",
  "blues": "blues", "chromatique": "chromatique",
  // Les libellés français capitalisés des composants de mélodie.
  "Majeur": "majeur", "Mineur naturel": "mineur", "Mineur harmonique": "mineur-harmonique",
  "Pentatonique majeure": "pentatonique-majeure", "Pentatonique mineure": "pentatonique-mineure",
  "Chromatique": "chromatique",
  // Les libellés anglais d'avant, dont la faute de frappe sur la chromatique.
  "major": "majeur", "minor": "mineur", "dorian": "dorien", "phrygian": "phrygien",
  "lydian": "lydien", "mixolydian": "mixolydien", "locrian": "locrien",
  "major pentatonic": "pentatonique-majeure", "minor pentatonic": "pentatonique-mineure",
  "chromatic": "chromatique", "chromatonic": "chromatique",
  "Major": "majeur", "Natural minor": "mineur", "Harmonic minor": "mineur-harmonique",
  "Major pentatonic": "pentatonique-majeure", "Minor pentatonic": "pentatonique-mineure",
  "Chromatic": "chromatique",
};

/**
 * L'ordre historique d'un composant, suivi de tout ce que la table porte en plus.
 *
 * L'ORDRE NE SE RÉARRANGE PAS, ET C'EST UNE CONTRAINTE DURE. La valeur d'un réglage enregistrée dans
 * un projet ancien se résout PAR POSITION : le libellé retrouvé dans `options` donne l'identifiant de
 * même rang dans `optionIds`. Réordonner une liste ferait donc qu'un projet rouvert désignerait une
 * autre gamme, en silence. `optionIds-retrocompat.test.ts` garde cette porte, et c'est lui qui a
 * relevé la faute quand une première version de cette table a réordonné les listes.
 *
 * Chaque composant garde donc sa suite d'origine, et les gammes ajoutées viennent APRÈS.
 */
export function completer(historique: readonly string[]): Gamme[] {
  const vus = new Set(gammesParIds(historique).map((g) => g.id));
  return [...gammesParIds(historique), ...GAMMES.filter((g) => !vus.has(g.id))];
}

/** Le sens dans lequel une gamme se parcourt. */
export type SensDeParcours = "montante" | "descendante" | "aller-retour";

/**
 * Les notes d'une gamme, une à une, depuis une tonique donnée en numéro de note.
 *
 * LA TONIQUE FINALE FERME LE PARCOURS, et c'est pour cela qu'elle est jouée par défaut : une gamme
 * qui s'arrête sur son septième degré est entendue comme une phrase interrompue. Elle se coupe pour
 * qui enchaîne deux parcours, où elle ferait une note doublée à la jointure.
 *
 * L'ALLER-RETOUR NE REJOUE PAS SON SOMMET. La note la plus haute est atteinte une fois, puis la
 * descente repart de la suivante : c'est ainsi qu'on travaille une gamme au clavier, et c'est aussi
 * ce qui garde au parcours une durée régulière d'un bout à l'autre.
 *
 * CE QUI SORT DES CENT VINGT-HUIT NOTES EST ÉCARTÉ, et non ramené dans l'ambitus : replier une note
 * trop haute la ferait tomber au milieu du parcours, où elle s'entendrait comme une faute.
 */
export function parcoursDeGamme(
  id: string,
  tonique: number,
  octaves = 1,
  sens: SensDeParcours = "montante",
  toniqueFinale = true,
): number[] {
  const degres = degresDeGamme(id);
  const tours = Math.max(1, Math.round(octaves));
  const montante: number[] = [];
  for (let o = 0; o < tours; o++) for (const d of degres) montante.push(tonique + 12 * o + d);
  if (toniqueFinale) montante.push(tonique + 12 * tours);
  const jouable = (h: number) => h >= 0 && h <= 127;
  if (sens === "montante") return montante.filter(jouable);
  const descendante = [...montante].reverse();
  if (sens === "descendante") return descendante.filter(jouable);
  return [...montante, ...descendante.slice(1)].filter(jouable);
}

/**
 * Ce qu'un composant NOUVEAU propose, ou celui dont la liste tenait dans le début de la table.
 *
 * C'EST LA LISTE COMMUNE, demandée par Fabien : « nous devons homogénéiser au maximum ces gammes et
 * pas seulement sur ces deux nœuds ». Un composant qui offre un choix de gamme offre celui-ci, sauf
 * raison écrite à côté de lui.
 */
export const GAMMES_USUELLES: Gamme[] = GAMMES;
