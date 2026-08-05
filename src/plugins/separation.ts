// plugins/separation.ts — Nœuds separation (issus du découpage de complements.ts).

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "separateur-ia", nom: "Séparateur IA", nomEn: "AI Separator", univers: "Traitement", famille: "Effets",
    resume: "Sépare les sources audio via IA (Demucs 4/6 stems, MDX-Net).",
    resumeEn: "Separates audio sources via AI (Demucs 4/6 stems, MDX-Net).",
    notice: "Sépare une piste en stems. Demucs (HT) = 4 pistes (batterie, basse, voix, autre). Demucs 6s = 6 pistes (batterie, basse, voix, autre, guitare, piano). MDX-Net = voix + instrumental. Les modèles par défaut sont embarqués (public/oonx/) et chargés automatiquement. Vous pouvez aussi charger votre propre .onnx via le bouton du nœud ou renseigner une URL.",
    noticeEn: "Splits a track into stems. Demucs (HT) = 4 stems (drums, bass, vocals, other). Demucs 6s = 6 stems (drums, bass, vocals, other, guitar, piano). MDX-Net = vocals + instrumental. Default models are bundled (public/oonx/) and loaded automatically. You may also load your own .onnx via the node button or provide a URL.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Batterie", nomEn: "Drums", type: "audio" },{ nom: "Basse", nomEn: "Bass", type: "audio" },{ nom: "Voix", nomEn: "Vocals", type: "audio" },{ nom: "Autre", nomEn: "Other", type: "audio" },{ nom: "Guitare", nomEn: "Guitar", type: "audio" },{ nom: "Piano", nomEn: "Piano", type: "audio" }],
    parametres: [
      { nom:"Modèle", nomEn:"Model", type:"choix", options:["Demucs 6s","Demucs (HT)","MDX-Net"], optionsEn:["Demucs 6s","Demucs (HT)","MDX-Net"], defaut:"Demucs 6s",
        doc:"Architecture de séparation. Demucs (HT) = 4 pistes, Demucs 6s = 6 pistes (+ guitare + piano), MDX-Net = voix/instrumental.",
        docEn:"Separation architecture. Demucs (HT) = 4 stems, Demucs 6s = 6 stems (+ guitar + piano), MDX-Net = vocals/instrumental.", defautEn: "Demucs 6s" },
      { nom:"URL du modèle", nomEn:"Model URL", type:"texte", defaut:"", doc:"URL d'un modèle .onnx. Vide = modèle par défaut du dossier public/oonx/.", docEn:"URL of an .onnx model. Empty = default model from public/oonx/.", defautEn: "" },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0); if (!(a instanceof AudioBuffer)) return { valeurs:[null,null,null,null,null,null], message:traduire("msg.aucune_entr_e") };
      const modele = ctx.paramTexte("Modèle","Demucs (HT)");
      const api = (window as any).api;
      const nulls6 = [null,null,null,null,null,null];

      // ── Demucs 4-stem (natif) ──
      if (modele === "Demucs (HT)") {
        if (!api?.separerDemucs) return { valeurs:nulls6, message:traduire("msg.demucs_n_cessite_l_application_de_bureau") };
        const canaux: Float32Array[] = [];
        for (let ch = 0; ch < a.numberOfChannels; ch++) canaux.push(a.getChannelData(ch));
        ctx.onProgress(traduire("progress.s_paration_demucs_4_stem_natif"));
        const rep = await api.separerDemucs({ utiliserModeleEmbarque: true, canaux });
        if (!rep?.ok) return { valeurs:nulls6, message: rep?.erreur || "Échec Demucs." };
        const versBuffer = (st: [Float32Array, Float32Array] | null): AudioBuffer | null => {
          if (!st) return null;
          const buf = new AudioBuffer({ numberOfChannels: 2, length: st[0].length, sampleRate: a.sampleRate });
          buf.copyToChannel(new Float32Array(st[0]), 0);
          buf.copyToChannel(new Float32Array(st[1]), 1);
          return buf;
        };
        const s = rep.stems;
        return { valeurs: [versBuffer(s.batterie), versBuffer(s.basse), versBuffer(s.voix), versBuffer(s.autre), null, null], message: traduire("msg.s_par_4_pistes_batterie_basse_voix_autre") };
      }

      // ── Demucs 6-stem (natif) ──
      if (modele === "Demucs 6s") {
        if (!api?.separerDemucs) return { valeurs:nulls6, message:traduire("msg.demucs_6s_n_cessite_l_application_de_bureau") };
        const canaux: Float32Array[] = [];
        for (let ch = 0; ch < a.numberOfChannels; ch++) canaux.push(a.getChannelData(ch));
        ctx.onProgress(traduire("progress.s_paration_demucs_6_stem_natif"));
        const rep = await api.separerDemucs({ utiliserModeleEmbarque: true, canaux, modele6s: true });
        if (!rep?.ok) return { valeurs:nulls6, message: rep?.erreur || "Échec Demucs 6s." };
        const versBuffer = (st: [Float32Array, Float32Array] | null): AudioBuffer | null => {
          if (!st) return null;
          const buf = new AudioBuffer({ numberOfChannels: 2, length: st[0].length, sampleRate: a.sampleRate });
          buf.copyToChannel(new Float32Array(st[0]), 0);
          buf.copyToChannel(new Float32Array(st[1]), 1);
          return buf;
        };
        const s = rep.stems;
        return { valeurs: [versBuffer(s.batterie), versBuffer(s.basse), versBuffer(s.voix), versBuffer(s.autre), versBuffer(s.guitare), versBuffer(s.piano)], message: traduire("msg.s_par_6_pistes_batterie_basse_voix_autre_guitare_piano") };
      }

      // ── MDX-Net : chemin renderer WASM (modèle plus léger) ──
      const { telechargerDepuisUrl, preparerSession, separerAvecSession } = await import("../ia");
      const url = ctx.paramTexte("URL du modèle","");
      let octets: ArrayBuffer | null = null;
      const fichier = ctx.noeud.data.modeleFichier as File | undefined;
      if (fichier) {
        octets = await fichier.arrayBuffer();
      } else if (url) {
        ctx.onProgress(traduire("progress.chargement_du_mod_le"));
        octets = await telechargerDepuisUrl(url, (p: number) => ctx.onProgress(traduire("progress.mod_le_var_0", Math.round(p))));
      } else {
        ctx.onProgress(traduire("progress.chargement_du_mod_le_mdx_embarqu"));
        const reponse = await fetch("oonx/modele-separation.onnx");
        if (reponse.ok) octets = await reponse.arrayBuffer();
      }
      if (!octets) return { valeurs:nulls6, message:traduire("msg.mod_le_mdx_non_disponible") };
      ctx.onProgress(traduire("progress.pr_paration_de_la_session"));
      const session = await preparerSession(octets, "Auto", modele);
      const r = await separerAvecSession(a, session, (p: number) => ctx.onProgress(traduire("progress.s_paration_var_0", Math.round(p))), "mdx");
       return { valeurs:[null, null, r.voix, r.autre, null, null], message:traduire("msg.s_par_voix_instrumental") };
   },
 },
] as FicheAudio[]).map(avecDoc);
