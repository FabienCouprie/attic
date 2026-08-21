// plugins/montage.ts — Nœuds montage (issus du découpage de complements.ts).

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import {
  appliquerEchoPingPong, appliquerReverbeProgressive,
  reinsererZone, melangerPistes, placerSonSurZones,
  fusionnerPistes, bouclerAudio,
} from "../audio";
import { avecDoc } from "./notices";
import { creerAleatoire } from "../core";

function zonesValides(z: any) {
  return (Array.isArray(z) ? z : []).filter((x: any) => x && typeof x.debut === "number" && typeof x.duree === "number");
}

function fusionnerZones(zones: any[]): any[] {
  if (zones.length === 0) return [];
  const tri = [...zones].sort((a, b) => a.debut - b.debut);
  const res = [tri[0]];
  for (let i = 1; i < tri.length; i++) {
    const last = res[res.length - 1];
    const cur = tri[i];
    if (cur.debut <= last.debut + last.duree) {
      last.duree = Math.max(last.debut + last.duree, cur.debut + cur.duree) - last.debut;
    } else {
      res.push(cur);
    }
  }
  return res;
}

function complementZones(zones: any[], dureeTotale: number): any[] {
  if (zones.length === 0) return [{ debut: 0, duree: dureeTotale }];
  const res: any[] = [];
  let fin = 0;
  for (const z of zones) {
    if (z.debut > fin) res.push({ debut: fin, duree: z.debut - fin });
    fin = Math.max(fin, z.debut + z.duree);
  }
  if (fin < dureeTotale) res.push({ debut: fin, duree: dureeTotale - fin });
  return res;
}

function appliquerFonduSegment(src: Float32Array, dst: Float32Array, offset: number, len: number, fonduEch: number) {
  if (fonduEch <= 0) {
    for (let i = 0; i < len; i++) dst[offset + i] = src[i];
    return;
  }
  for (let i = 0; i < len; i++) {
    let echantillon = src[i];
    if (i < fonduEch) {
      const t = i / fonduEch;
      echantillon *= 0.5 * (1 - Math.cos(Math.PI * t));
    } else if (i >= len - fonduEch) {
      const t = (len - i) / fonduEch;
      echantillon *= 0.5 * (1 - Math.cos(Math.PI * t));
    }
    dst[offset + i] = echantillon;
  }
}

export const fiches: FicheAudio[] = ([
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
      { nom: "Graine", nomEn: "Seed", plage: [1, 999999], pas: 1, defaut: 42,
        doc: "Graine du bruit de la réponse impulsionnelle. Valeur par défaut FIXE : une réverbération qui change de pièce à chaque exécution serait un défaut.",
        docEn: "Seed for the impulse-response noise. The default is FIXED: a reverb that moves to a different room on every run would be a defect." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0); if (!(a instanceof AudioBuffer)) return { valeurs:[null] };
      const fondu = ctx.paramNombre("Fondu", 0);
      const d = fondu > 0 ? fondu : a.duration;
      return { valeurs: [await appliquerReverbeProgressive(a, ctx.paramNombre("Taille",50), ctx.paramNombre("Début",0), ctx.paramNombre("Fin",50), d,
        creerAleatoire(ctx.paramNombre("Graine", 42)))] };
   },
 },
  {
    id: "amplificateur", nom: "Amplificateur", univers: "Traitement", famille: "Effets",
    resume: "Amplification/atténuation du signal.",
    entrees: [{ nom: "Audio", type: "audio" }], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [{nom:"Gain",plage:[-60,60],defaut:0,unite:"dB", nomEn: "Gain"}],
    async executer(ctx: any) {
      const a = ctx.entree(0); if (!(a instanceof AudioBuffer)) return { valeurs:[null] };
      const g = Math.pow(10, ctx.paramNombre("Gain",0)/20);
      const r = new AudioBuffer({numberOfChannels:a.numberOfChannels,length:a.length,sampleRate:a.sampleRate});
      for (let ch=0;ch<a.numberOfChannels;ch++) { const s=a.getChannelData(ch),d=r.getChannelData(ch); for(let i=0;i<s.length;i++) d[i]=s[i]*g; }
      return { valeurs:[r] };
   }, nomEn: "Amplifier", resumeEn: "Amplification/ attenuation of the signal.",
 },

  // ── Montage ──
  {
    id: "reinserer-zone", nom: "Réinsérer une zone", univers: "Traitement", famille: "Montage",
    resume: "Réinsère une zone traitée dans la piste originale.",
    entrees: [{ nom: "Piste", nomEn: "Track", type: "audio" }, { nom: "Zone traitée", nomEn: "Processed zone", type: "audio" }, { nom: "Zone", nomEn: "Zone", type: "controle" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [{ nom:"Fondu", plage:[0,100], defaut:15, unite:"ms", nomEn: "Fade" }],
    async executer(ctx: any) {
      const piste = ctx.entree(0), zoneTraitee = ctx.entree(1), zoneOrigine = ctx.entree(2);
      if (!(piste instanceof AudioBuffer)) return { valeurs:[null], message:traduire("msg.piste_non_connect_e") };
      if (!(zoneTraitee instanceof AudioBuffer)) return { valeurs:[null], message:traduire("msg.zone_non_connect_e") };
      if (!zoneOrigine || typeof zoneOrigine !== "object" || !("debut" in zoneOrigine)) return { valeurs:[null], message:traduire("msg.zone_non_connect_e") };
      const fondu = ctx.paramNombre("Fondu",15)/1000;
      return { valeurs:[reinsererZone(piste, zoneTraitee, (zoneOrigine as any).debut, fondu)] };
   }, nomEn: "Reinsert Zone", resumeEn: "Reinserts a treated zone into the original track.",
  },
  {
    id: "selecteur-multi-zones", nom: "Sélecteur multi-zones", nomEn: "Multi-Zone Selector", univers: "Traitement", famille: "Montage",
    resume: "Sélectionne plusieurs zones audio et les transmet en liste.",
    resumeEn: "Selects multiple audio zones and passes them as a list.",
    entrees: [{ nom: "Audio", type: "audio" }], sorties: [{ nom: "Audio", type: "audio" }, { nom: "Zones", nomEn: "Zones", type: "controle" }, { nom: "Durée", nomEn: "Duration", type: "controle" }],
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
    entrees: [{ nom: "Audio", type: "audio" }, { nom: "Zones", nomEn: "Zones", type: "controle" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Action", nomEn: "Action", type: "choix",
        options: ["Supprimer les zones", "Conserver les zones"], optionsEn: ["Mute zones", "Keep zones"], optionIds: ["mute", "keep"], defaut: "Supprimer les zones",
        doc: "« Supprimer » coupe le son dans les zones et garde le reste ; « Conserver » ne garde que les zones et coupe le reste. Les deux sont complémentaires.",
        docEn: "« Mute » silences the zones and keeps the rest; « Keep » keeps only the zones and silences the rest. The two are complementary.", defautEn: "Mute zones" },
      { nom: "Fondu", nomEn: "Fade", plage: [0, 100], defaut: 10, unite: "ms",
        doc: "Fondu appliqué aux bords des zones pour éviter les clics.", docEn: "Fade applied at zone edges to avoid clicks." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.connectez_une_source_audio") };
      const z = ctx.entree(1);
      const zones = (Array.isArray(z) ? z : []).filter((x: any) => x && typeof x.debut === "number" && typeof x.duree === "number");
      const action = ctx.paramTexte("Action", "mute");
      const garder = action === "keep";
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

      // Fondus linéaires sur les bords extérieurs de chaque zone (anti-clic).
      // Le fondu ne s'étend pas à l'intérieur de la zone, pour que la suppression
      // ou la conservation reste totale même sur des zones très courtes.
      const nf = Math.max(0, Math.floor((ctx.paramNombre("Fondu", 10) / 1000) * sr));
      const g = k.slice();
      if (nf > 0) {
        const half = Math.max(1, nf >> 1);
        const inside = garder ? 1 : 0;
        const outside = garder ? 0 : 1;
        for (let i = 1; i < len; i++) {
          if (k[i] !== k[i - 1]) {
            if (k[i] === inside) {
              // Entrée dans une zone : fondu de l'extérieur vers l'intérieur
              for (let j = Math.max(0, i - half); j < i; j++) {
                const t = (j - (i - half)) / half;
                g[j] = outside + (inside - outside) * t;
              }
            } else {
              // Sortie d'une zone : fondu de l'intérieur vers l'extérieur
              for (let j = i; j < Math.min(len, i + half); j++) {
                const t = (j - i) / half;
                g[j] = inside + (outside - inside) * t;
              }
            }
          }
        }
      }

      const out = new AudioBuffer({ numberOfChannels: a.numberOfChannels, length: len, sampleRate: sr });
      for (let c = 0; c < a.numberOfChannels; c++) {
        const s = a.getChannelData(c), o = out.getChannelData(c);
        for (let i = 0; i < len; i++) o[i] = s[i] * g[i];
      }
      return { valeurs: [out], message: traduire("msg.var_0_var_1_zone_s", garder ? "Conservé" : "Supprimé", zones.length) };
   },
 },
  {
    id: "placer-sons-zones", nom: "Placer un son sur zones", nomEn: "Place sound on zones", univers: "Traitement", famille: "Montage",
    resume: "Insère une copie d'un son au centre de chaque zone sur une piste cible, ou sur une piste silencieuse de la durée fournie.",
    resumeEn: "Inserts a copy of a sound at the center of each zone onto a target track, or onto a silent track of the given duration.",
    entrees: [
      { nom: "Son", nomEn: "Sound", type: "audio" },
      { nom: "Piste", nomEn: "Track", type: "audio", requis: false },
      { nom: "Zones", nomEn: "Zones", type: "controle" },
      { nom: "Durée", nomEn: "Duration", type: "controle", requis: false },
    ],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [],
    async executer(ctx: any) {
      const son = ctx.entree(0);
      const piste = ctx.entree(1);
      const zones = ctx.entree(2);
      const duree = ctx.entree(3);
      if (!(son instanceof AudioBuffer)) return { valeurs:[null], message:traduire("msg.son_non_connect") };
      if (!Array.isArray(zones)) return { valeurs:[null], message:traduire("msg.branchez_le_s_lecteur_multi_zones") };
      if (!zones.length) return { valeurs:[null], message:traduire("msg.aucune_zone_placer") };
      const dureeTotaleSec = piste instanceof AudioBuffer ? piste.duration : (duree && typeof duree === "object" && "duree" in duree ? (duree as any).duree : null);
      if (typeof dureeTotaleSec !== "number" || dureeTotaleSec <= 0) return { valeurs:[null], message:traduire("msg.branchez_une_piste_ou_duree") };
      return { valeurs:[await placerSonSurZones(son, dureeTotaleSec, zones as any, piste instanceof AudioBuffer ? piste : undefined)] };
    },
  },
  {
    id: "melangeur", nom: "Mélangeur", univers: "Traitement", famille: "Montage",
    resume: "Mélange plusieurs pistes avec niveaux réglables.",
    entrees: [{ nom: "Piste", nomEn: "Track", type: "audio", dynamique: true }], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [],
    async executer(ctx: any) {
      const bufs = ctx.entrees().filter((v: any) => v instanceof AudioBuffer);
      if (bufs.length < 2) return { valeurs:[null], message:traduire("msg.2_entr_es") };
      return { valeurs:[await melangerPistes(bufs, 0)] };
   }, nomEn: "Mixer", resumeEn: "Mixes several tracks with adjustable levels.",
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
      if (!(p1 instanceof AudioBuffer) || !(p2 instanceof AudioBuffer)) return { valeurs:[null], message:traduire("msg.branchez_deux_pistes") };
      return { valeurs:[await fusionnerPistes(p1, p2, ctx.paramNombre("Chevauchement", 2))] };
   },
 },
  {
    id: "simple-boucle", nom: "Boucle", nomEn: "Loop", univers: "Traitement", famille: "Effets",
    resume: "Répète l'intégralité du signal un nombre de fois donné.",
    resumeEn: "Repeats the whole signal a given number of times.",
    notice: "Rejoue toute l'entrée « Répétitions » fois à la suite. Le paramètre Fondu permet d'adoucir chaque jonction ; à 0 ms le raccord est sec.",
    noticeEn: "Replays the whole input « Repeats » times in a row. The Fade parameter can smooth each join; at 0 ms the join is hard.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Répétitions", nomEn: "Repeats", plage: [1,32], pas: 1, defaut: 4, doc: "Nombre de fois où l'entrée est rejouée à la suite.", docEn: "Number of times the input is replayed in a row." },
      { nom: "Fondu", nomEn: "Fade", plage: [0,100], defaut: 0, unite: "ms", doc: "Fondu enchaîné à chaque raccord entre deux répétitions. 0 = pas de fondu (raccord sec).", docEn: "Crossfade at each join between two repetitions. 0 = no crossfade (hard join)." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0); if (!(a instanceof AudioBuffer)) return { valeurs:[null], message:traduire("msg.aucune_entr_e") };
      const reps = ctx.paramNombre("Répétitions", 4);
      const out = bouclerAudio(a, a.duration, reps, ctx.paramNombre("Fondu", 0));
      // Rend visible la durée réelle de l'entrée : si le total dépasse reps×4 s,
      // c'est que l'entrée fait déjà plus de 4 s (padding MP3, réverb/délai amont…),
      // pas la boucle — qui produit exactement reps × durée d'entrée.
      return { valeurs:[out], message: traduire("msg.var_0_var_1_s_var_2_s", reps, a.duration.toFixed(2), out.duration.toFixed(2)) };
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
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "Durée", nomEn: "Duration", type: "controle" }],
    parametres: [],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      return { valeurs: [a, { debut: 0, duree: a.duration }] };
   },
 },

   // ── Visualisation + Convertisseur ──

  // ── Extraction de zones (depuis sélecteur multi-zones) ──
  {
    id: "extraire-zones-selecteur", nom: "Extraire zones (sélecteur)", nomEn: "Extract Zones (Selector)",
    univers: "Traitement", famille: "Montage",
    resume: "Découpe et concatène les zones choisies dans le sélecteur multi-zones.",
    resumeEn: "Cuts and concatenates the zones chosen in the multi-zone selector.",
    entrees: [{ nom: "Audio", type: "audio" }, { nom: "Zones", nomEn: "Zones", type: "controle" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "Zones", nomEn: "Zones", type: "controle" }],
    parametres: [
      { nom: "Mode", nomEn: "Mode", type: "choix",
        options: ["Zones sélectionnées", "Zones non sélectionnées"], optionsEn: ["Selected zones", "Unselected zones"], optionIds: ["selected", "unselected"], defaut: "Zones sélectionnées",
        doc: "Conserve les zones sélectionnées, ou à l'inverse les parties situées entre elles.",
        docEn: "Keep the selected zones, or conversely the parts between them.", defautEn: "Selected zones" },
      { nom: "Fondu", nomEn: "Fade", plage: [0, 100], defaut: 5, unite: "ms",
        doc: "Fondu aux bords de chaque zone extraite pour éviter les clics.", docEn: "Fade at the edges of each extracted zone to avoid clicks." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      const z = ctx.entree(1);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null, null], message: traduire("msg.connectez_une_source_audio") };
      const selected = zonesValides(z);
      if (selected.length === 0) return { valeurs: [null, null], message: traduire("msg.aucune_zone_re_ue_branchez_le_s_lecteur_multi_zones") };
      const mode = ctx.paramTexte("Mode", "selected");
      const sr = a.sampleRate;
      const dureeTotale = a.duration;
      const segments = mode === "unselected" ? complementZones(fusionnerZones(selected), dureeTotale) : selected;
      if (segments.length === 0) return { valeurs: [null, null], message: traduire("msg.aucune_zone_extraite") };

      const fonduSec = Math.max(0, ctx.paramNombre("Fondu", 5) / 1000);
      const totalSamples = segments.reduce((sum, zone) => {
        const d = Math.max(0, Math.floor(zone.debut * sr));
        const f = Math.min(a.length, Math.ceil((zone.debut + zone.duree) * sr));
        return sum + Math.max(0, f - d);
      }, 0);
      const resultat = new AudioBuffer({ numberOfChannels: a.numberOfChannels, length: totalSamples, sampleRate: sr });
      const extractedZones: any[] = [];
      let offset = 0;
      const temp = new Float32Array(a.length);

      for (const zone of segments) {
        const debutEch = Math.max(0, Math.floor(zone.debut * sr));
        const finEch = Math.min(a.length, Math.ceil((zone.debut + zone.duree) * sr));
        const len = finEch - debutEch;
        if (len <= 0) continue;
        const fonduEch = Math.min(Math.floor(len / 2), Math.round(fonduSec * sr));
        for (let ch = 0; ch < a.numberOfChannels; ch++) {
          const src = a.getChannelData(ch);
          const dst = resultat.getChannelData(ch);
          for (let i = 0; i < len; i++) temp[i] = src[debutEch + i];
          appliquerFonduSegment(temp, dst, offset, len, fonduEch);
        }
        extractedZones.push({ debut: offset / sr, duree: len / sr });
        offset += len;
      }

      return {
        valeurs: [resultat, extractedZones],
        message: traduire("msg.var_0_zones_rabout_es_var_1_s", extractedZones.length, (offset / sr).toFixed(2)),
      };
   },
  },
] as FicheAudio[]).map(avecDoc);
