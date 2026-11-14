// audio/abc-reprise.ts — Reprise d'une partition ABC dans un autre style.
//
// Cinquième étape du portage des idées de YuE2, qui fait des reprises en
// gardant la mélodie et en changeant l'habillage. Les étapes précédentes savent
// déjà lire une mélodie et en changer les accords ; ce qui manquait, c'est
// l'ACCOMPAGNEMENT : une basse et un motif d'accords qui suivent l'harmonie du
// morceau dans un style donné. « ABC → MIDI » joue les accords chiffrés en blocs
// tenus, et les générateurs d'Attic accompagnent leurs propres progressions, pas
// la mélodie d'un morceau existant.
//
// AUCUN MODÈLE DE LANGAGE. Les styles sont des motifs déterministes posés sur les
// accords chiffrés — l'harmonie vient de la partition, ou d'une réharmonisation
// faite en amont. C'est ce qui rend le résultat fiable : la mesure de l'étape 4 a
// montré que les modèles locaux se trompent dès qu'ils écrivent des durées, et un
// accompagnement n'est fait que de durées.
//
// LA MÉLODIE EST INTACTE PAR CONSTRUCTION — les voix d'origine sont recopiées
// telles quelles, l'accompagnement s'y ajoute sur d'autres voix — et vérifiée à
// la fin par le même contrôle que « Contraintes ABC ».

import { traduire } from "../i18n";
import { hauteursAccord, lireTonalite, morceauVersMidi, type MorceauAbc, type NoteAbc, type AccordAbc } from "./abc";
import { midiVersAbc } from "./midi-vers-abc";
import { lireAbcUnique, verifierContraintes, dureesMesures, longueurMesure, type ResultatContraintes } from "./abc-contraintes";
import { cleDepuisNomTonalite } from "./abc-edition-llm";
import { carrure, motif, type Role } from "./abc-reprise-motifs";

export { ACCORDS_TENUS, STYLES, estStyle, carrure, motif } from "./abc-reprise-motifs";

/** Hauteurs utiles d'un accord chiffré : basse, accord serré sous la mélodie, tons de l'arpège. */
export function voicing(symbole: string): { basse: number; quinte: number; tierce: number; octave: number; accord: number[]; arpege: number[] } | null {
  const h = hauteursAccord(symbole);
  if (!h || h.length === 0) return null;
  // Avec une basse imposée (« D/F# »), hauteursAccord la place en tête.
  const aBasse = /\/[A-G][#b]?$/i.test(symbole.trim());
  const tons = aBasse ? h.slice(1) : h;
  const pcBasse = (aBasse ? h[0] : tons[0]) % 12;
  const basse = 36 + ((pcBasse - 36 % 12 + 12) % 12); // dans [36, 47]
  const quinteTon = tons.find((t) => (t - tons[0] + 120) % 12 === 7) ?? tons[0] + 7;
  const quinte = 36 + (((quinteTon % 12) - 0 + 12) % 12) + (((quinteTon % 12) < pcBasse) ? 12 : 0);
  // Accord serré entre sol 3 et fa# 4 : sous une mélodie qui vit en général plus haut.
  const accord = [...new Set(tons.map((t) => 55 + ((t % 12) - 55 % 12 + 12) % 12))].sort((a, b) => a - b);
  // Arpège montant depuis la fondamentale à l'octave 3 : les tons de l'accord dans
  // l'ordre, puis les mêmes à l'octave — do mi sol do mi sol pour un do majeur.
  const racine = 48 + (tons[0] % 12);
  const montants = tons.map((t) => { let x = 48 + (t % 12); while (x < racine) x += 12; return x; }).sort((a, b) => a - b);
  const arpege = [...montants, ...montants.map((x) => x + 12)].slice(0, 6);
  // La tierce est le second ton de l'accord, posée au-dessus de la basse dans la même octave ;
  // l'octave double la basse. Les deux servent aux lignes de basse des grilles.
  const tierce = basse + (((tons[1] ?? tons[0]) % 12) - (basse % 12) + 12) % 12;
  return { basse, quinte, tierce, octave: basse + 12, accord, arpege };
}

/** La hauteur que joue une frappe de basse. */
const hauteurBasse = (v: NonNullable<ReturnType<typeof voicing>>, role: Role): number =>
  role === "quinte" ? v.quinte : role === "tierce" ? v.tierce : role === "octave" ? v.octave : v.basse;

export type OptionsReprise = {
  /** Un identifiant de `STYLES` : « accords-tenus » ou la clé d'un patron rythmique. */
  style: string;
  /** Le nom du style à l'écran, pour le message qui refuse une métrique ; l'identifiant sinon. */
  nomStyle?: string;
  /** Noires par minute ; 0 = garder le tempo de la partition. */
  tempo: number;
  instrumentMelodie: number;
  instrumentAccompagnement: number;
  instrumentBasse: number;
};

export type ResultatReprise = {
  ok: boolean;
  erreur: string | null;
  abc: string | null;
  midi: Uint8Array | null;
  tempo: number;
  notesAccompagnement: number;
  notesBasse: number;
  verification: ResultatContraintes | null;
  accordsIgnores: string[];
};

/** L'accord qui sonne à l'instant t : le dernier commencé. */
const accordA = (accords: AccordAbc[], t: number) => {
  let a: AccordAbc | null = null;
  for (const x of accords) if (x.debut <= t + 1e-9) a = x; else break;
  return a && t < a.debut + a.duree - 1e-9 ? a : null;
};

export function reprendreAbc(texte: string, o: OptionsReprise): ResultatReprise {
  const echec = (erreur: string): ResultatReprise => ({
    ok: false, erreur, abc: null, midi: null, tempo: 0, notesAccompagnement: 0, notesBasse: 0, verification: null, accordsIgnores: [],
  });
  const origine = lireAbcUnique(texte);
  if (!origine) return echec(traduire("msg.abc.illisible_entree"));
  if (origine.avertissements.length) return echec(traduire("msg.abc.entree_incomplete_var_0", origine.avertissements.join(" · ")));
  if (origine.accords.length === 0) {
    return echec(traduire("msg.abc_reprise.sans_accords"));
  }
  const c = carrure(origine);
  const durees = dureesMesures(origine);
  if (durees.length > 1 && Math.abs(durees[0] - longueurMesure(origine)) > 1e-6) return echec(traduire("msg.abc.levee_non_geree"));
  const frappes = motif(o.style, c);
  if (!frappes) return echec(traduire("msg.abc_reprise.style_metrique_var_0_var_1", o.nomStyle ?? o.style, origine.metrique?.texte ?? "4/4"));

  const fin = Math.max(...origine.voix.map((v) => v.dureeNoires));
  const nbMesures = Math.ceil(fin / c.mesure - 1e-9);
  const accords = [...origine.accords].sort((a, b) => a.debut - b.debut);
  const ignores = new Set<string>();
  const accompagnement: NoteAbc[] = [], basse: NoteAbc[] = [];

  for (let k = 0; k < nbMesures; k++) {
    let indexArpege = 0;
    for (const f of frappes) {
      const debutFrappe = k * c.mesure + f.decalage;
      const finFrappe = Math.min(debutFrappe + f.duree, fin);
      if (debutFrappe >= fin - 1e-9) continue;
      const vel = f.role === "accord" || f.role === "arpege" ? 62 : 78;
      const ton = f.role === "arpege" ? indexArpege++ : 0;
      // Une frappe se partage entre les accords qui sonnent pendant elle : coupée
      // au changement d'accord, et REJOUÉE sur le nouveau jusqu'à sa fin prévue.
      // Couper sans rejouer laissait l'accompagnement muet après chaque
      // changement tombé entre deux frappes — en « blocs », le sol de la mesure 2
      // de « Speed the Plough » n'était jamais joué. Mesuré dans l'app.
      let t = debutFrappe;
      while (t < finFrappe - 1e-9) {
        const a = accordA(accords, t);
        const suivant = accords.find((x) => x.debut > t + 1e-9);
        const finTranche = Math.min(finFrappe, a ? a.debut + a.duree : Infinity, suivant ? suivant.debut : Infinity);
        if (a) {
          const v = voicing(a.symbole);
          const duree = finTranche - t;
          if (!v) ignores.add(a.symbole);
          else if (duree > 1e-9) {
            if (f.role === "accord") for (const h of v.accord) accompagnement.push({ midi: h, debut: t, duree, velocite: vel });
            else if (f.role === "arpege") accompagnement.push({ midi: v.arpege[ton % v.arpege.length], debut: t, duree, velocite: vel });
            else basse.push({ midi: hauteurBasse(v, f.role), debut: t, duree, velocite: vel });
          }
        }
        if (finTranche <= t + 1e-9) break;
        t = finTranche;
      }
    }
  }

  // Les voix d'origine, telles quelles, puis l'accompagnement et la basse.
  const arrangement: MorceauAbc = {
    ...origine,
    tempo: o.tempo > 0 ? o.tempo : origine.tempo,
    voix: [
      ...origine.voix,
      { id: "accompagnement", notes: accompagnement, dureeNoires: fin, barres: [] },
      { id: "basse", notes: basse, dureeNoires: fin, barres: [] },
    ],
    accords: [],
  };
  const tempo = arrangement.tempo ?? 120;
  const instrumentsParVoix = [
    ...origine.voix.map(() => o.instrumentMelodie), o.instrumentAccompagnement, o.instrumentBasse,
  ];
  const { octets } = morceauVersMidi(arrangement, { tempoParDefaut: tempo, instrumentVoix: o.instrumentMelodie, instrumentAccords: 0, jouerAccords: false, instrumentsParVoix });

  // L'ABC est écrit à partir de ce MIDI, les accords chiffrés reposés sur la
  // mélodie : c'est le chemin dont l'aller-retour est vérifié.
  const cle = cleDepuisNomTonalite(origine.tonalite.nom);
  let avertCle = "";
  lireTonalite(cle, (m) => (avertCle = m));
  const { abc } = midiVersAbc(octets, {
    metrique: origine.metrique?.texte ?? "4/4", tonalite: avertCle ? "C" : cle, grille: "auto", titre: origine.titre,
    accords: accords.map((a) => ({ debut: a.debut, symbole: a.symbole })),
  });
  const relu = lireAbcUnique(abc);
  if (!relu) return echec(traduire("msg.abc_reprise.arrangement_illisible"));
  const verification = verifierContraintes(origine, relu, ["mesures", "metrique", "tonalite", "melodie", "accords"]);
  return {
    ok: verification.ok, erreur: verification.ok ? null : traduire("msg.abc_reprise.arrangement_non_conforme_var_0", verification.violations.join(" · ")),
    abc: verification.ok ? abc : null, midi: verification.ok ? octets : null, tempo,
    notesAccompagnement: accompagnement.length, notesBasse: basse.length, verification, accordsIgnores: [...ignores],
  };
}
