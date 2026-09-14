// audio/abc-edition-llm.ts — Retoucher un morceau ABC avec un modèle de langage,
// sans lui laisser casser ce qui doit rester fixe.
//
// LA CONCEPTION VIENT D'UNE MESURE. Des modèles locaux à qui l'on demandait de
// réécrire le morceau entier ont échoué 19 fois sur 19, même après relance avec
// la liste de leurs erreurs : copie inchangée, en-tête perdu, mesures faussées,
// ou une note disparue en posant un accord. Les mêmes modèles, à qui l'on ne
// demandait QUE ce qui change, dans un format JSON imposé par Ollama, ont réussi
// 20 fois sur 20 — tant qu'ils n'avaient pas à choisir de durées. Dès qu'ils
// écrivaient du rythme, ils se trompaient de mesure : 0 sur 10.
//
// D'où deux opérations, et pas davantage.
//
// RÉHARMONISER. Le modèle rend les accords de chaque mesure, un ou deux. Attic
// les pose sur la mélodie d'origine, qu'il n'a jamais eu à recopier.
//
// RÉÉCRIRE LES HAUTEURS. Le modèle rend exactement autant de hauteurs que la
// mélodie a de notes. Attic les pose sur le rythme d'origine.
//
// Ce qui ne peut pas être cassé par construction est tout de même vérifié à la
// fin : c'est un filet contre un défaut d'assemblage, pas contre le modèle.

import { morceauVersMidi, hauteursAccord, lireTonalite, type MorceauAbc, type NoteAbc } from "./abc";
import { midiVersAbc } from "./midi-vers-abc";
import {
  lireAbcUnique, verifierContraintes, dureesMesures, longueurMesure, type ResultatContraintes, type Invariant,
} from "./abc-contraintes";

export type OperationEdition = "reharmoniser" | "hauteurs";
export type AppelLlm = (prompt: string, format: Record<string, unknown>) => Promise<{ reponse?: string; erreur?: string }>;

export type OptionsEdition = {
  operation: OperationEdition;
  consigne: string;
  essais: number;
  /** « garder » ou un champ K: pour le résultat de « hauteurs ». */
  tonaliteCible: string;
};

export type Essai = { numero: number; erreurs: string[] };

export type ResultatEdition = {
  ok: boolean;
  abc: string | null;
  essais: Essai[];
  verification: ResultatContraintes | null;
  /** Accords chiffrés retirés parce que la tonalité change (opération « hauteurs »). */
  accordsRetires: boolean;
  erreur: string | null;
};

const NOMS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const nomNote = (midi: number) => `${NOMS[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** « F#4 », « Bb3 » → hauteur MIDI ; null si illisible ou hors du clavier. */
export function hauteurDepuisNom(nom: string): number | null {
  const x = /^([A-G])(#|b)?(-?\d)$/.exec(String(nom).trim());
  if (!x) return null;
  const h = (parseInt(x[3], 10) + 1) * 12 + PC[x[1]] + (x[2] === "#" ? 1 : x[2] === "b" ? -1 : 0);
  return h >= 21 && h <= 108 ? h : null;
}

/** Nom de tonalité (« A dorian ») → champ K: (« Ador »). */
export function cleDepuisNomTonalite(nom: string): string {
  if (nom === "none") return "none";
  const [tonique, mode] = nom.split(" ");
  const suffixe: Record<string, string> = { major: "", minor: "m", dorian: "dor", mixolydian: "mix", phrygian: "phr", lydian: "lyd", locrian: "loc" };
  return tonique + (suffixe[mode] ?? "");
}

const fraction = (x: number) => {
  for (const d of [1, 2, 3, 4, 6, 8, 12, 16]) if (Math.abs(x * d - Math.round(x * d)) < 1e-6) return d === 1 ? String(Math.round(x)) : `${Math.round(x * d)}/${d}`;
  return x.toFixed(3);
};

/** Mélodie de la mesure k, en noms de notes et durées en noires. */
function melodieParMesure(m: MorceauAbc): string[][] {
  const L = longueurMesure(m);
  const n = dureesMesures(m).length;
  const mesures: string[][] = Array.from({ length: n }, () => []);
  for (const note of m.voix[0].notes) {
    const k = Math.min(n - 1, Math.floor(note.debut / L + 1e-9));
    mesures[k].push(`${nomNote(note.midi)} (${fraction(note.duree)})`);
  }
  return mesures;
}

/** Écrit un morceau, notes de la voix 1 éventuellement remplacées, via le MIDI : le chemin dont l'aller-retour est vérifié. */
function reecrire(m: MorceauAbc, voix1: NoteAbc[], cle: string, accords: { debut: number; symbole: string }[]): { abc: string; morceau: MorceauAbc | null } {
  const copie: MorceauAbc = { ...m, voix: m.voix.map((v, k) => (k === 0 ? { ...v, notes: voix1 } : v)), accords: [] };
  const { octets } = morceauVersMidi(copie, { tempoParDefaut: m.tempo ?? 120, instrumentVoix: 0, instrumentAccords: 0, jouerAccords: false });
  const { abc } = midiVersAbc(octets, { metrique: m.metrique?.texte ?? "4/4", tonalite: cle, grille: "auto", titre: m.titre, accords });
  return { abc, morceau: lireAbcUnique(abc) };
}

export async function editerAbc(texte: string, o: OptionsEdition, appel: AppelLlm, surProgres?: (message: string) => void): Promise<ResultatEdition> {
  const vide = (erreur: string): ResultatEdition => ({ ok: false, abc: null, essais: [], verification: null, accordsRetires: false, erreur });
  const origine = lireAbcUnique(texte);
  if (!origine) return vide("aucune partition ABC lisible en entrée");
  if (origine.avertissements.length) return vide(`partition d'entrée incomplètement lue : ${origine.avertissements.join(" · ")}`);

  const L = longueurMesure(origine);
  const durees = dureesMesures(origine);
  // Une levée décalerait les mesures entre ce que voit le modèle et ce que pose
  // l'assemblage : le cas n'est pas géré, et il est refusé plutôt que mal traité.
  if (durees.length > 1 && Math.abs(durees[0] - L) > 1e-6) return vide("les morceaux qui commencent par une levée ne sont pas gérés");

  const nbMesures = durees.length;
  const melodie = origine.voix[0].notes;
  const essais: Essai[] = [];
  let retour = "";

  if (o.operation === "reharmoniser") {
    // Deux accords par mesure seulement si la mesure a un nombre pair de temps :
    // en 3/4, « mi-mesure » tomberait entre deux temps.
    const compose = !!origine.metrique && origine.metrique.denominateur === 8 && origine.metrique.numerateur % 3 === 0 && origine.metrique.numerateur > 3;
    const temps = origine.metrique ? (compose ? origine.metrique.numerateur / 3 : origine.metrique.numerateur) : 4;
    const parMesure = temps % 2 === 0 ? 2 : 1;
    const format = {
      type: "object",
      properties: { bars: { type: "array", minItems: nbMesures, maxItems: nbMesures, items: { type: "array", minItems: 1, maxItems: parMesure, items: { type: "string" } } } },
      required: ["bars"],
    };
    const mesures = melodieParMesure(origine);
    const accordsActuels = mesures.map((_, k) => origine.accords.filter((a) => Math.floor(a.debut / L + 1e-9) === k).map((a) => a.symbole).join(" ") || "—");
    const prompt = `Here is a tune in ${origine.tonalite.nom}, ${nbMesures} bars of ${origine.metrique?.texte ?? "4/4"}.\n\n`
      + mesures.map((notes, k) => `Bar ${k + 1} — melody: ${notes.join(" ")} — current chords: ${accordsActuels[k]}`).join("\n")
      + `\n\n(Durations are in quarter notes.)\n\nInstruction: ${o.consigne}\n\n`
      + `For each of the ${nbMesures} bars give ${parMesure === 2 ? "1 or 2 chord symbols: the first sounds at the start of the bar, the second (optional) at mid-bar" : "exactly 1 chord symbol, sounding at the start of the bar"}. `
      + `Use standard chord symbols such as G, Em7, Cmaj7, D7, Am, Bm7b5, D/F#. Answer as JSON: {"bars": [[...], ...]}.`;

    for (let n = 1; n <= Math.max(1, o.essais); n++) {
      surProgres?.(`essai ${n}`);
      const r = await appel(prompt + retour, format);
      if (r.erreur) return { ...vide(r.erreur), essais };
      const erreurs: string[] = [];
      let bars: unknown;
      try { bars = JSON.parse(r.reponse ?? "")?.bars; } catch { erreurs.push("the answer is not valid JSON"); }
      if (!erreurs.length && (!Array.isArray(bars) || bars.length !== nbMesures)) erreurs.push(`give exactly ${nbMesures} bars`);
      const accords: { debut: number; symbole: string }[] = [];
      if (!erreurs.length) {
        (bars as unknown[]).forEach((b, k) => {
          const liste = Array.isArray(b) ? b.map(String).filter((s) => s.trim()) : [];
          if (liste.length < 1 || liste.length > parMesure) { erreurs.push(`bar ${k + 1}: give ${parMesure === 2 ? "1 or 2 chords" : "1 chord"}`); return; }
          liste.forEach((symbole, i) => {
            if (hauteursAccord(symbole) === null) erreurs.push(`bar ${k + 1}: unknown chord symbol "${symbole}"`);
            else accords.push({ debut: k * L + (i === 1 ? L / 2 : 0), symbole: symbole.trim() });
          });
        });
      }
      if (!erreurs.length) {
        const avant = origine.accords.map((a) => a.symbole).join(" ");
        const apres = accords.map((a) => a.symbole).join(" ");
        if (avant === apres) erreurs.push("these are the current chords: the requested change was not made");
      }
      if (erreurs.length) {
        essais.push({ numero: n, erreurs });
        retour = `\n\nYour previous answer was:\n${r.reponse}\nProblems: ${erreurs.join("; ")}. Answer again with the same JSON format.`;
        continue;
      }
      const resultat = reecrire(origine, melodie, cleDepuisNomTonalite(origine.tonalite.nom), accords);
      essais.push({ numero: n, erreurs: [] });
      return terminer(origine, resultat, ["mesures", "metrique", "tonalite", "melodie"], essais, false);
    }
    return { ...vide(`échec après ${essais.length} essai(s)`), essais };
  }

  // ── Réécrire les hauteurs ──
  const cle = /^garder$/i.test(o.tonaliteCible.trim()) || !o.tonaliteCible.trim() ? cleDepuisNomTonalite(origine.tonalite.nom) : o.tonaliteCible.trim();
  let avertTonalite = "";
  lireTonalite(cle, (m) => (avertTonalite = m));
  if (avertTonalite) return vide(`tonalité cible illisible : ${avertTonalite}`);
  const nomCible = lireTonalite(cle, () => {}).nom;
  const format = {
    type: "object",
    properties: { notes: { type: "array", minItems: melodie.length, maxItems: melodie.length, items: { type: "string", pattern: "^[A-G](#|b)?[1-7]$" } } },
    required: ["notes"],
  };
  const prompt = `Here is a melody in ${origine.tonalite.nom}, ${origine.metrique?.texte ?? "4/4"}, ${melodie.length} notes. Scientific pitch names (middle C = C4), durations in quarter notes, bar numbers:\n\n`
    + melodie.map((n, k) => `${k + 1}. ${nomNote(n.midi)} (${fraction(n.duree)}) bar ${Math.floor(n.debut / L + 1e-9) + 1}`).join("\n")
    + `\n\nInstruction: ${o.consigne}${nomCible !== origine.tonalite.nom ? ` The result is in ${nomCible}.` : ""}\n\n`
    + `Give exactly ${melodie.length} pitches, one per original note, in the same order: the rhythm is kept as it is. Answer as JSON: {"notes": ["C4", ...]}.`;

  for (let n = 1; n <= Math.max(1, o.essais); n++) {
    surProgres?.(`essai ${n}`);
    const r = await appel(prompt + retour, format);
    if (r.erreur) return { ...vide(r.erreur), essais };
    const erreurs: string[] = [];
    let noms: unknown;
    try { noms = JSON.parse(r.reponse ?? "")?.notes; } catch { erreurs.push("the answer is not valid JSON"); }
    if (!erreurs.length && (!Array.isArray(noms) || noms.length !== melodie.length)) erreurs.push(`give exactly ${melodie.length} pitches`);
    const hauteurs: number[] = [];
    if (!erreurs.length) {
      (noms as unknown[]).forEach((x, k) => {
        const h = hauteurDepuisNom(String(x));
        if (h === null) erreurs.push(`note ${k + 1}: "${x}" is not a pitch between A0 and C8`);
        else hauteurs.push(h);
      });
    }
    if (!erreurs.length && hauteurs.every((h, k) => h === melodie[k].midi)) erreurs.push("these are the original pitches: the requested change was not made");
    if (erreurs.length) {
      essais.push({ numero: n, erreurs });
      retour = `\n\nYour previous answer was:\n${r.reponse}\nProblems: ${erreurs.join("; ")}. Answer again with the same JSON format.`;
      continue;
    }
    // Les accords d'origine ne valent que dans la tonalité d'origine.
    const garderAccords = nomCible === origine.tonalite.nom;
    const accords = garderAccords ? origine.accords.map((a) => ({ debut: a.debut, symbole: a.symbole })) : [];
    const resultat = reecrire(origine, melodie.map((note, k) => ({ ...note, midi: hauteurs[k] })), cle, accords);
    essais.push({ numero: n, erreurs: [] });
    return terminer(origine, resultat, ["mesures", "metrique", "rythme"], essais, !garderAccords && origine.accords.length > 0);
  }
  return { ...vide(`échec après ${essais.length} essai(s)`), essais };
}

function terminer(origine: MorceauAbc, resultat: { abc: string; morceau: MorceauAbc | null }, invariants: Invariant[], essais: Essai[], accordsRetires: boolean): ResultatEdition {
  if (!resultat.morceau) return { ok: false, abc: null, essais, verification: null, accordsRetires, erreur: "assemblage illisible (défaut d'Attic, pas du modèle)" };
  // Le texte rendu est EXACTEMENT celui qui vient d'être relu et vérifié.
  const verification = verifierContraintes(origine, resultat.morceau, invariants);
  return {
    ok: verification.ok,
    abc: verification.ok ? resultat.abc : null,
    essais, verification, accordsRetires,
    erreur: verification.ok ? null : `assemblage non conforme (défaut d'Attic, pas du modèle) : ${verification.violations.join(" · ")}`,
  };
}
