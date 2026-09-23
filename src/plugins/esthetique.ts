// plugins/esthetique.ts — Nœuds « Score esthétique » et « Comparaison esthétique ».
//
// Audiobox Aesthetics (Meta, 2025) note un son sur quatre axes de 1 à 10 — plaisir
// d'écoute (CE), intérêt comme matière pour créer (CU), complexité de production (PC),
// qualité de production (PQ) — sans référence à laquelle le comparer. Poids sous
// licence CC-BY 4.0, noté dans THIRD_PARTY.md.
//
// Chaîne : mono → 16 kHz → tranches de 10 s (audio/esthetique.ts, testé) → une note par
// tranche dans le processus principal (electron/esthetique.cjs) → moyenne pondérée. La
// courbe par tranche est le vrai apport face au seul score global : sur la collection
// de démonstration, « Winter-Time » a un PQ global de 7,72 mais une tranche à 5,59.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { canauxDe } from "../audio/geometrie-sonore";
import {
  AXES_ESTHETIQUES, preparerTranches, agregerTranches, scoresDepuisSortie, pointsFaibles,
  ecartsEsthetiques, formaterHorodatage, type AnalyseEsthetique, type ScoresEsthetiques, type TrancheNotee,
} from "../audio/esthetique";

interface ApiEsthetique {
  noterTrancheEsthetique?: (o: { signal: Float32Array; utiles: number }) =>
    Promise<{ ok: true; scores: number[] } | { ok: false; erreur: string; modeleAbsent?: boolean }>;
}

class ErreurEsthetique extends Error {}

const f2 = (x: number) => x.toFixed(2);
const etiquette = (x: string) => traduire("msg.esthetique.etiquette_var_0", x);
const signe = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`;
const ligneScores = (s: ScoresEsthetiques, fmt: (x: number) => string = f2) =>
  AXES_ESTHETIQUES.map((a) => `${a} ${fmt(s[a])}`).join(" · ");

/**
 * Note un AudioBuffer tranche par tranche. `annonce` précède le numéro de tranche dans
 * la progression (« A », « B » pour la comparaison).
 */
async function analyserEsthetique(
  buffer: AudioBuffer,
  api: ApiEsthetique,
  surProgres: (texte: string) => void,
  signal?: AbortSignal,
  annonce = "",
): Promise<AnalyseEsthetique> {
  if (!api.noterTrancheEsthetique) throw new ErreurEsthetique(traduire("msg.esthetique.bureau"));
  const tranches = preparerTranches(canauxDe(buffer), buffer.sampleRate);
  const notees: TrancheNotee[] = [];
  for (let i = 0; i < tranches.length; i++) {
    if (signal?.aborted) throw new ErreurEsthetique(traduire("msg.esthetique.annule"));
    surProgres(traduire("progress.esthetique.var_0_var_1_var_2", annonce, i + 1, tranches.length));
    const t = tranches[i];
    const rep = await api.noterTrancheEsthetique({ signal: t.signal, utiles: t.utiles });
    if (!rep.ok) {
      throw new ErreurEsthetique(rep.modeleAbsent ? traduire("msg.esthetique.modele_absent") : traduire("msg.esthetique.echec_var_0", rep.erreur));
    }
    notees.push({ debutSec: t.debutSec, finSec: t.finSec, scores: scoresDepuisSortie(rep.scores) });
  }
  return agregerTranches(notees);
}

function rapportEsthetique(analyse: AnalyseEsthetique): string {
  const lignes = [
    traduire("msg.esthetique.rapport_titre"),
    `${etiquette(traduire("msg.esthetique.global"))} ${ligneScores(analyse.global)}`,
    "",
    traduire("msg.esthetique.plus_bas"),
    ...pointsFaibles(analyse).map((p) =>
      `  ${p.axe} ${f2(p.score)} — ${formaterHorodatage(p.debutSec)}–${formaterHorodatage(p.finSec)} (${signe(p.ecart)})`),
    "",
    traduire("msg.esthetique.par_tranche"),
    ...analyse.tranches.map((t) =>
      `  ${formaterHorodatage(t.debutSec)}–${formaterHorodatage(t.finSec)}  ${ligneScores(t.scores)}`),
  ];
  return lignes.join("\n");
}

function rapportComparaison(a: AnalyseEsthetique, b: AnalyseEsthetique): string {
  const d = ecartsEsthetiques(a, b);
  return [
    traduire("msg.esthetique.comparaison_titre"),
    `${etiquette("A")} ${ligneScores(a.global)}`,
    `${etiquette("B")} ${ligneScores(b.global)}`,
    `${etiquette("B − A")} ${ligneScores(d, signe)}`,
    "",
    `A — ${traduire("msg.esthetique.plus_bas")}`,
    ...pointsFaibles(a).map((p) => `  ${p.axe} ${f2(p.score)} — ${formaterHorodatage(p.debutSec)}–${formaterHorodatage(p.finSec)}`),
    `B — ${traduire("msg.esthetique.plus_bas")}`,
    ...pointsFaibles(b).map((p) => `  ${p.axe} ${f2(p.score)} — ${formaterHorodatage(p.debutSec)}–${formaterHorodatage(p.finSec)}`),
  ].join("\n");
}

const apiFenetre = (): ApiEsthetique => ((globalThis as { window?: { api?: ApiEsthetique } }).window?.api ?? {});

export const fiches: FicheAudio[] = ([
  {
    id: "score-esthetique", nom: "Score esthétique", nomEn: "Aesthetic Score",
    univers: "Visualisation", famille: "Analyse",
    resume: "Note un son sur quatre axes (plaisir, intérêt, complexité, qualité de production) avec la courbe de chaque axe dans le temps.",
    resumeEn: "Scores a sound on four axes (enjoyment, usefulness, complexity, production quality) with each axis' curve over time.",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "Rapport", nomEn: "Report", type: "texte" }],
    parametres: [],
    async executer(ctx: any) {
      const buffer = ctx.entree(0);
      if (!(buffer instanceof AudioBuffer)) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.esthetique.aucune_entree") };
      }
      try {
        const analyse = await analyserEsthetique(buffer, apiFenetre(), (t) => ctx.onProgress(t), ctx.signal);
        (ctx.noeud.data as any)._esthetique = analyse;
        return {
          valeurs: [buffer, rapportEsthetique(analyse)],
          message: traduire("msg.esthetique.resultat_var_0_var_1", ligneScores(analyse.global), analyse.tranches.length),
        };
      } catch (e) {
        if (!(e instanceof ErreurEsthetique)) throw e;
        return { valeurs: [null, null], erreur: true, message: e.message };
      }
    },
  },
  {
    id: "comparaison-esthetique", nom: "Comparaison esthétique", nomEn: "Aesthetic Comparison",
    univers: "Visualisation", famille: "Analyse",
    resume: "Compare deux versions d'un son sur les quatre axes esthétiques : un mix contre un autre, un son avant et après traitement.",
    resumeEn: "Compares two versions of a sound on the four aesthetic axes: one mix against another, a sound before and after processing.",
    entrees: [{ nom: "A", type: "audio", requis: true }, { nom: "B", type: "audio", requis: true }],
    sorties: [{ nom: "Rapport", nomEn: "Report", type: "texte" }],
    parametres: [],
    async executer(ctx: any) {
      const a = ctx.entree(0), b = ctx.entree(1);
      if (!(a instanceof AudioBuffer) || !(b instanceof AudioBuffer)) {
        return { valeurs: [null], erreur: true, message: traduire("msg.esthetique.deux_entrees") };
      }
      try {
        const api = apiFenetre();
        const analyseA = await analyserEsthetique(a, api, (t) => ctx.onProgress(t), ctx.signal, "A · ");
        const analyseB = await analyserEsthetique(b, api, (t) => ctx.onProgress(t), ctx.signal, "B · ");
        (ctx.noeud.data as any)._comparaisonEsthetique = { a: analyseA, b: analyseB };
        return {
          valeurs: [rapportComparaison(analyseA, analyseB)],
          message: traduire("msg.esthetique.ecarts_var_0", ligneScores(ecartsEsthetiques(analyseA, analyseB), signe)),
        };
      } catch (e) {
        if (!(e instanceof ErreurEsthetique)) throw e;
        return { valeurs: [null], erreur: true, message: e.message };
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
