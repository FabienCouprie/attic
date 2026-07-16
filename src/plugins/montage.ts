// plugins/montage.ts — Nœuds montage (issus du découpage de complements.ts).

import type { PluginDef } from "../core";
import {
  appliquerEchoPingPong, appliquerReverbeProgressive,
  reinsererZone, melangerPistes, placerSonSurZones,
  fusionnerPistes, bouclerAudio,
} from "../audio";
import { avecDoc } from "./notices";

export const fiches: PluginDef[] = ([
  {
    id: "echo-ping-pong", nom: "Echo Ping-Pong", nomEn: "Ping-Pong Echo", univers: "Traitement", famille: "Effets",
    resume: "Écho stéréo ping-pong.",
    resumeEn: "Stereo ping-pong echo.",
    entrees: [{ nom: "Audio", type: "audio" }], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Temps", nomEn: "Time", defaut: 250, unite: "ms", doc: "Délai entre les répétitions.", docEn: "Delay between repeats." },
      { nom: "Feedback", nomEn: "Feedback", defaut: 35, unite: "%", doc: "Quantité de signal réinjecté.", docEn: "Amount fed back." },
      { nom: "Pan", nomEn: "Pan", defaut: 80, unite: "%", doc: "Répartition gauche/droite.", docEn: "Left/right balance." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0); if (!(a instanceof AudioBuffer)) return { valeurs:[null] };
      return { valeurs: [await appliquerEchoPingPong(a, ctx.paramNombre("Temps",250), ctx.paramNombre("Feedback",35), ctx.paramNombre("Pan",80))] };
    },
  },
  {
    id: "reverb-progressive", nom: "Reverb Progressive", nomEn: "Progressive Reverb", univers: "Traitement", famille: "Effets",
    resume: "Réverbération progressive (dry→wet).",
    resumeEn: "Progressive reverb (dry→wet).",
    entrees: [{ nom: "Audio", type: "audio" }], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Taille", nomEn: "Size", defaut: 50, doc: "Taille de la pièce simulée.", docEn: "Simulated room size." },
      { nom: "Début", nomEn: "Start", defaut: 0, doc: "Mix wet au début (0=sec seulement).", docEn: "Wet mix at start (0=dry only)." },
      { nom: "Fin", nomEn: "End", defaut: 50, doc: "Mix wet à la fin du fondu.", docEn: "Wet mix after fade completes." },
      { nom: "Fondu", nomEn: "Fade", defaut: 8, unite: "s", doc: "Durée du fondu progressif.", docEn: "Duration of the progressive fade." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0); if (!(a instanceof AudioBuffer)) return { valeurs:[null] };
      const fondu = ctx.paramNombre("Fondu", 0);
      const d = fondu > 0 ? fondu : a.duration;
      return { valeurs: [await appliquerReverbeProgressive(a, ctx.paramNombre("Taille",50), ctx.paramNombre("Début",0), ctx.paramNombre("Fin",50), d)] };
    },
  },
  {
    id: "amplificateur", nom: "Amplificateur", univers: "Traitement", famille: "Effets",
    resume: "Amplification/atténuation du signal.",
    entrees: [{ nom: "Audio", type: "audio" }], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [{nom:"Gain",plage:[-60,60],defaut:0,unite:"dB"}],
    async executer(ctx: any) {
      const a = ctx.entree(0); if (!(a instanceof AudioBuffer)) return { valeurs:[null] };
      const g = Math.pow(10, ctx.paramNombre("Gain",0)/20);
      const r = new AudioBuffer({numberOfChannels:a.numberOfChannels,length:a.length,sampleRate:a.sampleRate});
      for (let ch=0;ch<a.numberOfChannels;ch++) { const s=a.getChannelData(ch),d=r.getChannelData(ch); for(let i=0;i<s.length;i++) d[i]=s[i]*g; }
      return { valeurs:[r] };
    },
  },

  // ── Montage ──
  {
    id: "reinserer-zone", nom: "Réinsérer une zone", univers: "Traitement", famille: "Montage",
    resume: "Réinsère une zone traitée dans la piste originale.",
    entrees: [{ nom: "Piste", type: "audio" }, { nom: "Zone traitée", type: "audio" }, { nom: "Position", type: "controle" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [{ nom:"Fondu", plage:[0,100], defaut:15, unite:"ms" }],
    async executer(ctx: any) {
      const piste = ctx.entree(0), zone = ctx.entree(1), pos = ctx.entree(2);
      if (!(piste instanceof AudioBuffer)) return { valeurs:[null], message:"Piste non connectée." };
      if (!(zone instanceof AudioBuffer)) return { valeurs:[null], message:"Zone non connectée." };
      if (!pos || typeof pos !== "object" || !("debut" in pos)) return { valeurs:[null], message:"Position non connectée." };
      const fondu = ctx.paramNombre("Fondu",15)/1000;
      return { valeurs:[reinsererZone(piste, zone, (pos as any).debut, fondu)] };
    },
  },
  {
    id: "selecteur-multi-zones", nom: "Sélecteur multi-zones", nomEn: "Multi-Zone Selector", univers: "Traitement", famille: "Montage",
    resume: "Sélectionne plusieurs zones audio et les transmet en liste.",
    resumeEn: "Selects multiple audio zones and passes them as a list.",
    entrees: [{ nom: "Audio", type: "audio" }], sorties: [{ nom: "Audio", type: "audio" }, { nom: "Zones", type: "controle" }, { nom: "Durée", type: "controle" }],
    parametres: [],
    async executer(ctx: any) {
      const a = ctx.entree(0); if (!(a instanceof AudioBuffer)) return { valeurs:[null,null,null] };
      return { valeurs:[a, (ctx.noeud.data as any).zonesSelectionnees ?? [], { debut: 0, duree: a.duration }] };
    },
  },
  {
    id: "masque-zones", nom: "Masque de zones", nomEn: "Zone Mask", univers: "Traitement", famille: "Montage",
    resume: "Selon l'option, supprime le son sur les zones sélectionnées ou ne conserve qu'elles.",
    resumeEn: "Depending on the option, mutes the selected zones or keeps only them.",
    entrees: [{ nom: "Audio", type: "audio" }, { nom: "Zones", type: "controle" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Action", nomEn: "Action", type: "choix",
        options: ["Supprimer les zones", "Conserver les zones"], defaut: "Supprimer les zones",
        doc: "« Supprimer » coupe le son dans les zones et garde le reste ; « Conserver » ne garde que les zones et coupe le reste. Les deux sont complémentaires.",
        docEn: "« Mute » silences the zones and keeps the rest; « Keep » keeps only the zones and silences the rest. The two are complementary." },
      { nom: "Fondu", nomEn: "Fade", plage: [0, 100], defaut: 10, unite: "ms",
        doc: "Fondu appliqué aux bords des zones pour éviter les clics.", docEn: "Fade applied at zone edges to avoid clicks." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Connectez une source audio." };
      const z = ctx.entree(1);
      const zones = (Array.isArray(z) ? z : []).filter((x: any) => x && typeof x.debut === "number" && typeof x.duree === "number");
      const garder = ctx.paramTexte("Action", "Supprimer les zones") === "Conserver les zones";
      const sr = a.sampleRate, len = a.length;

      // Masque binaire : dans une zone sélectionnée ?
      const dansZone = new Uint8Array(len);
      for (const zn of zones) {
        const d = Math.max(0, Math.floor(zn.debut * sr));
        const f = Math.min(len, Math.floor((zn.debut + zn.duree) * sr));
        for (let i = d; i < f; i++) dansZone[i] = 1;
      }
      // On garde le sample si : (Conserver ⇒ dans une zone) / (Supprimer ⇒ hors zone)
      const k = new Float32Array(len);
      for (let i = 0; i < len; i++) k[i] = (garder ? dansZone[i] === 1 : dansZone[i] === 0) ? 1 : 0;

      // Fondus linéaires centrés sur chaque transition (anti-clic)
      const nf = Math.max(0, Math.floor((ctx.paramNombre("Fondu", 10) / 1000) * sr));
      const g = k.slice();
      if (nf > 0) {
        const half = Math.max(1, nf >> 1);
        for (let i = 1; i < len; i++) {
          if (k[i] !== k[i - 1]) {
            for (let j = -half; j < half; j++) {
              const idx = i + j; if (idx < 0 || idx >= len) continue;
              const t = (j + half) / (2 * half);
              g[idx] = k[i - 1] + (k[i] - k[i - 1]) * t;
            }
          }
        }
      }

      const out = new AudioBuffer({ numberOfChannels: a.numberOfChannels, length: len, sampleRate: sr });
      for (let c = 0; c < a.numberOfChannels; c++) {
        const s = a.getChannelData(c), o = out.getChannelData(c);
        for (let i = 0; i < len; i++) o[i] = s[i] * g[i];
      }
      return { valeurs: [out], message: `${garder ? "Conservé" : "Supprimé"} ${zones.length} zone(s)` };
    },
  },
  {
    id: "placer-sons-zones", nom: "Placer un son sur zones", nomEn: "Place sound on zones", univers: "Traitement", famille: "Montage",
    resume: "Insère une copie d'un son au centre de chaque zone, sur une piste de durée donnée.",
    resumeEn: "Inserts a copy of a sound at the center of each zone, on a track of the given duration.",
    entrees: [
      { nom: "Son", type: "audio" },
      { nom: "Durée", type: "controle" },
      { nom: "Zones", type: "controle" },
    ],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [],
    async executer(ctx: any) {
      const son = ctx.entree(0);
      const duree = ctx.entree(1);
      const zones = ctx.entree(2);
      if (!(son instanceof AudioBuffer)) return { valeurs:[null], message:"Son non connecté." };
      if (!duree || typeof duree !== "object" || !("duree" in duree)) return { valeurs:[null], message:"Branchez une Durée (Extraire durée)." };
      if (!Array.isArray(zones)) return { valeurs:[null], message:"Branchez le Sélecteur multi-zones." };
      if (!zones.length) return { valeurs:[null], message:"Aucune zone à placer." };
      return { valeurs:[placerSonSurZones(son, (duree as any).duree, zones as any)] };
    },
  },
  {
    id: "melangeur", nom: "Mélangeur", univers: "Traitement", famille: "Montage",
    resume: "Mélange plusieurs pistes avec niveaux réglables.",
    entrees: [{ nom: "Piste", type: "audio", dynamique: true }], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [],
    async executer(ctx: any) {
      const bufs = ctx.entrees().filter((v: any) => v instanceof AudioBuffer);
      if (bufs.length < 2) return { valeurs:[null], message:"≥ 2 entrées." };
      return { valeurs:[await melangerPistes(bufs, 0)] };
    },
  },
  {
    id: "jointure-audio", nom: "Jointure audio", nomEn: "Audio Join", univers: "Traitement", famille: "Montage",
    resume: "Place deux pistes l'une après l'autre avec un fondu enchaîné.",
    resumeEn: "Places two tracks one after the other with a crossfade.",
    notice: "Met bout à bout deux pistes. La première se ferme en fondu pendant que la seconde s'ouvre, sur une durée de chevauchement réglable. Un chevauchement nul donne une simple concaténation.",
    noticeEn: "Puts two tracks end to end. The first fades out while the second fades in over an adjustable overlap. Zero overlap gives a plain concatenation.",
    entrees: [{ nom: "Piste 1", nomEn: "Track 1", type: "audio" }, { nom: "Piste 2", nomEn: "Track 2", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Chevauchement", nomEn: "Overlap", plage: [0,30], pas: 0.1, defaut: 2, unite: "s", doc: "Durée du fondu enchaîné entre la fin de la piste 1 et le début de la piste 2.", docEn: "Crossfade duration between the end of track 1 and the start of track 2." },
    ],
    async executer(ctx: any) {
      const p1 = ctx.entree(0), p2 = ctx.entree(1);
      if (!(p1 instanceof AudioBuffer) || !(p2 instanceof AudioBuffer)) return { valeurs:[null], message:"Branchez deux pistes." };
      return { valeurs:[await fusionnerPistes(p1, p2, ctx.paramNombre("Chevauchement", 2))] };
    },
  },
  {
    id: "simple-boucle", nom: "Boucle", nomEn: "Loop", univers: "Traitement", famille: "Effets",
    resume: "Répète l'intégralité du signal un nombre de fois donné.",
    resumeEn: "Repeats the whole signal a given number of times.",
    notice: "Rejoue toute l'entrée « Répétitions » fois à la suite. Un court fondu enchaîné à chaque raccord adoucit la jonction et limite le clic audible.",
    noticeEn: "Replays the whole input « Repeats » times in a row. A short crossfade at each join smooths the transition and limits audible clicks.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Répétitions", nomEn: "Repeats", plage: [1,32], pas: 1, defaut: 4, doc: "Nombre de fois où l'entrée est rejouée à la suite.", docEn: "Number of times the input is replayed in a row." },
      { nom: "Fondu", nomEn: "Fade", plage: [0,100], defaut: 10, unite: "ms", doc: "Fondu enchaîné à chaque raccord entre deux répétitions.", docEn: "Crossfade at each join between two repetitions." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0); if (!(a instanceof AudioBuffer)) return { valeurs:[null], message:"Aucune entrée." };
      const reps = ctx.paramNombre("Répétitions", 4);
      const out = bouclerAudio(a, a.duration, reps, ctx.paramNombre("Fondu", 10));
      // Rend visible la durée réelle de l'entrée : si le total dépasse reps×4 s,
      // c'est que l'entrée fait déjà plus de 4 s (padding MP3, réverb/délai amont…),
      // pas la boucle — qui produit exactement reps × durée d'entrée.
      return { valeurs:[out], message: `${reps} × ${a.duration.toFixed(2)}s = ${out.duration.toFixed(2)}s` };
    },
  },

  // ── Générateurs ──
  {
    id: "extraire-duree", nom: "Extraire durée", nomEn: "Extract duration", univers: "Traitement", famille: "Montage",
    resume: "Mesure la durée d'une piste et la transmet.",
    resumeEn: "Measures track duration and passes it along.",
    notice: "Produit une position début=0 / durée=longueur utilisable par les blocs qui acceptent une entrée de contrôle.",
    noticeEn: "Produces a start=0 / duration=length position usable by nodes that accept a control input.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "Durée", type: "controle" }],
    parametres: [],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null, null], message: "Aucune entrée." };
      return { valeurs: [a, { debut: 0, duree: a.duration }] };
    },
  },

  // ── Visualisation + Convertisseur ──

  // ── Extraction de zone (depuis sélecteur multi-zones) ──
  {
    id: "extraire-zones-selecteur", nom: "Extraire zones (sélecteur)", nomEn: "Extract Zones (Selector)",
    univers: "Traitement", famille: "Montage",
    resume: "Extrait la zone temporelle exacte depuis le sélecteur multi-zones.",
    resumeEn: "Extracts the exact time zone from the multi-zone selector.",
    entrees: [{ nom: "Audio", type: "audio" }, { nom: "Zones", type: "controle" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Zone", nomEn: "Zone", plage: [1, 100], pas: 1, defaut: 1,
        doc: "Numéro de la zone à extraire (1 = première zone sélectionnée dans le sélecteur multi-zones).",
        docEn: "Number of the zone to extract (1 = first zone selected in the multi-zone selector)." },
      { nom: "Fondu", nomEn: "Fade", plage: [0, 100], defaut: 5, unite: "ms",
        doc: "Fondu aux bords de la zone extraite pour éviter les clics.", docEn: "Fade at the extracted zone edges to avoid clicks." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      const z = ctx.entree(1);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Connectez une source audio." };
      const zones = (Array.isArray(z) ? z : []).filter((x: any) => x && typeof x.debut === "number" && typeof x.duree === "number");
      if (zones.length === 0) return { valeurs: [null], message: "Aucune zone reçue — branchez le sélecteur multi-zones." };
      const numZone = Math.max(1, Math.min(zones.length, Math.round(ctx.paramNombre("Zone", 1)))) - 1;
      const zone = zones[numZone];
      const sr = a.sampleRate;
      const debutEch = Math.max(0, Math.floor(zone.debut * sr));
      const finEch = Math.min(a.length, Math.ceil((zone.debut + zone.duree) * sr));
      const longueur = finEch - debutEch;
      if (longueur <= 0) return { valeurs: [null], message: "Zone vide." };

      const fonduEch = Math.min(Math.floor(longueur / 2), Math.round((ctx.paramNombre("Fondu", 5) / 1000) * sr));
      const resultat = new AudioBuffer({ numberOfChannels: a.numberOfChannels, length: longueur, sampleRate: sr });

      for (let ch = 0; ch < a.numberOfChannels; ch++) {
        const src = a.getChannelData(ch);
        const dst = resultat.getChannelData(ch);
        for (let i = 0; i < longueur; i++) {
          let echantillon = src[debutEch + i];
          // Fondu d'ouverture
          if (i < fonduEch) {
            const t = i / fonduEch;
            echantillon *= 0.5 * (1 - Math.cos(Math.PI * t));
          }
          // Fondu de fermeture
          if (i >= longueur - fonduEch) {
            const t = (longueur - i) / fonduEch;
            echantillon *= 0.5 * (1 - Math.cos(Math.PI * t));
          }
          dst[i] = echantillon;
        }
      }

      return {
        valeurs: [resultat],
        message: `Zone ${numZone + 1}/${zones.length} extraite · ${zone.duree.toFixed(2)}s · ${(debutEch / sr).toFixed(2)}→${(finEch / sr).toFixed(2)}s`,
      };
    },
  },
] as PluginDef[]).map(avecDoc);
