// audio/qualites-accords.ts — Les qualités d'accord, déclarées une fois.
//
// POURQUOI CE MODULE EXISTE, décidé par Fabien : « il faut faire la même chose que pour les
// gammes ». Trois tables d'accords vivaient dans le dépôt, et chacune avait son vocabulaire pour
// les mêmes objets : `accords.ts` disait `maj` et `min` sur dix types, `koch.ts` disait `Majeur` et
// `Mineur` sur cinq, `generation-fractale.ts` disait « Triade M » sur trois. Elles ne se
// contredisaient pas encore ; c'est exactement l'état des gammes avant qu'elles ne se désaccordent.
//
// UNE QUALITÉ N'EST PAS UN ACCORD. La liste dont ce module est né mêlait les deux : douze accords
// majeurs, qui sont douze instances d'une seule qualité, puis tout le reste cité depuis do, qui
// sont des qualités. C'est ce qui faisait que les mineurs n'y étaient que sept sur douze, écrits à
// la main et arrêtés aux notes naturelles. Ici une qualité porte ses intervalles, et les douze
// fondamentales font le reste : trente-trois qualités donnent trois cent quatre-vingt-seize accords.
//
// LES INTERVALLES SONT CEUX QUI SE JOUENT, ET NON L'EMPILEMENT THÉORIQUE. Un accord de onzième se
// joue sans sa tierce, qui frotterait contre la onzième ; un accord de treizième de dominante se
// joue sans sa onzième. Déclarer l'empilement complet obligerait chaque appelant à savoir quoi en
// retirer, et deux appelants n'en retireraient pas la même chose.
//
// CE QUI A ÉTÉ MESURÉ AVANT D'ÉCRIRE. La bibliothèque `tonal` connaît ces trente-trois qualités et
// en accorde vingt-huit. Sur les autres elle se trompe ou choisit : son `7b5b9` garde la quinte
// juste EN PLUS de la quinte bémol, alors que son propre `7b5` la remplace, et un accord de quinte
// bémol à deux quintes n'existe pas ; son `m13` omet la onzième, que l'usage du jazz y met. Dériver
// d'elle aurait donc importé trois accords faux. `qualites-accords.test.ts` la prend en témoin là
// où les deux s'accordent, ce qui garde vingt-huit qualités sans rien coûter.
//
// L'ACCORD ALTÉRÉ N'EST PAS ICI, ET C'EST VOULU. « C7alt » ne désigne pas un jeu de notes fixe :
// sa quinte et sa neuvième sont altérées, dans un sens ou dans l'autre. Les quatre combinaisons
// sont déclarées une par une, et un nom de plus n'ajouterait que l'ambiguïté.

import { degresDeGamme } from "./gammes";
import type { Note } from "./note";

/** Ce à quoi une qualité sert, pour qu'un composant puisse n'en proposer qu'une part. */
export type FamilleAccord = "triade" | "septieme" | "extension" | "altere" | "suspendu";

export interface QualiteAccord {
  /** Le symbole usuel, nettoyé : `s` y remplace le dièse, qu'un identifiant ne porte pas. */
  id: string;
  fr: string;
  en: string;
  /** Ce qui s'accole au nom de la fondamentale : « C », « Cm7 », « C7♯9 ». Vide pour le majeur. */
  symbole: string;
  /** Les intervalles en demi-tons depuis la fondamentale, tels qu'ils se jouent, triés. */
  intervalles: number[];
  familles: FamilleAccord[];
  /** Les noms que les tables d'avant employaient, et qu'un projet enregistré peut porter. */
  alias?: string[];
}

export const QUALITES: QualiteAccord[] = [
  // ── Les triades ──
  { id: "maj", fr: "Majeur", en: "Major", symbole: "", intervalles: [0, 4, 7],
    familles: ["triade"], alias: ["majeur", "Majeur", "Triade M", "major"] },
  { id: "m", fr: "Mineur", en: "Minor", symbole: "m", intervalles: [0, 3, 7],
    familles: ["triade"], alias: ["min", "mineur", "Mineur", "Triade m", "minor"] },
  { id: "dim", fr: "Diminué", en: "Diminished", symbole: "dim", intervalles: [0, 3, 6],
    familles: ["triade"], alias: ["diminue", "Diminué", "diminished"] },
  { id: "aug", fr: "Augmenté", en: "Augmented", symbole: "aug", intervalles: [0, 4, 8],
    familles: ["triade"], alias: ["augmente", "Augmenté", "augmented"] },
  { id: "sus2", fr: "Suspendu 2", en: "Suspended 2nd", symbole: "sus2", intervalles: [0, 2, 7],
    familles: ["triade", "suspendu"] },
  { id: "sus4", fr: "Suspendu 4", en: "Suspended 4th", symbole: "sus4", intervalles: [0, 5, 7],
    familles: ["triade", "suspendu"], alias: ["Sus4"] },

  // ── Les septièmes, et les sixtes qui s'y rangent par l'usage ──
  { id: "7", fr: "Septième de dominante", en: "Dominant 7th", symbole: "7", intervalles: [0, 4, 7, 10],
    familles: ["septieme"], alias: ["Arpège 7", "sept"] },
  { id: "maj7", fr: "Septième majeure", en: "Major 7th", symbole: "maj7", intervalles: [0, 4, 7, 11],
    familles: ["septieme"] },
  { id: "m7", fr: "Mineur septième", en: "Minor 7th", symbole: "m7", intervalles: [0, 3, 7, 10],
    familles: ["septieme"], alias: ["min7"] },
  // LE DEMI-DIMINUÉ EST LE PREMIER ACCORD DE TOUT II-V-I MINEUR, et il manquait à la liste d'origine.
  { id: "m7b5", fr: "Demi-diminué", en: "Half-diminished", symbole: "m7♭5", intervalles: [0, 3, 6, 10],
    familles: ["septieme"], alias: ["min7b5", "demi-diminue"] },
  { id: "dim7", fr: "Diminué septième", en: "Diminished 7th", symbole: "dim7", intervalles: [0, 3, 6, 9],
    familles: ["septieme"] },
  { id: "mmaj7", fr: "Mineur septième majeure", en: "Minor major 7th", symbole: "m(maj7)",
    intervalles: [0, 3, 7, 11], familles: ["septieme"] },
  { id: "6", fr: "Sixte", en: "Sixth", symbole: "6", intervalles: [0, 4, 7, 9], familles: ["septieme"] },
  { id: "m6", fr: "Mineur sixte", en: "Minor sixth", symbole: "m6", intervalles: [0, 3, 7, 9],
    familles: ["septieme"] },
  { id: "7sus4", fr: "Septième suspendue 4", en: "Dominant 7th suspended 4th", symbole: "7sus4",
    intervalles: [0, 5, 7, 10], familles: ["septieme", "suspendu"] },

  // ── Les extensions ──
  { id: "9", fr: "Neuvième de dominante", en: "Dominant 9th", symbole: "9",
    intervalles: [0, 4, 7, 10, 14], familles: ["extension"] },
  { id: "maj9", fr: "Neuvième majeure", en: "Major 9th", symbole: "maj9",
    intervalles: [0, 4, 7, 11, 14], familles: ["extension"] },
  { id: "m9", fr: "Mineur neuvième", en: "Minor 9th", symbole: "m9",
    intervalles: [0, 3, 7, 10, 14], familles: ["extension"] },
  // L'AJOUTÉE NEUVIÈME N'A PAS DE SEPTIÈME : c'est ce qui la sépare de la neuvième de dominante.
  { id: "add9", fr: "Ajoutée neuvième", en: "Added 9th", symbole: "add9",
    intervalles: [0, 4, 7, 14], familles: ["extension"] },
  // LA ONZIÈME SE JOUE SANS SA TIERCE, qui frotterait d'un demi-ton contre elle.
  { id: "11", fr: "Onzième", en: "Eleventh", symbole: "11",
    intervalles: [0, 7, 10, 14, 17], familles: ["extension"] },
  { id: "maj9s11", fr: "Neuvième majeure onzième augmentée", en: "Major 9th sharp 11th",
    symbole: "maj9♯11", intervalles: [0, 4, 7, 11, 14, 18], familles: ["extension"] },
  // SUR UN ACCORD MINEUR LA ONZIÈME RESTE, la tierce mineure ne frottant pas contre elle.
  { id: "m11", fr: "Mineur onzième", en: "Minor 11th", symbole: "m11",
    intervalles: [0, 3, 7, 10, 14, 17], familles: ["extension"] },
  // LA TREIZIÈME DE DOMINANTE SE JOUE SANS SA ONZIÈME, pour la même raison que la onzième perd sa tierce.
  { id: "13", fr: "Treizième de dominante", en: "Dominant 13th", symbole: "13",
    intervalles: [0, 4, 7, 10, 14, 21], familles: ["extension"] },
  { id: "maj13", fr: "Treizième majeure", en: "Major 13th", symbole: "maj13",
    intervalles: [0, 4, 7, 11, 14, 21], familles: ["extension"] },
  { id: "m13", fr: "Mineur treizième", en: "Minor 13th", symbole: "m13",
    intervalles: [0, 3, 7, 10, 14, 17, 21], familles: ["extension"] },

  // ── Les altérés ──
  // LA QUINTE ALTÉRÉE REMPLACE LA QUINTE JUSTE, elle ne s'y ajoute pas : un accord de quinte bémol
  // n'a pas deux quintes. C'est la faute que `tonal` commet sur ses symboles composés.
  { id: "7s9", fr: "Septième neuvième augmentée", en: "Dominant 7th sharp 9th", symbole: "7♯9",
    intervalles: [0, 4, 7, 10, 15], familles: ["altere"] },
  { id: "7b9", fr: "Septième neuvième bémol", en: "Dominant 7th flat 9th", symbole: "7♭9",
    intervalles: [0, 4, 7, 10, 13], familles: ["altere"] },
  { id: "7b5", fr: "Septième quinte bémol", en: "Dominant 7th flat 5th", symbole: "7♭5",
    intervalles: [0, 4, 6, 10], familles: ["altere"] },
  { id: "7s5", fr: "Septième quinte augmentée", en: "Dominant 7th sharp 5th", symbole: "7♯5",
    intervalles: [0, 4, 8, 10], familles: ["altere"] },
  { id: "7b5b9", fr: "Septième quinte bémol neuvième bémol", en: "Dominant 7th flat 5th flat 9th",
    symbole: "7♭5♭9", intervalles: [0, 4, 6, 10, 13], familles: ["altere"] },
  { id: "7s5b9", fr: "Septième quinte augmentée neuvième bémol", en: "Dominant 7th sharp 5th flat 9th",
    symbole: "7♯5♭9", intervalles: [0, 4, 8, 10, 13], familles: ["altere"] },
  { id: "7b5s9", fr: "Septième quinte bémol neuvième augmentée", en: "Dominant 7th flat 5th sharp 9th",
    symbole: "7♭5♯9", intervalles: [0, 4, 6, 10, 15], familles: ["altere"] },
  { id: "7s5s9", fr: "Septième quinte augmentée neuvième augmentée",
    en: "Dominant 7th sharp 5th sharp 9th", symbole: "7♯5♯9", intervalles: [0, 4, 8, 10, 15],
    familles: ["altere"] },
];

const PAR_ID = new Map<string, QualiteAccord>();
for (const q of QUALITES) {
  PAR_ID.set(q.id, q);
  for (const a of q.alias ?? []) PAR_ID.set(a, q);
}

/**
 * La qualité d'un identifiant, ancien nom compris.
 *
 * Rend `undefined` plutôt qu'un défaut : c'est à l'appelant de dire ce qu'il fait d'un identifiant
 * inconnu, et un défaut posé ici le lui cacherait.
 */
export const qualiteDe = (id: string): QualiteAccord | undefined => PAR_ID.get(id);

/** Les intervalles d'un identifiant, ou ceux de `secours` s'il est inconnu. */
export function intervallesDaccord(id: string, secours = "maj"): number[] {
  return (PAR_ID.get(id) ?? PAR_ID.get(secours))!.intervalles;
}

/** Les qualités d'une ou plusieurs familles, dans l'ordre de la table. */
export function qualitesDe(...familles: FamilleAccord[]): QualiteAccord[] {
  return QUALITES.filter((q) => q.familles.some((f) => familles.includes(f)));
}

/**
 * Les qualités nommées, dans l'ordre demandé.
 *
 * Sert aux listes qu'un composant propose : la MEMBRE reste décidée par le composant, les
 * INTERVALLES viennent d'ici. Un identifiant inconnu jette, plutôt que de rendre une liste amputée.
 */
export function qualitesParIds(ids: readonly string[]): QualiteAccord[] {
  return ids.map((id) => {
    const q = PAR_ID.get(id);
    if (!q) throw new Error(`qualité d'accord inconnue : ${id}`);
    return q;
  });
}

/**
 * L'ordre historique d'un composant, suivi de tout ce que la table porte en plus.
 *
 * L'ORDRE NE SE RÉARRANGE PAS, ET C'EST UNE CONTRAINTE DURE. La valeur d'un réglage enregistrée
 * dans un projet ancien se résout PAR POSITION : le libellé retrouvé dans `options` donne
 * l'identifiant de même rang dans `optionIds`. Réordonner une liste ferait donc qu'un projet
 * rouvert désignerait un autre accord, en silence. Voir `audio/gammes.ts`, qui a la même règle et
 * dont une première version l'a enfreinte.
 */
export function completer(historique: readonly string[]): QualiteAccord[] {
  const vus = new Set(qualitesParIds(historique).map((q) => q.id));
  return [...qualitesParIds(historique), ...QUALITES.filter((q) => !vus.has(q.id))];
}

/** Le motif du cantus firmus, qui est la gamme majeure et non un accord. */
export const CANTUS_FIRMUS = (): number[] => degresDeGamme("majeur");

/** Le sens dans lequel les notes d'un accord se succèdent, quand elles ne sonnent pas ensemble. */
export type SensDArpege = "montant" | "descendant" | "aller-retour";

/** La façon dont un accord se fait entendre. */
export type ModeDeJeu = "plaque" | "arpege" | "roule";

/**
 * Les notes d'un accord, en numéros de note, de la plus grave à la plus aiguë.
 *
 * LE RENVERSEMENT MONTE LES NOTES DU BAS D'UNE OCTAVE, une par degré demandé : c'est la définition,
 * et c'est ce qui change la basse sans changer l'accord. Un renversement plus grand que le nombre
 * de notes ne fait que monter l'accord entier, ce qui n'apprend rien : il est ramené au nombre de
 * notes moins une.
 *
 * L'ÉTENDUE REJOUE L'ACCORD DOUZE DEMI-TONS PLUS HAUT, autant de fois que demandé. C'est ce que fait
 * une main qui monte un arpège sur deux octaves.
 *
 * LA FONDAMENTALE FINALE SE POSE AU-DESSUS DE TOUT L'ACCORD, et non à une octave fixe. Une neuvième
 * ou une treizième monte au-delà de l'octave : la fondamentale montée de douze demi-tons y tomberait
 * AU MILIEU, et ne fermerait rien. Elle est donc montée d'autant d'octaves qu'il faut pour passer
 * au-dessus de la note la plus haute, ce qui la rend finale pour tous les accords et non pour les
 * seules triades. Mesuré sur « La 7♯9 », où la neuvième augmentée passe la fondamentale d'un
 * demi-ton.
 *
 * CE QUI SORT DES CENT VINGT-HUIT NOTES EST ÉCARTÉ, et non replié : replier ferait tomber une note
 * trop haute au milieu de l'accord, où elle changerait le renversement sans qu'on l'ait demandé.
 */
export function notesDaccord(
  id: string,
  fondamentale: number,
  octaves = 1,
  renversement = 0,
  fondamentaleFinale = false,
): number[] {
  const intervalles = intervallesDaccord(id);
  const rang = Math.max(0, Math.min(intervalles.length - 1, Math.round(renversement)));
  const renverse = intervalles.map((v, i) => (i < rang ? v + 12 : v)).sort((a, b) => a - b);
  const tours = Math.max(1, Math.round(octaves));
  const notes: number[] = [];
  for (let o = 0; o < tours; o++) for (const v of renverse) notes.push(fondamentale + 12 * o + v);
  if (fondamentaleFinale) {
    const plusHaute = Math.max(...notes) - fondamentale;
    notes.push(fondamentale + 12 * (Math.floor(plusHaute / 12) + 1));
  }
  return notes.filter((n) => n >= 0 && n <= 127).sort((a, b) => a - b);
}

/** Les notes réordonnées par le sens dans lequel on veut les entendre. */
export function dansLeSens(notes: readonly number[], sens: SensDArpege): number[] {
  if (sens === "montant") return [...notes];
  if (sens === "descendant") return [...notes].reverse();
  // L'ALLER-RETOUR NE REJOUE PAS SON SOMMET, comme le parcours d'une gamme : la note la plus haute
  // est atteinte une fois, et la descente repart de la suivante.
  return [...notes, ...[...notes].reverse().slice(1)];
}

/**
 * Les notes d'un accord, datées selon la façon de le jouer.
 *
 * TROIS FAÇONS, ET DEUX AXES SUFFISENT À LES DIRE : l'écart entre les départs, et le sort de chaque
 * note une fois la suivante partie.
 * • Plaqué : les notes partent ensemble et s'arrêtent ensemble.
 * • Arpégé : elles partent l'une après l'autre, chacune relâchée quand la suivante part.
 * • Roulé : elles partent l'une après l'autre et sont TENUES jusqu'au bout. C'est l'arpègement de
 *   la harpe et du piano, la forme décomposée qu'une main peut jouer, et l'accord y sonne entier.
 *
 * L'ÉTALEMENT EST UNE PART DE LA DURÉE, et non un temps en millisecondes : un accord deux fois plus
 * long garde ainsi la même allure. À un, l'arpège remplit exactement la durée.
 *
 * LA FORME RENDUE EST `Note`, LA FORME COMMUNE DU DÉPÔT, et non une quatrième façon de décrire une
 * note datée. `audio/note.ts` la déclare et `formes-note.test.ts` refuse qu'on la recopie.
 */
export function jouerAccord(
  notes: readonly number[],
  mode: ModeDeJeu,
  duree: number,
  etalement = 1,
  velocite = 90,
): Note[] {
  const n = notes.length;
  if (n === 0) return [];
  if (mode === "plaque") return notes.map((note) => ({ note, velocite, debut: 0, fin: duree }));
  const empan = duree * Math.max(0, Math.min(1, etalement));
  if (mode === "arpege") {
    // N notes se partagent l'empan : chacune est relâchée quand la suivante part.
    const pas = empan / n;
    return notes.map((note, i) => ({ note, velocite, debut: i * pas, fin: (i + 1) * pas }));
  }
  // Roulé : N départs, donc N − 1 écarts, et toutes les notes tiennent jusqu'à la fin.
  const pas = n > 1 ? empan / (n - 1) : 0;
  return notes.map((note, i) => ({ note, velocite, debut: i * pas, fin: Math.max(duree, i * pas) }));
}
