// audio/abc-contraintes.ts — Vérifier ce qu'une retouche d'ABC a laissé fixe.
//
// Mesuré avant d'écrire ce module : des modèles de langage locaux qui réécrivent
// un morceau ABC entier ne respectent pas ce qu'on leur demande de garder — 0
// réussite sur 19, et une retouche de gemma4:12b qui SEMBLAIT juste avait perdu
// une note en posant un accord, laissant une mesure à 7 croches. Rien ne le
// signalait. Ce module le signale, et ne dépend d'aucun modèle : il vaut pour
// une retouche humaine comme pour une retouche automatique.
//
// Les comparaisons se font sur le JEU — reprises déroulées — et non sur le texte :
// un morceau dont les reprises sont réécrites en toutes lettres joue la même
// chose, et ne doit pas être compté en faute.

import { Note } from "tonal";
import { traduire } from "../i18n";
import { decouperMorceaux, lireMorceau, normaliserAccord, type MorceauAbc, type NoteAbc } from "./abc";

export const INVARIANTS = ["mesures", "metrique", "tonalite", "melodie", "rythme", "accords", "ambitus"] as const;
export type Invariant = (typeof INVARIANTS)[number];

/** Le premier morceau d'un texte ABC, ou null. */
export function lireAbcUnique(texte: string): MorceauAbc | null {
  const [premier] = decouperMorceaux(texte);
  if (!premier) return null;
  const m = lireMorceau(premier);
  return m.voix.some((v) => v.notes.length > 0) ? m : null;
}

/** Durée d'une mesure en noires. Sans métrique, 4 noires. */
export const longueurMesure = (m: MorceauAbc) => (m.metrique ? (4 * m.metrique.numerateur) / m.metrique.denominateur : 4);

/**
 * Durées des mesures jouées, en noires, lues entre les barres de la première
 * voix. Le dernier segment, après la dernière barre, compte s'il contient du jeu.
 */
export function dureesMesures(m: MorceauAbc): number[] {
  const v = m.voix[0];
  if (!v) return [];
  const bornes = [0, ...v.barres.filter((t) => t > 1e-9)];
  if (v.dureeNoires - bornes[bornes.length - 1] > 1e-9) bornes.push(v.dureeNoires);
  const durees: number[] = [];
  for (let k = 1; k < bornes.length; k++) durees.push(+(bornes[k] - bornes[k - 1]).toFixed(6));
  return durees;
}

const cleNote = (n: NoteAbc) => `${n.midi}@${n.debut.toFixed(6)}x${n.duree.toFixed(6)}`;
const cleRythme = (n: NoteAbc) => `${n.debut.toFixed(6)}x${n.duree.toFixed(6)}`;
const NOMS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const nom = (midi: number) => `${NOMS[midi % 12]}${Math.floor(midi / 12) - 1}`;

export type Qualite = {
  /** Part des notes de mélodie des temps forts contenues dans l'accord qui sonne. null sans accords. */
  consonanceTempsForts: number | null;
  /** Part des notes dans la gamme de la tonalité (sensible comprise en mineur). null sans tonalité. */
  notesDansLaGamme: number | null;
};

/** Classes de hauteur de la gamme d'une armure. La sensible est ajoutée en mineur. */
function gamme(m: MorceauAbc): Set<number> | null {
  if (m.tonalite.nom === "none") return null;
  const NAT: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pcs = new Set(Object.keys(NAT).map((l) => (((NAT[l] + (m.tonalite.alterations[l] ?? 0)) % 12) + 12) % 12));
  if (m.tonalite.mineur) {
    const tonique = Note.chroma(m.tonalite.nom.split(" ")[0]);
    if (tonique !== undefined && !Number.isNaN(tonique)) pcs.add((tonique + 11) % 12);
  }
  return pcs;
}

/**
 * Deux indicateurs de ce que la structure ne garantit pas. Ils ne jugent pas une
 * musique : ils signalent un écart grossier — des accords qui ne contiennent
 * jamais la mélodie, des notes massivement hors de la tonalité annoncée.
 */
export function qualiteMusicale(m: MorceauAbc): Qualite {
  const melodie = m.voix[0]?.notes ?? [];
  const L = longueurMesure(m);
  const nbTemps = m.metrique ? m.metrique.numerateur : 4;
  const compose = !!m.metrique && m.metrique.denominateur === 8 && m.metrique.numerateur % 3 === 0 && m.metrique.numerateur > 3;
  const tempsParMesure = compose ? nbTemps / 3 : nbTemps;
  const fort = (t: number) => {
    const dans = ((t % L) + L) % L;
    return dans < 1e-9 || (tempsParMesure % 2 === 0 && Math.abs(dans - L / 2) < 1e-9);
  };
  let fortes = 0, dansAccord = 0;
  for (const n of melodie) {
    if (!fort(n.debut)) continue;
    const a = m.accords.find((x) => n.debut >= x.debut - 1e-9 && n.debut < x.debut + x.duree - 1e-9);
    if (!a) continue;
    fortes++;
    if (a.hauteurs.some((h) => h % 12 === n.midi % 12)) dansAccord++;
  }
  const g = gamme(m);
  const toutes = m.voix.flatMap((v) => v.notes);
  return {
    consonanceTempsForts: m.accords.length > 0 && fortes > 0 ? dansAccord / fortes : null,
    notesDansLaGamme: g && toutes.length ? toutes.filter((n) => g.has(n.midi % 12)).length / toutes.length : null,
  };
}

export type ResultatContraintes = {
  ok: boolean;
  violations: string[];
  mesuresOrigine: number;
  mesuresModifie: number;
  qualite: Qualite;
};

/** Numéro de mesure (à partir de 1) d'un instant en noires. */
const mesureDe = (t: number, L: number) => Math.floor(t / L + 1e-9) + 1;

export function verifierContraintes(origine: MorceauAbc, modifie: MorceauAbc, invariants: readonly Invariant[]): ResultatContraintes {
  const v: string[] = [];
  const L = longueurMesure(origine);
  const dO = dureesMesures(origine), dM = dureesMesures(modifie);
  const inv = new Set(invariants);

  if (inv.has("mesures")) {
    if (dM.length !== dO.length) v.push(traduire("msg.abc_contraintes.v_mesures_var_0_var_1", dM.length, dO.length));
    const LM = longueurMesure(modifie);
    dM.forEach((d, k) => {
      // La première et la dernière mesure peuvent être incomplètes — levée,
      // fin écourtée — mais seulement si l'original l'était au même endroit.
      const attendu = dO[k] ?? LM;
      if (Math.abs(d - attendu) > 1e-6) v.push(traduire("msg.abc_contraintes.v_duree_mesure_var_0_var_1_var_2", k + 1, fmt(d), fmt(attendu)));
    });
  }
  if (inv.has("metrique") && (origine.metrique?.texte ?? "—") !== (modifie.metrique?.texte ?? "—")) {
    const absente = traduire("msg.abc_contraintes.absente");
    v.push(traduire("msg.abc_contraintes.v_metrique_var_0_var_1", modifie.metrique?.texte ?? absente, origine.metrique?.texte ?? absente));
  }
  if (inv.has("tonalite") && origine.tonalite.nom !== modifie.tonalite.nom) {
    v.push(traduire("msg.abc_contraintes.v_tonalite_var_0_var_1", modifie.tonalite.nom, origine.tonalite.nom));
  }
  const mo = origine.voix[0]?.notes ?? [], mm = modifie.voix[0]?.notes ?? [];
  if (inv.has("melodie")) {
    const k = premiereDifference(mo.map(cleNote), mm.map(cleNote));
    if (k >= 0) {
      const t = (mo[k] ?? mm[k]).debut;
      v.push(traduire("msg.abc_contraintes.v_melodie_var_0_var_1_var_2_var_3",
        mesureDe(t, L), k + 1, mo[k] ? nom(mo[k].midi) : "—", mm[k] ? nom(mm[k].midi) : "—"));
    }
  }
  if (inv.has("rythme")) {
    const k = premiereDifference(mo.map(cleRythme), mm.map(cleRythme));
    if (k >= 0) {
      const t = (mo[k] ?? mm[k]).debut;
      v.push(traduire("msg.abc_contraintes.v_rythme_var_0_var_1_var_2", mesureDe(t, L), mm.length, mo.length));
    }
  }
  if (inv.has("accords")) {
    const cle = (m: MorceauAbc) => m.accords.map((a) => `${normaliserAccord(a.symbole)}@${a.debut.toFixed(6)}`);
    const k = premiereDifference(cle(origine), cle(modifie));
    if (k >= 0) {
      const t = (origine.accords[k] ?? modifie.accords[k]).debut;
      v.push(traduire("msg.abc_contraintes.v_accords_var_0", mesureDe(t, L)));
    }
  }
  if (inv.has("ambitus")) {
    const tout = (m: MorceauAbc) => m.voix.flatMap((x) => x.notes.map((n) => n.midi));
    const o = tout(origine), m = tout(modifie);
    if (o.length && m.length) {
      const bas = Math.min(...o), haut = Math.max(...o);
      const hors = m.filter((h) => h < bas || h > haut);
      if (hors.length) v.push(traduire("msg.abc_contraintes.v_ambitus_var_0_var_1_var_2", hors.length, nom(bas), nom(haut)));
    }
  }
  // Avertissements de lecture : ce qui n'a pas été lu dans la retouche la rend
  // incomparable à l'endroit concerné.
  for (const a of modifie.avertissements) v.push(traduire("msg.abc_contraintes.v_lecture_var_0", a));

  return { ok: v.length === 0, violations: v, mesuresOrigine: dO.length, mesuresModifie: dM.length, qualite: qualiteMusicale(modifie) };
}

function premiereDifference(a: string[], b: string[]): number {
  const n = Math.max(a.length, b.length);
  for (let k = 0; k < n; k++) if (a[k] !== b[k]) return k;
  return -1;
}

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/\.?0+$/, ""));

/** Invariants des préréglages du nœud. */
export const PREREGLAGES: Record<string, Invariant[]> = {
  reharmonisation: ["mesures", "metrique", "tonalite", "melodie"],
  hauteurs: ["mesures", "metrique", "rythme"],
  variation: ["mesures", "metrique", "tonalite"],
  structure: ["mesures", "metrique"],
};

/**
 * Noms anglais des invariants, dans l'ordre d'`INVARIANTS`. Ce sont eux que
 * l'interface anglaise propose et que le message « invariants inconnus » cite ;
 * les noms français restent acceptés, pour les projets déjà enregistrés.
 */
export const INVARIANTS_EN = ["bars", "meter", "key", "melody", "rhythm", "chords", "range"] as const;

/**
 * Lit une liste d'invariants saisie : « mesures, métrique, mélodie », ou
 * « bars, meter, melody ». Les deux langues sont acceptées dans les deux sens —
 * un projet enregistré en français s'ouvre en anglais sans rien casser.
 */
export function lireInvariants(texte: string): { invariants: Invariant[]; inconnus: string[] } {
  const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const invariants: Invariant[] = [], inconnus: string[] = [];
  for (const brut of texte.split(/[\s,;]+/).filter(Boolean)) {
    const x = sansAccents(brut);
    const iEn = INVARIANTS_EN.indexOf(x as (typeof INVARIANTS_EN)[number]);
    const trouve = INVARIANTS.find((i) => i === x) ?? (iEn >= 0 ? INVARIANTS[iEn] : undefined);
    if (trouve) { if (!invariants.includes(trouve)) invariants.push(trouve); } else inconnus.push(brut);
  }
  return { invariants, inconnus };
}
