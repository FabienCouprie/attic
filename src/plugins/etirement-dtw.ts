// plugins/etirement-dtw.ts — Nœud « Étirement temporel (DTW) » (sous-menu
// Autres → Test zone). Deuxième moitié du couple avec Similarité audio :
// consomme son « Chemin d'alignement » (JSON, auto-suffisant — porte le
// décalage nécessaire pour se replacer dans le buffer d'origine de la Piste A)
// pour réétirer l'audio de la Piste A, sans jamais avoir besoin de l'audio de
// la piste étalon ni de refaire le calcul DTW. Nœud séparé et réutilisable,
// exactement le découpage retenu : le chemin peut alimenter d'autres
// consommateurs (visualisation, autre traitement) sans dépendre de celui-ci.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { reetirerParChemin } from "../audio/reetirage-dtw";
import { SAUT_TRAME_CHROMAGRAMME } from "../audio/analyse";

export const fiches: FicheAudio[] = ([
  {
    id: "etirement-dtw", nom: "Étirement temporel (DTW)", nomEn: "Time Stretch (DTW)",
    univers: "Autres", famille: "Test zone",
    resume: "[EXPÉRIMENTAL — résultat très discutable] Réétire l'audio de la Piste A le long du chemin d'alignement produit par Similarité audio, par interpolation linéaire le long de la correspondance de trames. Ce n'est PAS un vocodeur de phase : la hauteur dérive localement partout où le débit change (comme une lecture à vitesse variable).",
    resumeEn: "[EXPERIMENTAL — very questionable result] Re-stretches Track A's audio along the alignment path produced by Audio Similarity, by linear interpolation along the frame correspondence. This is NOT a phase vocoder: pitch drifts locally wherever the rate changes (like variable-speed playback).",
    entrees: [
      { nom: "Piste à traiter", nomEn: "Track to process", type: "audio", requis: true },
      { nom: "Chemin d'alignement", nomEn: "Alignment path", type: "texte", requis: true },
    ],
    sorties: [
      { nom: "Piste alignée", nomEn: "Aligned track", type: "audio" },
    ],
    parametres: [],
    async executer(ctx: any) {
      const audioA = ctx.entree(0);
      const cheminBrut = ctx.entree(1);
      if (!(audioA instanceof AudioBuffer)) {
        return { valeurs: [null], message: traduire("msg.connecter.audio") };
      }
      if (typeof cheminBrut !== "string" || !cheminBrut.trim()) {
        return { valeurs: [null], message: traduire("msg.connecter_chemin_alignement") };
      }

      let donnees: any;
      try {
        donnees = JSON.parse(cheminBrut);
      } catch {
        return { valeurs: [null], erreur: true, message: traduire("msg.chemin_alignement_invalide") };
      }
      if (!donnees || !Array.isArray(donnees.chemin) || donnees.chemin.length === 0) {
        return { valeurs: [null], erreur: true, message: traduire("msg.chemin_alignement_invalide") };
      }

      const decalage = typeof donnees.debutEchantillonA === "number" ? donnees.debutEchantillonA : 0;

      let sortie: AudioBuffer;
      try {
        sortie = reetirerParChemin(audioA, donnees.chemin, SAUT_TRAME_CHROMAGRAMME, decalage);
      } catch (e: any) {
        return { valeurs: [null], erreur: true, message: e?.message ?? String(e) };
      }

      return {
        valeurs: [sortie],
        message: traduire("msg.etirement_dtw_termine_var_0", sortie.duration.toFixed(2)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
