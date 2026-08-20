// plugins/alignement-dtw.ts — Nœud « Similarité audio » (sous-menu Autres →
// Collections → Analyse). Aligne deux pistes qui diffèrent en tempo/durée par
// Dynamic Time Warping sur leur chromagramme trame par trame, et expose
// séparément la similarité (un score, pas de l'audio) et le chemin
// d'alignement (une liste d'indices de trames) — volontairement DEUX sorties
// distinctes plutôt qu'un nœud qui réétire l'audio lui-même : un futur nœud
// dédié pourra consommer le chemin pour produire l'audio réétiré, sans que
// celui-ci ait à refaire le calcul DTW.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { calculerDTW } from "../audio/algebre";
import { chromagrammeParTrame } from "../audio/analyse";
import { extraitCentre, decalageExtraitCentre, mixdownMono } from "../audio/commun";

// DTW reste en O(n·m) EN TEMPS (inhérent à l'algorithme), mais plus en
// mémoire depuis le calcul par damiers de calculerDTW (voir audio/algebre.ts) —
// contrairement à Classification de pistes (qui traite une COLLECTION de
// pistes, d'où son plafond fixe pour borner le coût agrégé), ce nœud ne
// compare que 2 pistes : la mémoire ne justifie plus un plafond serré. Le
// temps de calcul, lui, reste quadratique — d'où un paramètre réglable
// plutôt qu'une constante fixe, avec un défaut qui couvre la plupart des
// morceaux (~3 min) sans imposer une attente excessive par défaut.
const DUREE_MAX_ANALYSE_DTW_DEFAUT_S = 180;

export const fiches: FicheAudio[] = ([
  {
    id: "alignement-dtw", nom: "Similarité audio", nomEn: "Audio Similarity",
    univers: "Collections", famille: "Analyse",
    resume: "Similarité audio : aligne deux pistes qui diffèrent en tempo/durée (Dynamic Time Warping sur le chromagramme) et mesure leur similarité une fois alignées.",
    resumeEn: "Audio similarity: aligns two tracks that differ in tempo/duration (Dynamic Time Warping on the chromagram) and measures their similarity once aligned.",
    entrees: [
      { nom: "Piste à traiter", nomEn: "Track to process", type: "audio", requis: true },
      { nom: "Piste étalon", nomEn: "Reference track", type: "audio", requis: true },
    ],
    sorties: [
      { nom: "Similarité", nomEn: "Similarity", type: "texte" },
      { nom: "Chemin d'alignement", nomEn: "Alignment path", type: "texte" },
    ],
    parametres: [
      { nom: "Durée max analysée", nomEn: "Max analyzed duration", type: "nombre", plage: [10, 600], pas: 10, defaut: DUREE_MAX_ANALYSE_DTW_DEFAUT_S, unite: "s",
        doc: "Durée maximale (extrait central) analysée par piste. Plus contraint par la mémoire (calcul par damiers), mais le temps de calcul reste quadratique : environ 2 s pour 1 min par piste, ~10 s pour 2 min, ~35-55 s pour 4-5 min.",
        docEn: "Maximum duration (centered excerpt) analyzed per track. No longer memory-constrained (checkpointed computation), but compute time stays quadratic: roughly 2 s for 1 min per track, ~10 s for 2 min, ~35-55 s for 4-5 min." },
    ],
    async executer(ctx: any) {
      const audioA = ctx.entree(0);
      const audioB = ctx.entree(1);
      if (!(audioA instanceof AudioBuffer) || !(audioB instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.connecter.audio") };
      }

      const dureeMaxS = ctx.paramNombre("Durée max analysée", DUREE_MAX_ANALYSE_DTW_DEFAUT_S);
      ctx.onProgress(traduire("progress.extraction_chroma"));
      const extraitA = extraitCentre(audioA, dureeMaxS);
      const extraitB = extraitCentre(audioB, dureeMaxS);
      const sequenceA = chromagrammeParTrame(mixdownMono(extraitA), extraitA.sampleRate);
      const sequenceB = chromagrammeParTrame(mixdownMono(extraitB), extraitB.sampleRate);

      ctx.onProgress(traduire("progress.calcul_dtw"));
      let resultat;
      try {
        resultat = await calculerDTW(sequenceA, sequenceB, {
          signal: ctx.signal,
          onProgress: (fraction) => ctx.onProgress(traduire("progress.calcul_dtw_pourcent_var_0", Math.round(fraction * 100))),
        });
      } catch (e: any) {
        return { valeurs: [null, null], erreur: true, message: e?.message ?? String(e) };
      }

      const similariteTexte = resultat.similarite.toFixed(4);
      // Le décalage (en échantillons) où l'extrait de la Piste A a été pris
      // dans son buffer d'origine est embarqué avec le chemin : sans lui, un
      // nœud consommateur (ex. étirement temporel) devrait redemander à
      // l'utilisateur la même « Durée max analysée » que ce nœud-ci pour
      // recalculer le même extrait — source d'erreur silencieuse si les deux
      // valeurs divergent. Avec, le chemin est auto-suffisant : il porte tout
      // ce qu'il faut pour replacer un indice de trame dans le référentiel de
      // la piste d'origine.
      const cheminJson = JSON.stringify({
        chemin: resultat.chemin,
        debutEchantillonA: decalageExtraitCentre(audioA, dureeMaxS),
      });

      return {
        valeurs: [similariteTexte, cheminJson],
        message: traduire("msg.alignement_dtw_termine_var_0", similariteTexte),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
