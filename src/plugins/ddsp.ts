// plugins/ddsp.ts — Nœud de transfert de timbre (tone transfer) via DDSP.
// @magenta/music : Apache 2.0 — ajouté dans THIRD_PARTY.md.
//
// Utilise SPICE pour extraire f0/loudness d’un audio, puis un modèle DDSP
// pré-entraîné pour resynthétiser le signal avec le timbre d’un instrument.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";
import { entreeAudio, sansEntree } from "./lire-entree";
import { withElectronFetch } from "./electronFetch";
import { baseModeleLivre } from "./base-modeles";
import { annoncerModele } from "./message-modele";

const OUTPUT_SR = 48000;

/**
 * LES POINTS DE CONTRÔLE SONT LIVRÉS AVEC L'APPLICATION, depuis le 2026-11-23 : les quatre
 * instruments sous `public/magenta/ddsp/`, SPICE sous `public/magenta/spice/`, publiés sur la release
 * `assets` (paquets `magenta-ddsp` et `magenta-spice` du manifeste).
 *
 * Ils se chargeaient à l'exécution, les instruments depuis `storage.googleapis.com`, SPICE depuis
 * `tfhub.dev` que Kaggle redirige : une installation sans réseau ne pouvait pas employer le nœud,
 * rien ne vérifiait ce qui arrivait, et ils venaient d'un tiers, contre la règle du dépôt. Chaque
 * instrument garde le dossier qu'il porte chez Magenta. Les libellés anglais sont lus aussi.
 */
export const DOSSIERS_DDSP: Record<string, string> = {
  "Violon": "violin", "Flûte": "flute", "Saxophone ténor": "tenor_saxophone", "Trompette": "trumpet",
  "Violin": "violin", "Flute": "flute", "Tenor saxophone": "tenor_saxophone", "Trumpet": "trumpet",
};

/** Le dossier de SPICE. Sa bibliothèque y ajoute `/model.json?tfjs-format=file`, que le serveur ignore. */
export const adresseSpice = (): string => baseModeleLivre("magenta/spice");

/** L'adresse du point de contrôle : celle qu'on a écrite dans « URL modèle », sinon l'instrument livré. */
export function adresseDdsp(instrument: string, customUrl: string): string | null {
  if (customUrl.trim()) return customUrl.trim();
  const dossier = DOSSIERS_DDSP[instrument];
  return dossier ? baseModeleLivre(`magenta/ddsp/${dossier}`) : null;
}

let spiceInstance: any = null;
const ddspInstances = new Map<string, any>();

async function getSpice() {
  if (!spiceInstance) {
    try {
      const mm = await import("@magenta/music");
      spiceInstance = await withElectronFetch(async () => {
        const s = new mm.SPICE(adresseSpice());
        await s.initialize();
        return s;
      });
    } catch (err: any) {
      throw new Error(`SPICE model failed to load: ${err?.message ?? err}`);
    }
  }
  return spiceInstance;
}

async function getDdsp(url: string) {
  if (!ddspInstances.has(url)) {
    try {
      const mm = await import("@magenta/music");
      const ddsp = await withElectronFetch(async () => {
        const d = new mm.DDSP(url);
        await d.initialize();
        return d;
      });
      ddspInstances.set(url, ddsp);
    } catch (err: any) {
      throw new Error(`DDSP checkpoint failed to load (${url}): ${err?.message ?? err}`);
    }
  }
  return ddspInstances.get(url);
}

async function appliquerDDSP(buffer: AudioBuffer, instrument: string, customUrl: string): Promise<AudioBuffer> {
  const url = adresseDdsp(instrument, customUrl);
  if (!url) throw new Error(`Instrument DDSP inconnu : ${instrument}`);

  const [spice, ddsp] = await Promise.all([getSpice(), getDdsp(url)]);
  const features = await spice.getAudioFeatures(buffer);
  const samples = (await ddsp.synthesize(features)) as Float32Array;

  const out = new AudioBuffer({ numberOfChannels: 1, length: samples.length, sampleRate: OUTPUT_SR });
  out.getChannelData(0).set(samples);
  return out;
}

export const fiches: FicheAudio[] = ([
  fiche({
    id: "ddsp-tone-transfer", nomDicte: "transfert de timbre", nom: "DDSP Tone Transfer", nomEn: "DDSP Tone Transfer",
    univers: "Traitement", famille: "Effets",
    resume: "Transfère le timbre d’un audio vers un instrument par modèle DDSP (violon, flûte, saxophone, trompette).",
    resumeEn: "Transfers the timbre of an audio clip to an instrument via a DDSP model (violin, flute, saxophone, trumpet).",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Instrument", nomEn: "Instrument", type: "choix",
        options: ["Violon", "Flûte", "Saxophone ténor", "Trompette"], optionIds: ["Violon","Flûte","Saxophone ténor","Trompette"],
        optionsEn: ["Violin", "Flute", "Tenor saxophone", "Trumpet"],
        defaut: "Violon",
        doc: "Instrument cible du transfert de timbre.",
        docEn: "Target instrument for the timbre transfer.", defautEn: "Violin" },
      { nom: "URL modèle", nomEn: "Model URL", type: "texte", defaut: "",
        doc: "URL personnalisée d’un checkpoint DDSP. Si renseignée, elle remplace l’instrument choisi.",
        docEn: "Custom URL of a DDSP checkpoint. If set, it overrides the selected instrument.", defautEn: "" },
    ],
    async executer(ctx) {
      const buffer = entreeAudio(ctx, 0);
      if (sansEntree(buffer)) return buffer;
      const instrument = ctx.paramTexte("Instrument", "Violon");
      const customUrl = ctx.paramTexte("URL modèle", "");
      try {
        // Une « URL modèle » écrite remplace l'instrument : son paquet n'est alors pas demandé.
        await annoncerModele(ctx, "ddsp-tone-transfer", "", customUrl.trim() ? ["magenta-ddsp"] : []);
        const out = await appliquerDDSP(buffer, instrument, customUrl);
        // L'INSTRUMENT SE DIT PAR SON LIBELLÉ en anglais : son identifiant est le libellé français.
        const instrumentsEn: Record<string, string> = { "Violon": "Violin", "Flûte": "Flute", "Saxophone ténor": "Tenor saxophone", "Trompette": "Trumpet" };
        const instrumentDit = langueCourante() === "en" ? (instrumentsEn[instrument] ?? instrument) : instrument;
        return { valeurs: [out], message: traduire("msg.timbre_ddsp_var_0_var_1_s_var_2_hz", instrumentDit, out.duration.toFixed(1), OUTPUT_SR) };
      } catch (err: any) {
        return { valeurs: [null], erreur: true, message: traduire("msg.erreur_ddsp_var_0", err.message ?? err) };
      }
    },
  }),
] as FicheAudio[]).map(avecDoc);
