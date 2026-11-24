// audio/choral-verifier.ts — Vérifier un choral à quatre voix, et nommer chaque faute à sa place.
//
// LE PREMIER JUGE À QUATRE VOIX DU DÉPÔT. `audio/contrepoint.ts` juge deux voix note contre note ;
// celui-ci juge un choral entier, à rythme libre, par tranches (`audio/choral-tranches.ts`), sur les
// règles de `audio/choral-regles.ts`, que l'harmoniseur emploiera aussi.
//
// CHAQUE RÈGLE PORTE SON DÉNOMINATEUR : le nombre de fois où elle a pu être jugée. « Deux quintes
// parallèles » ne dit rien sans « sur trois cents mouvements de paires » ; et une règle jugée zéro
// fois n'a rien prouvé, ce que le rapport doit montrer au lieu de le taire.
//
// LES TESSITURES SONT CELLES DE BACH (`audio/tessitures-satb.ts`) : une note hors de l'étendue qu'il a
// employée est une erreur, une note hors de son étendue usuelle un avis.
//
// LA DERNIÈRE TRANCHE ADMET LA TIERCE PICARDE. Un choral en mineur finit souvent sur l'accord majeur
// de la tonique, chez Bach comme dans l'usage : le juger hors de la tonalité ferait une faute de ce
// qui est une manière de finir. Le dorien et le phrygien l'admettent de même : 32 des 37 chorals que
// Sapp écrit dorien finissent sur l'accord majeur de leur tonique, et les 25 fins phrygiennes de Bach
// sur celui de leur finale (relevé du 2026-11-24).
//
// LA CADENCE SUIT LE MODE, décisions de Fabien du 2026-11-24. En dorien et en mixolydien, l'avant-
// dernier temps est la dominante avec sa sensible ou la sous-dominante : chez Bach, aucun v ni ♭VII
// n'y est lu. En phrygien, qui n'a pas de sensible, c'est le quatrième, le septième, le deuxième ou le
// cinquième degré : la mineur, ré mineur, fa majeur ou si diminué avant la finale mi
// (`avantDernierePermise`, que l'harmoniseur emploie aussi).

import type { Sequence } from "./sequence";
import { nomNote } from "./nom-note";
import { tranchesDuChoral, VOIX_CHORAL, voixEnTrop, type Tranche } from "./choral-tranches";
import {
  avantDernierePermise, consecutive, directe, lireAccord, sautFautif, sensibleDe, tierceMineure, type AccordLu, type ModeChoral,
} from "./choral-regles";
import { NOMS_SATB, TESSITURES_SATB } from "./tessitures-satb";

export type RegleChoral =
  | "tessiture" | "croisement" | "ecart" | "depassement" | "quintes" | "octaves" | "consecutives"
  | "directes" | "saut" | "hors-tonalite" | "accord-sans-tierce" | "sensible-doublee"
  | "sensible-non-resolue" | "septieme-non-resolue" | "cadence";

/** Les règles, dans l'ordre du rapport, et leur nom dans les deux langues. */
export const REGLES_CHORAL: readonly { id: RegleChoral; fr: string; en: string }[] = [
  { id: "tessiture", fr: "tessitures", en: "ranges" },
  { id: "croisement", fr: "croisements", en: "crossings" },
  { id: "ecart", fr: "écarts", en: "spacing" },
  { id: "depassement", fr: "dépassements", en: "overlaps" },
  { id: "quintes", fr: "quintes parallèles", en: "parallel fifths" },
  { id: "octaves", fr: "octaves parallèles", en: "parallel octaves" },
  { id: "consecutives", fr: "consécutives par mouvement contraire", en: "consecutives by contrary motion" },
  { id: "directes", fr: "quintes et octaves directes", en: "direct fifths and octaves" },
  { id: "saut", fr: "sauts mélodiques", en: "melodic leaps" },
  { id: "hors-tonalite", fr: "temps hors des accords de la tonalité", en: "beats outside the key's chords" },
  { id: "accord-sans-tierce", fr: "accords sans tierce", en: "chords without a third" },
  { id: "sensible-doublee", fr: "sensible doublée", en: "doubled leading tone" },
  { id: "sensible-non-resolue", fr: "sensible non résolue", en: "unresolved leading tone" },
  { id: "septieme-non-resolue", fr: "septième non résolue", en: "unresolved seventh" },
  { id: "cadence", fr: "cadence finale", en: "final cadence" },
];

export interface InfractionChoral {
  regle: RegleChoral;
  gravite: "erreur" | "avis";
  debut: number;
  mesure: number;
  temps: number;
  /** Les voix en cause, 0 soprano à 3 basse. */
  voix: number[];
  fr: string;
  en: string;
}

export interface VerdictChoral {
  infractions: InfractionChoral[];
  /** Combien de fois chaque règle a pu être jugée. */
  jugees: Record<RegleChoral, number>;
  tranches: number;
  recouvertes: number;
}

export interface RefusChoral { voixEnTrop: number[]; voixAbsentes: number[] }

export interface OptionsChoral { tonique: number; mode: ModeChoral; tempo: number; tempsParMesure: number; anacrouse?: number }

const nomVoix = (v: number) => NOMS_SATB[v];
const paire = (i: number, j: number) => ({ fr: `${nomVoix(i).fr}–${nomVoix(j).fr}`, en: `${nomVoix(i).en}–${nomVoix(j).en}` });
const pc = (h: number) => ((Math.round(h) % 12) + 12) % 12;

/** Vérifie un choral, ou dit pourquoi il ne se vérifie pas. */
export function verifierChoral(seq: Sequence, o: OptionsChoral): VerdictChoral | RefusChoral {
  const enTrop = voixEnTrop(seq);
  const presentes = new Set(seq.notes.map((n) => n.voix ?? 0));
  const absentes = [0, 1, 2, 3].filter((v) => !presentes.has(v));
  if (enTrop.length > 0 || absentes.length > 0) return { voixEnTrop: enTrop, voixAbsentes: absentes };

  const { tranches, lignes, recouvertes } = tranchesDuChoral(seq, o.tempo, o.tempsParMesure, o.anacrouse ?? 0);
  const jugees = Object.fromEntries(REGLES_CHORAL.map((r) => [r.id, 0])) as Record<RegleChoral, number>;
  const infractions: InfractionChoral[] = [];
  const noter = (regle: RegleChoral, gravite: "erreur" | "avis", t: Tranche, voix: number[], fr: string, en: string) =>
    infractions.push({ regle, gravite, debut: t.debut, mesure: t.mesure, temps: t.temps, voix, fr, en });
  const tranchePour = (debut: number) => tranches.find((t) => Math.abs(t.debut - debut) < 1e-9)!;

  // Les tessitures et les sauts, note par note dans chaque voix.
  for (let v = 0; v < VOIX_CHORAL; v++) {
    const { entiere, usuelle } = TESSITURES_SATB[v];
    lignes[v].forEach((n, k) => {
      jugees.tessiture++;
      const t = tranchePour(n.debut);
      if (n.note < entiere[0] || n.note > entiere[1]) {
        noter("tessiture", "erreur", t, [v], `${nomVoix(v).fr} ${nomNote(n.note)} hors de l'étendue de Bach`, `${nomVoix(v).en} ${nomNote(n.note)} outside Bach's range`);
      } else if (n.note < usuelle[0] || n.note > usuelle[1]) {
        noter("tessiture", "avis", t, [v], `${nomVoix(v).fr} ${nomNote(n.note)} rare chez Bach`, `${nomVoix(v).en} ${nomNote(n.note)} rare in Bach`);
      }
      if (k === 0) return;
      jugees.saut++;
      const avant = lignes[v][k - 1];
      const s = sautFautif(avant.note, n.note, o.tonique, o.mode);
      if (!s) return;
      const de = `${nomNote(avant.note)} → ${nomNote(n.note)}`;
      const textes = {
        "plus-d-une-octave": ["saut de plus d'une octave", "leap of more than an octave", "erreur"],
        "seconde-augmentee": ["seconde augmentée", "augmented second", "erreur"],
        triton: ["saut de triton", "tritone leap", "avis"],
        septieme: ["saut de septième", "leap of a seventh", "avis"],
      }[s];
      noter("saut", textes[2] as "erreur" | "avis", t, [v], `${nomVoix(v).fr} ${de} : ${textes[0]}`, `${nomVoix(v).en} ${de}: ${textes[1]}`);
    });
  }

  tranches.forEach((t, k) => {
    const h = t.hauteurs;
    // Croisements et écarts, dans la tranche.
    for (let v = 0; v < VOIX_CHORAL - 1; v++) {
      const a = h[v];
      const b = h[v + 1];
      if (a === null || b === null) continue;
      jugees.croisement++;
      if (a < b) noter("croisement", "erreur", t, [v, v + 1], `${paire(v, v + 1).fr} croisés`, `${paire(v, v + 1).en} crossed`);
      jugees.ecart++;
      const limite = v < 2 ? 12 : 19;
      if (a - b > limite) {
        noter("ecart", v < 2 ? "erreur" : "avis", t, [v, v + 1],
          `${paire(v, v + 1).fr} à plus ${v < 2 ? "d'une octave" : "d'une douzième"}`,
          `${paire(v, v + 1).en} more than ${v < 2 ? "an octave" : "a twelfth"} apart`);
      }
    }
    if (k === 0) return;
    const p = tranches[k - 1].hauteurs;
    // Dépassements : une voix qui attaque au-delà de la note que sa voisine tenait juste avant.
    for (let v = 0; v < VOIX_CHORAL; v++) {
      const x = h[v];
      if (x === null || !t.attaques[v] || p[v] === x) continue;
      for (const w of [v - 1, v + 1]) {
        if (w < 0 || w >= VOIX_CHORAL || p[w] === null) continue;
        jugees.depassement++;
        if ((w < v && x > p[w]!) || (w > v && x < p[w]!)) {
          noter("depassement", "avis", t, [v, w], `${nomVoix(v).fr} dépasse ${nomVoix(w).fr}`, `${nomVoix(v).en} overlaps ${nomVoix(w).en}`);
        }
      }
    }
    // Consécutives et directes, entre la tranche précédente et celle-ci.
    for (let i = 0; i < VOIX_CHORAL; i++) {
      for (let j = i + 1; j < VOIX_CHORAL; j++) {
        const [a1, a2, b1, b2] = [p[i], h[i], p[j], h[j]];
        if (a1 === null || a2 === null || b1 === null || b2 === null || a1 === a2 || b1 === b2) continue;
        jugees.quintes++; jugees.octaves++; jugees.consecutives++;
        const c = consecutive(a1, a2, b1, b2);
        const de = `${nomNote(a1)}/${nomNote(b1)} → ${nomNote(a2)}/${nomNote(b2)}`;
        if (c === "quintes") noter("quintes", "erreur", t, [i, j], `${paire(i, j).fr} : quintes parallèles ${de}`, `${paire(i, j).en}: parallel fifths ${de}`);
        else if (c === "octaves") noter("octaves", "erreur", t, [i, j], `${paire(i, j).fr} : octaves parallèles ${de}`, `${paire(i, j).en}: parallel octaves ${de}`);
        else if (c) noter("consecutives", "avis", t, [i, j], `${paire(i, j).fr} : ${c === "quintes-contraires" ? "quintes" : "octaves"} par mouvement contraire ${de}`, `${paire(i, j).en}: ${c === "quintes-contraires" ? "fifths" : "octaves"} by contrary motion ${de}`);
        if (i === 0 && j === 3) {
          jugees.directes++;
          const d = directe(a1, a2, b1, b2);
          if (d) noter("directes", "avis", t, [0, 3], `${paire(0, 3).fr} : ${d} directe ${de}`, `${paire(0, 3).en}: direct ${d === "quinte" ? "fifth" : "octave"} ${de}`);
        }
      }
    }
  });

  // Les règles d'accord, sur les seules tranches du temps.
  const temps = tranches.filter((t) => t.surLeTemps && t.hauteurs.filter((x) => x !== null).length >= 3);
  const sensible = sensibleDe(o.tonique);
  const accords: (AccordLu | null)[] = temps.map((t, k) => {
    const sonnantes = t.hauteurs.filter((x): x is number => x !== null);
    const accord = lireAccord(sonnantes, o.tonique, o.mode);
    const picarde = k === temps.length - 1 && tierceMineure(o.mode) && estTierceDePicardie(sonnantes, o.tonique);
    jugees["hors-tonalite"]++;
    if (!accord && !picarde) {
      const notes = sonnantes.map((x) => nomNote(x)).join(" ");
      noter("hors-tonalite", "avis", t, [], `${notes} : aucun accord de la tonalité`, `${notes}: no chord of the key`);
    }
    if (accord) {
      jugees["accord-sans-tierce"]++;
      if (accord.sansTierce) noter("accord-sans-tierce", "avis", t, [], "accord sans tierce", "chord without a third");
      // LA SENSIBLE NE SE JUGE QUE DANS L'ACCORD QUI LA PORTE : le v du dorien et du mixolydien, et
      // toute la dominante du phrygien, n'en ont pas.
      if ((accord.degre === 4 || accord.degre === 6) && accord.sensible) {
        jugees["sensible-doublee"]++;
        const porteuses = [0, 1, 2, 3].filter((v) => t.hauteurs[v] !== null && pc(t.hauteurs[v]!) === sensible);
        if (porteuses.length >= 2) noter("sensible-doublee", "erreur", t, porteuses, `sensible ${nomNote(t.hauteurs[porteuses[0]]!)} doublée`, `leading tone ${nomNote(t.hauteurs[porteuses[0]]!)} doubled`);
      }
    }
    return picarde ? { degre: 0, racine: pc(o.tonique), septieme: pc(o.tonique + 11), sensible: false, avecSeptieme: false, sansTierce: false, sansFondamentale: false, etatFondamental: pc(Math.min(...sonnantes)) === pc(o.tonique) } : accord;
  });
  for (let k = 1; k < temps.length; k++) {
    const [a1, a2] = [accords[k - 1], accords[k]];
    const [t1, t2] = [temps[k - 1], temps[k]];
    if (a1 && a2 && (a1.degre === 4 || a1.degre === 6) && a1.sensible && a2.degre === 0) {
      for (let v = 0; v < VOIX_CHORAL; v++) {
        const [x1, x2] = [t1.hauteurs[v], t2.hauteurs[v]];
        if (x1 === null || x2 === null || pc(x1) !== sensible) continue;
        jugees["sensible-non-resolue"]++;
        if (x2 - x1 === 1) continue;
        const versLaQuinte = pc(x2) === pc(o.tonique + 7) && x1 - x2 >= 3 && x1 - x2 <= 4;
        if (v === 0 || v === 3) noter("sensible-non-resolue", "erreur", t1, [v], `${nomVoix(v).fr} : sensible ${nomNote(x1)} ne monte pas à la tonique`, `${nomVoix(v).en}: leading tone ${nomNote(x1)} does not rise to the tonic`);
        else if (!versLaQuinte) noter("sensible-non-resolue", "avis", t1, [v], `${nomVoix(v).fr} : sensible ${nomNote(x1)} ni résolue ni descendue à la quinte`, `${nomVoix(v).en}: leading tone ${nomNote(x1)} neither resolved nor dropped to the fifth`);
      }
    }
    // UNE SEPTIÈME NE SE JUGE QUE DANS UN ACCORD QUI PORTE SA FONDAMENTALE. Relevé le 2026-11-22 sur les
    // chorals de Sapp : en la mineur, mi, sol et si, le v naturel que Bach emploie, ne sont un accord
    // de la tonalité que comme III7 sans sa fondamentale, et le si y devenait une septième à résoudre.
    // ET ELLE SE JUGE SUR LA NOTE QUI LA SUIT DANS SA VOIX, QUAND L'ACCORD CHANGE. Relevé le même jour :
    // comparée au temps suivant, elle tombait en faute quand Bach la résout par une croche, ou la fait
    // passer à une autre note du même accord prolongé.
    if (a1?.avecSeptieme && !a1.sansFondamentale && a2?.degre !== a1.degre) {
      for (let v = 0; v < VOIX_CHORAL; v++) {
        const x1 = t1.hauteurs[v];
        if (x1 === null || !estSeptiemeDe(x1, a1)) continue;
        const ligne = lignes[v];
        const ici = ligne.findIndex((n) => n.debut <= t1.debut + 1e-9 && n.fin > t1.debut + 1e-9);
        const suivante = ligne[ici + 1];
        if (!suivante) continue;
        jugees["septieme-non-resolue"]++;
        const d = suivante.note - x1;
        if (d === 0 || d === -1 || d === -2) continue;
        noter("septieme-non-resolue", "erreur", t1, [v], `${nomVoix(v).fr} : septième ${nomNote(x1)} → ${nomNote(suivante.note)}, au lieu de descendre d'un degré`, `${nomVoix(v).en}: seventh ${nomNote(x1)} → ${nomNote(suivante.note)}, instead of falling a step`);
      }
    }
  }
  // La cadence finale : la tonique à l'état fondamental, précédée de ce que le mode permet.
  if (temps.length >= 2) {
    jugees.cadence++;
    const [fin, avant] = [accords[temps.length - 1], accords[temps.length - 2]];
    const t = temps[temps.length - 1];
    // LA FIN SUR LA DOMINANTE D'UN MINEUR EST UN AVIS, ET NON UNE ERREUR. Relevé le 2026-11-22 : des 30
    // chorals de Sapp que la règle condamnait, les premiers lus finissent tous sur l'accord majeur de la
    // dominante, en mineur ou en dorien : la cadence phrygienne des chorals modaux. Le dorien la garde
    // donc en avis, sur la dominante qui prend la sensible ; le phrygien, qui la lit sur sa finale, n'en a
    // pas besoin.
    const surLaDominante = fin && (o.mode === "mineur" || o.mode === "dorien") && fin.degre === 4 && fin.sensible;
    if (surLaDominante) noter("cadence", "avis", t, [], "le choral finit sur la dominante, cadence phrygienne", "the chorale ends on the dominant, a Phrygian cadence");
    else if (!fin || fin.degre !== 0 || !fin.etatFondamental) noter("cadence", "erreur", t, [], "le choral ne finit pas sur la tonique à l'état fondamental", "the chorale does not end on the root-position tonic");
    else if (!avant || !avantDernierePermise(avant, o.mode)) noter("cadence", "avis", t, [], ...AVANT_DERNIERE[o.mode]);
  }
  infractions.sort((a, b) => a.debut - b.debut || (a.voix[0] ?? -1) - (b.voix[0] ?? -1));
  return { infractions, jugees, tranches: tranches.length, recouvertes };
}

export const estRefusChoral = (v: VerdictChoral | RefusChoral): v is RefusChoral => "voixAbsentes" in v;

/** La tonique, sa tierce majeure et sa quinte, rien d'autre : la tierce picarde d'un choral mineur. */
function estTierceDePicardie(hauteurs: readonly number[], tonique: number): boolean {
  const permises = new Set([pc(tonique), pc(tonique + 4), pc(tonique + 7)]);
  return hauteurs.every((x) => permises.has(pc(x))) && hauteurs.some((x) => pc(x) === pc(tonique + 4));
}

/**
 * La hauteur est-elle la septième de l'accord lu ? Elle se lit sur l'accord même, et non sur son seul
 * degré : le v et le V du dorien ont le même degré et pas la même septième.
 */
const estSeptiemeDe = (h: number, accord: AccordLu): boolean => accord.septieme === pc(h);

/** L'avis d'une avant-dernière que le mode ne permet pas, dans les deux langues. */
const AVANT_DERNIERE: Record<ModeChoral, [string, string]> = {
  majeur: ["l'avant-dernier temps n'est ni la dominante ni la sous-dominante", "the penultimate beat is neither the dominant nor the subdominant"],
  mineur: ["l'avant-dernier temps n'est ni la dominante ni la sous-dominante", "the penultimate beat is neither the dominant nor the subdominant"],
  dorien: ["l'avant-dernier temps n'est ni la dominante avec sa sensible ni la sous-dominante", "the penultimate beat is neither the dominant with its leading tone nor the subdominant"],
  mixolydien: ["l'avant-dernier temps n'est ni la dominante avec sa sensible ni la sous-dominante", "the penultimate beat is neither the dominant with its leading tone nor the subdominant"],
  phrygien: ["l'avant-dernier temps n'est ni le quatrième degré, ni le septième, ni le deuxième, ni le cinquième", "the penultimate beat is neither the fourth degree, nor the seventh, nor the second, nor the fifth"],
};
