// plugins/ecart-reference.ts — Le nœud « Écart à une référence ». La mesure est dans
// `audio/ecart-reference-mesures.ts`, la comparaison dans `audio/ecart-reference-ecart.ts`, le texte
// dans `audio/ecart-reference-rapport.ts` ; ici, la prise.
//
// POURQUOI CE NŒUD. Le 2026-11-25, savoir si une route rapprochait un morceau de sa reprise par Suno a
// demandé d'écrire hors du dépôt un instrument de mesure à douze axes (`EXECUTION/le-loup/RAPPORT.md`).
// Le catalogue mesurait un son seul, ou deux sons sur un seul axe ; rien ne disait, pour une paire, de
// combien chaque axe de production s'écarte. Ce nœud est cet instrument, porté et tenu par ses témoins.
//
// AUCUN RÉGLAGE, et c'est voulu : un rapport ne se compare à un autre que si les tailles d'analyse sont
// les mêmes, et l'instrument d'origine en a payé une (voir `ecart-reference-couleur.ts`).
//
// LES DEUX SONS SE DÉCRIVENT HORS DU FIL, chacun dans son ouvrier, les deux de front : 2,2 s par
// morceau de deux minutes dans le fil, relevé avant. La comparaison et le texte, qui suit la langue,
// se font ici. Sans `Worker`, en test, le même calcul tourne dans le fil.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { entreeAudio, sansEntree } from "./lire-entree";
import { parUneFois } from "./hors-lot";
import { decrireDemande, type DemandeDescription, type DescriptionSon } from "../audio/ecart-reference-mesures";
import { ecartAReference } from "../audio/ecart-reference-ecart";
import { rapportEcart, resumeEcart } from "../audio/ecart-reference-rapport";

/** Les deux premiers canaux d'un tampon : les seuls que la mesure lit. */
const demande = (b: AudioBuffer): DemandeDescription => ({
  canaux: Array.from({ length: Math.min(2, b.numberOfChannels) }, (_, c) => b.getChannelData(c)),
  fe: b.sampleRate,
});

export const fiches: FicheAudio[] = ([
  fiche({
    id: "ecart-reference", nom: "Écart à une référence", nomEn: "Distance to a Reference",
    univers: "Visualisation", famille: "Analyse",
    resume: "Dit de combien un son s'écarte d'une référence sur chaque axe de production : sonie, crête, stéréo, couleur, timbre, harmonie et rythme.",
    resumeEn: "States how far a sound lies from a reference on each production axis: loudness, peak, stereo, color, timbre, harmony and rhythm.",
    entrees: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Référence", nomEn: "Reference", type: "audio" },
    ],
    sorties: [{ nom: "Rapport", nomEn: "Report", type: "texte" }],
    parametres: [],
    async executer(ctx) {
      const audio = entreeAudio(ctx, 0);
      if (sansEntree(audio)) return audio;
      const reference = entreeAudio(ctx, 1);
      if (sansEntree(reference)) return reference;
      const en = langueCourante() === "en";
      ctx.onProgress(en ? "Describing both sounds…" : "Description des deux sons…");
      const [d, r] = await Promise.all([audio, reference].map((b) =>
        parUneFois<DemandeDescription, DescriptionSon>(demande(b), {
          creerWorker: () => new Worker(new URL("../workers/ecart-reference-worker.ts", import.meta.url), { type: "module" }),
          calcul: decrireDemande,
        })));
      const e = ecartAReference(d, r);
      return { valeurs: [rapportEcart(d, r, e, en)], message: resumeEcart(e, en) };
    },
  }),
] as FicheAudio[]).map(avecDoc);
