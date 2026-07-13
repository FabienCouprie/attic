// plugins/effets.ts — Nœuds d'effets audio

import type { PluginDef } from "../core";
import { avecDoc } from "./notices";
import {
  appliquerDelay, appliquerReverberation, appliquerDistorsion,
  appliquerFlanger, appliquerChorus, compresser, normaliser,
  appliquerFiltre, supprimerClics, reduireBruit, calculerProfilBruit,
  dererverberer, changerTempo, changerTonalite, equaliser,
  inverserAudio, echangerCanaux, extraireCentreCote,
  appliquerFondu, bouclerAudio,
  extraireZone, reinsererZone, fusionnerPistes, melangerPistes,
  bitcrusher,
  gateExpandeur,
  deEsser,
  ringModulator,
} from "../audio";

type ParamEffet = { nom: string; nomEn?: string; defaut: number; unite?: string; doc?: string; docEn?: string; plage?: [number, number]; pas?: number };
type FnEffet = (audio: AudioBuffer, ...args: number[]) => Promise<AudioBuffer> | AudioBuffer;

function effet(slug: string, nom: string, nomEn: string, resume: string, resumeEn: string, parametres: ParamEffet[], fn: FnEffet): PluginDef {
  return {
    id: slug, nom, nomEn, univers: "Traitement", famille: "Effets", resume, resumeEn,
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: parametres.map(p => ({
      nom: p.nom, nomEn: p.nomEn, defaut: p.defaut, doc: p.doc, docEn: p.docEn,
      unite: p.unite ?? (p.nom.includes("Mix") || p.nom === "Gain" || p.nom === "Réduction" ? "%" : undefined),
      ...(p.plage ? { plage: p.plage } : {}),
      ...(p.pas ? { pas: p.pas } : {}),
    })),
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée." };
      const args = parametres.map(p => ctx.paramNombre(p.nom, p.defaut));
      return { valeurs: [await fn(audio, ...args)] };
    },
  };
}

function param(nom: string, defaut: number, nomEn?: string, unite?: string, doc?: string, docEn?: string, plage?: [number, number], pas?: number): ParamEffet {
  return { nom, defaut, nomEn, unite, doc, docEn, plage, pas };
}

function simple(slug: string, nom: string, nomEn: string, resume: string, resumeEn: string, fn: (a: AudioBuffer) => AudioBuffer | Promise<AudioBuffer>): PluginDef {
  return {
    id: slug, nom, nomEn, univers: "Traitement", famille: "Effets", resume, resumeEn,
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée." };
      return { valeurs: [await fn(audio)] };
    },
  };
}

export const fiches: PluginDef[] = ([
  effet("delay-stereo", "Delay stéréo", "Stereo Delay", "Delay indépendant gauche/droite.", "Independent left/right delay.",
    [param("Temps G", 250, "Time L", "ms", "Délai canal gauche.", "Left channel delay."), param("Temps D", 375, "Time R", "ms", "Délai canal droit.", "Right channel delay."), param("Feedback", 40, "Feedback", "%", "Quantité de signal réinjecté.", "Amount of signal fed back."), param("Mix", 35, "Mix", "%", "Équilibre signal original / delay.", "Dry/wet balance.")],
    (a,tg,td,fb,mix) => appliquerDelay(a, tg, td, fb, mix)),
  effet("reverberation", "Réverbération", "Reverb", "Réverbération à convolution.", "Convolution reverb.",
    [param("Taille", 50, "Size", "%", "Taille de la pièce simulée.", "Simulated room size."), param("Decay", 2, "Decay", "s", "Temps de déclin de la réverbération.", "Reverb decay time."), param("Mix", 50, "Mix", "%", "Équilibre son direct / réverbération.", "Dry/wet balance.")],
    (a,taille,decay,mix) => appliquerReverberation(a, taille, decay, mix)),
  effet("distorsion", "Distorsion", "Distortion", "Saturation / overdrive.", "Saturation / overdrive.",
    [param("Gain", 50, "Gain", "%", "Quantité de saturation.", "Amount of saturation drive.")],
    (a,gain) => appliquerDistorsion(a, gain)),
  effet("bitcrusher", "Bitcrusher", "Bitcrusher", "Quantification + sous-échantillonnage (lo-fi).", "Bit quantization + downsampling (lo-fi).",
    [param("Bits", 8, "Bits", "", "Résolution en bits (1-16). 8 = son 8-bit rétro ; 4 = très crunch.", "Bit resolution (1-16). 8 = retro 8-bit sound; 4 = very crunchy.", [1, 16], 1),
     param("Fréquence", 22050, "Rate", "Hz", "Fréquence d'échantillonnage simulée. Plus basse = son plus cassé/aliased.", "Simulated sample rate. Lower = more broken/aliased sound.", [1000, 44100], 100),
     param("Mix", 100, "Mix", "%", "Équilibre signal original / effet. 100% = effet seul.", "Dry/wet balance. 100% = effect only.")],
    (a,bits,freq,mix) => bitcrusher(a, bits, freq, mix)),
  effet("flanger", "Flanger", "Flanger", "Modulation par délai variable.", "Variable delay modulation.",
    [param("Mix", 50, "Mix", "%", "Équilibre signal original / effet.", "Dry/wet balance."), param("Vitesse", 0.5, "Speed", "Hz", "Vitesse de modulation LFO.", "LFO modulation speed."), param("Profondeur", 3, "Depth", "ms", "Amplitude du balayage.", "Modulation depth in ms.")],
    (a,mix,v,p) => appliquerFlanger(a, v, p, mix/100)),
  effet("chorus", "Chorus", "Chorus", "Doublement stéréo modulé.", "Modulated stereo doubling.",
    [param("Mix", 40, "Mix", "%", "Équilibre signal original / effet.", "Dry/wet balance."), param("Vitesse", 0.8, "Speed", "Hz", "Vitesse de modulation LFO.", "LFO modulation speed."), param("Profondeur", 5, "Depth", "ms", "Amplitude du détimbrage.", "Detuning depth in ms.")],
    (a,mix,v,p) => appliquerChorus(a, v, p, mix/100)),
  effet("compresseur", "Compresseur", "Compressor", "Compresseur feed-forward.", "Feed-forward compressor.",
    [param("Seuil", -20, "Threshold", "dB", "Niveau au-dessus duquel la compression s'active.", "Level above which compression engages."), param("Ratio", 4, "Ratio", "∶1", "Taux de compression.", "Compression ratio."), param("Attaque", 5, "Attack", "ms", "Temps de réaction du compresseur.", "Compressor attack time."), param("Relâchement", 100, "Release", "ms", "Temps de retour au gain normal.", "Compressor release time."), param("Gain", 0, "Gain", "dB", "Gain de sortie (make-up gain).", "Output makeup gain.")],
    (a,seuil,ratio,att,rel,gain) => compresser(a, seuil, ratio, att, rel, gain)),
  {
    id: "gate-expandeur", nom: "Gate/Expandeur", nomEn: "Gate/Expander",
    univers: "Traitement", famille: "Effets",
    resume: "Gate ou expandeur dynamique (coupe ou atténue le signal sous un seuil).",
    resumeEn: "Dynamic gate or expander (cuts or attenuates signal below a threshold).",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Mode", nomEn: "Mode", type: "choix", options: ["Gate", "Expandeur"], optionsEn: ["Gate", "Expander"], defaut: "Gate",
        doc: "Gate = coupe le signal sous le seuil (atténuation fixe vers le plancher). Expandeur = atténue渐进ment le signal sous le seuil selon le ratio (compresseur inversé).",
        docEn: "Gate = cuts signal below threshold (fixed attenuation to floor). Expander = gradually attenuates signal below threshold by ratio (reverse compressor)." },
      { nom: "Seuil", nomEn: "Threshold", plage: [-80, 0], pas: 1, defaut: -40, unite: "dB",
        doc: "Niveau en dessous duquel le gate/expandeur s'active.", docEn: "Level below which the gate/expander engages." },
      { nom: "Ratio", nomEn: "Ratio", plage: [1, 20], pas: 0.5, defaut: 4, unite: "∶1",
        doc: "Expandeur uniquement : taux d'expansion sous le seuil. Ignoré en mode Gate.", docEn: "Expander only: expansion ratio below threshold. Ignored in Gate mode." },
      { nom: "Attaque", nomEn: "Attack", plage: [0.1, 100], pas: 0.1, defaut: 1, unite: "ms",
        doc: "Temps de réaction quand le signal passe sous le seuil.", docEn: "Reaction time when signal drops below threshold." },
      { nom: "Relâchement", nomEn: "Release", plage: [1, 1000], pas: 1, defaut: 100, unite: "ms",
        doc: "Temps de retour quand le signal repasse au-dessus du seuil.", docEn: "Recovery time when signal rises above threshold." },
      { nom: "Atténuation", nomEn: "Attenuation", plage: [0, 80], pas: 1, defaut: 40, unite: "dB",
        doc: "Atténuation maximale du plancher. Gate = niveau de coupure ; Expandeur = limite d'atténuation.", docEn: "Maximum floor attenuation. Gate = cut level; Expander = attenuation limit." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée." };
      const mode = ctx.paramTexte("Mode", "Gate") === "Expandeur" ? "expandeur" : "gate";
      const seuil = ctx.paramNombre("Seuil", -40);
      const ratio = ctx.paramNombre("Ratio", 4);
      const attaque = ctx.paramNombre("Attaque", 1);
      const relachement = ctx.paramNombre("Relâchement", 100);
      const attenuation = ctx.paramNombre("Atténuation", 40);
      const r = gateExpandeur(audio, mode, seuil, ratio, attaque, relachement, attenuation);
      return { valeurs: [r], message: `${mode === "gate" ? "Gate" : "Expandeur"} · seuil ${seuil} dB${mode === "expandeur" ? ` · ratio ${ratio}:1` : ""}` };
    },
  },
  effet("de-esser", "De-esser", "De-esser", "Compression dynamique des sibilances.", "Dynamic sibilance compression.",
    [param("Fréquence", 7000, "Frequency", "Hz", "Fréquence centrale de la bande cible (sibilances : 5-9 kHz).", "Center frequency of the target band (sibilances: 5-9 kHz).", [2000, 12000], 100),
     param("Largeur", 2000, "Width", "Hz", "Largeur de la bande cible (Q = fréquence/largeur).", "Width of the target band (Q = frequency/width).", [200, 6000], 100),
     param("Seuil", -20, "Threshold", "dB", "Niveau de la bande au-dessus duquel l'atténuation s'active.", "Band level above which attenuation engages.", [-60, 0], 1),
     param("Ratio", 3, "Ratio", "∶1", "Taux de réduction des sibilances.", "Sibilance reduction ratio.", [1, 10], 0.5),
     param("Attaque", 1, "Attack", "ms", "Temps de réaction (court = précis, long = doux).", "Reaction time (short = precise, long = smooth).", [0.1, 50], 0.1),
     param("Relâchement", 50, "Release", "ms", "Temps de retour au gain normal.", "Recovery time to normal gain.", [5, 500], 1)],
    (a,freq,largeur,seuil,ratio,att,rel) => deEsser(a, freq, largeur, seuil, ratio, att, rel)),
  effet("ring-modulator", "Ring modulator", "Ring Modulator", "Modulation en anneau (multiplication par porteuse).", "Ring modulation (carrier multiplication).",
    [param("Fréquence", 200, "Frequency", "Hz", "Fréquence de la porteuse. Produit des sommes et différences de fréquences (sidebands).", "Carrier frequency. Produces sum and difference frequencies (sidebands).", [1, 8000], 1),
     param("Mix", 100, "Mix", "%", "Équilibre signal original / effet.", "Dry/wet balance.")],
    (a,freq,mix) => ringModulator(a, freq, mix)),
  effet("normaliseur", "Normaliseur", "Normalizer", "Normalisation de niveau.", "Level normalization.",
    [param("Niveau", -3, "Level", "dB", "Niveau cible en dB (crête).", "Target peak level in dB.")],
    (a,niveau) => normaliser(a, niveau)),
  effet("suppression-clics", "Suppression de clics", "Click Removal", "Détection et suppression de clicks.", "Click detection and removal.",
    [param("Seuil", 5, "Threshold", "×", "Sensibilité de détection (multiple de la dérivée médiane). Plus élevé = moins sensible (détecte seulement les gros clics). Plus bas = plus sensible.", "Detection sensitivity (multiple of median derivative). Higher = less sensitive (only big clicks). Lower = more sensitive.", [1, 50], 1),
     param("Fenêtre", 5, "Window", "ms", "Largeur de la fenêtre de remplacement.", "Replacement window width.")],
    (a,s,f) => supprimerClics(a, s, f)),
  effet("dereverberation", "Déréverbération", "Dereverb", "Atténuation de la réverbération.", "Reverb attenuation.",
    [param("Réduction", 60, "Reduction", "%", "Force de l'atténuation de la réverb.", "Reverb reduction strength.")],
    (a,r) => dererverberer(a, r)),
  effet("changement-tempo", "Changement de tempo", "Tempo Change", "Time-stretch via vocodeur de phase.", "Time-stretch via phase vocoder.",
    [param("Tempo (%)", 100, "Tempo (%)", "%", "Tempo cible. 100=normal, 50=moitié, 200=double.", "Target tempo. 100=normal, 50=half, 200=double.", [25, 400], 5), param("Fenêtre", 50, "Window", "ms", "Taille de la fenêtre d'analyse.", "Analysis window size.")],
    (a,t) => changerTempo(a, t)),
  effet("changement-tonalite", "Changement de tonalité", "Pitch Shift", "Pitch-shift.", "Pitch shift.",
    [param("Demi-tons", 2, "Semitones", "", "Transposition en demi-tons.", "Transposition in semitones.", [-24, 24], 1)],
    (a,d) => changerTonalite(a, d)),
  effet("equaliseur", "Égaliseur", "Equalizer", "Égaliseur 3 bandes.", "3-band equalizer.",
    [param("Basses", 0, "Bass", "dB", "Gain des basses fréquences.", "Low frequency gain."), param("Médiums", 0, "Mid", "dB", "Gain des fréquences médiums.", "Mid frequency gain."), param("Aigus", 0, "Treble", "dB", "Gain des hautes fréquences.", "High frequency gain.")],
    (a,b,m,ag) => equaliser(a, b, m, ag)),
  simple("inverseur-audio", "Inverseur audio", "Audio Inverter", "Inverse le signal.", "Inverts the signal.", inverserAudio),
  simple("echange-canaux", "Échange canaux", "Swap Channels", "Permute gauche/droite.", "Swaps left/right channels.", echangerCanaux),
  effet("extraction-centre-cote", "Extraction centre/côté", "Center/Side Extract", "Sépare le centre stéréo des côtés.", "Separates stereo center from sides.",
    [param("Centre", 50, "Center", "%", "Niveau du canal central.", "Center channel level."), param("Côté", 50, "Side", "%", "Niveau des canaux latéraux.", "Side channel level.")],
    (a,centre,cote) => {
      const { centre: c, cote: s } = extraireCentreCote(a);
      const mixC = Math.max(0, centre) / 100;
      const mixS = Math.max(0, cote) / 100;
      const resultat = new AudioBuffer({ numberOfChannels: 2, length: a.length, sampleRate: a.sampleRate });
      for (let ch = 0; ch < 2; ch++) {
        const srcC = c.getChannelData(ch);
        const srcS = s.getChannelData(ch);
        const dst = resultat.getChannelData(ch);
        for (let i = 0; i < a.length; i++) dst[i] = srcC[i] * mixC + srcS[i] * mixS;
      }
      return resultat;
    }),
  effet("fondu", "Fondu", "Fade", "Fondu entrée/sortie.", "Fade in/out.",
    [param("Entrée", 0.5, "In", "s", "Durée du fondu d'entrée.", "Fade-in duration."), param("Sortie", 0.5, "Out", "s", "Durée du fondu de sortie.", "Fade-out duration.")],
    (a,e,s) => { const r = appliquerFondu(a, "Fermeture", s); return appliquerFondu(r, "Ouverture", e); }),
  effet("extraire-zone", "Extraire une zone", "Extract Zone", "Extrait une portion avec fondu.", "Extracts a portion with fade.",
    [param("Début", 0, "Start", "s", "Début de la zone à extraire.", "Start of the extracted zone."), param("Durée", 5, "Duration", "s", "Durée de la zone extraite.", "Duration of the extracted zone."), param("Fondu", 5, "Fade", "ms", "Durée du fondu aux bords.", "Crossfade duration at edges.")],
    (a,debut,duree) => extraireZone(a, debut, Math.min(duree, a.duration - debut))),
  {
    id: "reduction-bruit", nom: "Réduction de bruit", nomEn: "Noise Reduction", univers: "Traitement", famille: "Effets",
    resume: "Soustraction spectrale du bruit.",
    resumeEn: "Spectral noise subtraction.",
    entrees: [{ nom: "Audio", type: "audio" }, { nom: "Profil", type: "controle" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [{ nom: "Réduction", defaut: 70 }],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      const profil = ctx.entree(1);
      if (!(audio instanceof AudioBuffer) || !(profil instanceof Float32Array))
        return { valeurs: [null], message: "Branchez audio + profil (nœud Profil de bruit)." };
      const reduction = ctx.paramNombre("Réduction", 70) / 100;
      return { valeurs: [await reduireBruit(audio, profil, reduction)] };
    },
  },
  {
    id: "profil-bruit", nom: "Profil de bruit", nomEn: "Noise Profile", univers: "Traitement", famille: "Effets",
    resume: "Capture le profil spectral d'un bruit.",
    resumeEn: "Captures the spectral profile of a noise.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Profil", type: "controle" }],
    parametres: [],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée." };
      return { valeurs: [await calculerProfilBruit(audio)] };
    },
  },
  {
    id: "reponse-filtre", nom: "Filtre + réponse", nomEn: "Filter + Response",
    univers: "Traitement", famille: "Effets",
    resume: "Filtre le signal ET affiche la courbe de réponse en fréquence.",
    resumeEn: "Filters the signal AND displays the frequency response curve.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Type", nomEn: "Type", type: "choix",
        options: ["Passe-bas", "Passe-haut", "Passe-bande", "Coupe-bande"], defaut: "Passe-bas",
        doc: "Type de filtre. Passe-bas laisse passer les graves, passe-haut les aigus, passe-bande une bande, coupe-bande retire une bande.",
        docEn: "Filter type. Lowpass passes lows, highpass passes highs, bandpass keeps a band, notch removes a band." },
      { nom: "Fréquence de coupure", nomEn: "Cutoff", plage: [20, 20000], pas: 1, defaut: 1000, unite: "Hz",
        doc: "Fréquence charnière du filtre (coupure ou centre de bande).", docEn: "Filter hinge frequency (cutoff or band center)." },
      { nom: "Résonance", nomEn: "Resonance", plage: [0.5, 12], pas: 0.1, defaut: 0.7, unite: "Q",
        doc: "Facteur de qualité Q : plus il est élevé, plus la courbe présente une bosse marquée à la coupure.", docEn: "Quality factor Q: higher = a sharper peak at the cutoff." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée." };
      const type = ctx.paramTexte("Type", "Passe-bas");
      const freq = ctx.paramNombre("Fréquence de coupure", 1000);
      const q = ctx.paramNombre("Résonance", 0.7);
      const map: Record<string, BiquadFilterType> = { "Passe-bas": "lowpass", "Passe-haut": "highpass", "Passe-bande": "bandpass", "Coupe-bande": "notch" };
      return { valeurs: [await appliquerFiltre(a, map[type] ?? "lowpass", freq, q)] };
    },
  },
  {
    id: "reverbe-convolution", nom: "Réverbération à convolution (IR)", nomEn: "Convolution Reverb (IR)", univers: "Traitement", famille: "Effets",
    resume: "Réverbération à convolution avec IR synthétique (paramétrable) ou fichier IR externe.",
    resumeEn: "Convolution reverb with synthetic IR (adjustable) or external IR file.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Type", nomEn: "Type", type: "choix",
        options: ["Room", "Hall", "Plate", "Spring", "Cathédrale"], defaut: "Hall",
        doc: "Room = petite pièce (courte, dense). Hall = grand espace (longue queue). Plate = réverbération métallique (dense, linéaire). Spring = ressort (caractéristique, oscillant). Cathédrale = très long, spectral.",
        docEn: "Room = small room (short, dense). Hall = large space (long tail). Plate = metallic reverb (dense, linear). Spring = spring reverb (characteristic, oscillating). Cathedral = very long, spectral." },
      { nom: "Taille", nomEn: "Size", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Taille de l'espace simulé. Affecte la durée et la densité des réflexions.",
        docEn: "Size of the simulated space. Affects reflection duration and density." },
      { nom: "Decay", nomEn: "Decay", plage: [0.1, 10], pas: 0.1, defaut: 2, unite: "s",
        doc: "Temps de déclin de la queue de réverbération (RT60 approximatif).",
        docEn: "Reverb tail decay time (approximate RT60)." },
      { nom: "Pre-delay", nomEn: "Pre-delay", plage: [0, 200], pas: 1, defaut: 20, unite: "ms",
        doc: "Délai avant la première réflexion. Sépare le son direct de la réverbération (sens de l'espace).",
        docEn: "Delay before the first reflection. Separates dry signal from reverb (sense of space)." },
      { nom: "Damping", nomEn: "Damping", plage: [0, 100], pas: 1, defaut: 30, unite: "%",
        doc: "Absorption des hautes fréquences. Élevé = son plus sombre/étouffé. Faible = son brillant.",
        docEn: "High-frequency absorption. High = darker/muffled sound. Low = bright sound." },
      { nom: "Mix", nomEn: "Mix", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Équilibre son direct / réverbération.",
        docEn: "Dry/wet balance." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée audio." };
      const { reverberationConvolution, genererIR } = await import("../audio");
      const mix = ctx.paramNombre("Mix", 50);
      let irBuffer: AudioBuffer;
      const fichier = ctx.noeud.data.irFichier as File | undefined;
      if (fichier) {
        const { decoderFichier } = await import("../audio");
        ctx.onProgress("Décodage de l'IR…");
        irBuffer = await decoderFichier(fichier, ctx.runtime);
      } else {
        ctx.onProgress("Génération de l'IR…");
        const type = ctx.paramTexte("Type", "Hall");
        const taille = ctx.paramNombre("Taille", 50);
        const decay = ctx.paramNombre("Decay", 2);
        const preDelay = ctx.paramNombre("Pre-delay", 20);
        const damping = ctx.paramNombre("Damping", 30);
        irBuffer = genererIR(type, taille, decay, preDelay, damping, a.sampleRate);
      }
      ctx.onProgress("Convolution…");
      const r = await reverberationConvolution(a, irBuffer, mix);
      return { valeurs: [r], message: `Réverbération à convolution (IR : ${irBuffer.duration.toFixed(1)} s)` };
    },
  },
  {
    id: "transposeur-quantiseur-midi", nom: "Transposeur/Quantiseur MIDI", nomEn: "MIDI Transposer/Quantizer",
    univers: "Traitement", famille: "Effets",
    resume: "Transpose et/ou quantifie un fichier MIDI.",
    resumeEn: "Transposes and/or quantizes a MIDI file.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Transposition", nomEn: "Transpose", plage: [-24, 24], pas: 1, defaut: 0, unite: " ½-ton",
        doc: "Transposition en demi-tons (−24 à +24). 0 = aucune transposition.",
        docEn: "Transposition in semitones (−24 to +24). 0 = no transposition." },
      { nom: "Quantisation", nomEn: "Quantization", type: "choix",
        options: ["Aucune", "1/4", "1/8", "1/16", "1/32", "1/8 triplet", "1/16 triplet"],
        optionsEn: ["None", "1/4", "1/8", "1/16", "1/32", "1/8 triplet", "1/16 triplet"],
        defaut: "1/16",
        doc: "Grille de quantification des départs de notes. Aligner les notes sur la grille rythmique choisie.",
        docEn: "Quantization grid for note onsets. Snaps notes to the chosen rhythmic grid." },
      { nom: "Quantifier fins", nomEn: "Quantize ends", type: "choix",
        options: ["Non", "Oui"], optionsEn: ["No", "Yes"],
        defaut: "Non",
        doc: "Si « Oui », les fins de notes sont aussi alignées sur la grille (peut raccourcir/allonger les notes).",
        docEn: "If « Yes », note ends are also snapped to the grid (may shorten/lengthen notes)." },
    ],
    async executer(ctx: any) {
      const { transposerQuantifierMidi } = await import("../audio");
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null], message: "Aucun fichier MIDI en entrée." };
      const demiTons = Math.round(ctx.paramNombre("Transposition", 0));
      const grille = ctx.paramTexte("Quantisation", "1/16");
      const quantifierFin = ctx.paramTexte("Quantifier fins", "Non") === "Oui";
      const nouvFichier = await transposerQuantifierMidi(fichier, demiTons, grille, quantifierFin);
      const msgs: string[] = [];
      if (demiTons !== 0) msgs.push(`${demiTons > 0 ? "+" : ""}${demiTons} ½-ton${Math.abs(demiTons) > 1 ? "s" : ""}`);
      if (grille !== "Aucune") msgs.push(`quant. ${grille}${quantifierFin ? " +fins" : ""}`);
      return { valeurs: [nouvFichier], message: msgs.length > 0 ? msgs.join(" · ") : "Aucune modification" };
    },
  },
  {
    id: "arpegiateur-midi", nom: "Arpégiateur MIDI", nomEn: "MIDI Arpeggiator",
    univers: "Traitement", famille: "Effets",
    resume: "Arpège les accords d'un fichier MIDI selon un motif et une direction.",
    resumeEn: "Arpeggiates chords from a MIDI file according to a pattern and direction.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Direction", nomEn: "Direction", type: "choix",
        options: ["Montant", "Descendant", "UpDown", "DownUp", "Aléatoire"],
        optionsEn: ["Up", "Down", "UpDown", "DownUp", "Random"],
        defaut: "Montant",
        doc: "Ordre de lecture des notes de l'accord. Up = du grave à l'aigu ; Down = de l'aigu au grave ; UpDown = aller-retour ; Random = ordre aléatoire.",
        docEn: "Order in which chord notes are played. Up = low to high ; Down = high to low ; UpDown = back and forth ; Random = random order." },
      { nom: "Motif", nomEn: "Pattern", type: "choix",
        options: ["Droit", "1232", "12321", "1321", "1213"],
        optionsEn: ["Straight", "1232", "12321", "1321", "1213"],
        defaut: "Droit",
        doc: "Motif de répétition intra-accord (1=note basse, 2=médium, 3=haute). « Droit » = joue les notes dans l'ordre de la direction.",
        docEn: "Intra-chord repetition pattern (1=low note, 2=mid, 3=high). « Straight » = plays notes in the direction order." },
      { nom: "Vitesse", nomEn: "Speed", type: "choix",
        options: ["1/8", "1/16", "1/32", "1/8 triplet", "1/16 triplet"],
        optionsEn: ["1/8", "1/16", "1/32", "1/8 triplet", "1/16 triplet"],
        defaut: "1/16",
        doc: "Vitesse de l'arpège (division du temps).",
        docEn: "Arpeggio speed (time division)." },
      { nom: "Octaves", nomEn: "Octaves", plage: [1, 4], pas: 1, defaut: 1,
        doc: "Nombre d'octaves sur lesquelles l'arpège se déploie (chaque octave ajoute +12 demi-tons).",
        docEn: "Number of octaves the arpeggio spans (each octave adds +12 semitones)." },
      { nom: "Durée note", nomEn: "Note length", plage: [10, 100], pas: 5, defaut: 50, unite: "%",
        doc: "Durée de chaque note arpégée en pourcentage du pas de temps. 100% = legato, 50% = staccato.",
        docEn: "Length of each arpeggiated note as a percentage of the step time. 100% = legato, 50% = staccato." },
    ],
    async executer(ctx: any) {
      const { arpegerMidi } = await import("../audio");
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null], message: "Aucun fichier MIDI en entrée." };
      const direction = ctx.paramTexte("Direction", "Montant");
      const motif = ctx.paramTexte("Motif", "Droit");
      const vitesse = ctx.paramTexte("Vitesse", "1/16");
      const octaves = Math.round(ctx.paramNombre("Octaves", 1));
      const dureeNote = ctx.paramNombre("Durée note", 50);
      const nouvFichier = await arpegerMidi(fichier, motif, direction, vitesse, octaves, dureeNote);
      return { valeurs: [nouvFichier], message: `Arpège ${direction} · ${vitesse} · ${octaves} oct.` };
    },
  },
  {
    id: "aligneur-piste", nom: "Aligneur de piste", nomEn: "Track Aligner",
    univers: "Traitement", famille: "Montage",
    resume: "Ajuste une piste à la longueur d'une référence (silence ou fade).",
    resumeEn: "Aligns a track to a reference length (silence or fade).",
    entrees: [{ nom: "Référence", type: "audio" }, { nom: "Piste", type: "audio" }],
    sorties: [{ nom: "Référence", type: "audio" }, { nom: "Piste alignée", type: "audio" }],
    parametres: [
      { nom: "Position", nomEn: "Position", type: "choix",
        options: ["Avant", "Après"], optionsEn: ["Before", "After"],
        defaut: "Après",
        doc: "Où ajuster la différence. Si la piste est trop courte : ajoute du silence au début (« Avant ») ou à la fin (« Après »). Si trop longue : fade d'ouverture (« Avant », garde le début) ou fade de fermeture (« Après », garde la fin).",
        docEn: "Where to adjust the difference. If the track is too short: adds silence at the start (« Before ») or end (« After »). If too long: fade in (« Before », keeps the start) or fade out (« After », keeps the end)." },
    ],
    async executer(ctx: any) {
      const ref = ctx.entree(0);
      const piste = ctx.entree(1);
      if (!(ref instanceof AudioBuffer)) return { valeurs: [null, null], message: "Branchez une référence (entrée 1)." };
      if (!(piste instanceof AudioBuffer)) return { valeurs: [ref, null], message: "Branchez une piste à aligner (entrée 2)." };
      const { alignerPiste } = await import("../audio");
      const position = ctx.paramTexte("Position", "Après") === "Avant" ? "avant" : "apres";
      const [refOut, pisteOut] = alignerPiste(ref, piste, position);
      const diff = piste.length - ref.length;
      let msg: string;
      if (diff < 0) msg = `Piste ${(-diff / ref.sampleRate).toFixed(2)}s trop courte → silence ${position === "avant" ? "au début" : "à la fin"}`;
      else if (diff > 0) msg = `Piste ${(diff / ref.sampleRate).toFixed(2)}s trop longue → fade ${position === "avant" ? "d'ouverture" : "de fermeture"}`;
      else msg = "Pistes de même longueur — aucune modification";
      return { valeurs: [refOut, pisteOut], message: msg };
    },
  },
  {
    id: "shift-formants", nom: "Shift formants", nomEn: "Formant Shift",
    univers: "Traitement", famille: "Effets",
    resume: "Décalage formantique par LPC — change hauteur et timbre indépendamment (conversion vocale).",
    resumeEn: "Formant shifting via LPC — change pitch and timbre independently (voice conversion).",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Hauteur", nomEn: "Pitch", plage: [-12, 12], pas: 1, defaut: 0, unite: " ½-ton",
        doc: "Transposition de hauteur en demi-tons. +12 = 1 octave plus haut. S'applique à la source glottale sans changer les formants.",
        docEn: "Pitch transposition in semitones. +12 = 1 octave higher. Applied to the glottal source without changing formants." },
      { nom: "Formants", nomEn: "Formants", plage: [50, 200], pas: 1, defaut: 100, unite: "%",
        doc: "Décalage des formants (filtre vocal) en %. 100% = pas de changement. >100% = formants plus hauts (voix plus claire/aiguë). <100% = formants plus bas (voix plus sombre/grave). Pour conversion homme→femme : Hauteur +12, Formants 120%. Pour femme→homme : Hauteur −12, Formants 80%.",
        docEn: "Formant shift (vocal tract filter) in %. 100% = no change. >100% = higher formants (brighter/higher voice). <100% = lower formants (darker/lower voice). For male→female: Pitch +12, Formants 120%. For female→male: Pitch −12, Formants 80%." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée." };
      const { shiftFormants } = await import("../audio");
      const pitch = ctx.paramNombre("Hauteur", 0);
      const formantRatio = ctx.paramNombre("Formants", 100) / 100;
      ctx.onProgress("Analyse LPC…");
      const r = shiftFormants(a, pitch, formantRatio);
      const pitchInfo = pitch !== 0 ? `pitch ${pitch > 0 ? "+" : ""}${pitch}½-ton` : "pitch inchangé";
      const formantInfo = formantRatio !== 1 ? `formants ${Math.round(formantRatio * 100)}%` : "formants inchangés";
      return { valeurs: [r], message: `${pitchInfo} · ${formantInfo}` };
    },
  },
  {
    id: "ajouter-silence", nom: "Ajouter silence", nomEn: "Add Silence",
    univers: "Traitement", famille: "Montage",
    resume: "Ajoute du silence au début et/ou à la fin de la piste.",
    resumeEn: "Adds silence at the beginning and/or end of the track.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Avant", nomEn: "Before", plage: [0, 240], pas: 0.1, defaut: 1, unite: "s",
        doc: "Silence ajouté au début de la piste (en secondes).", docEn: "Silence added at the beginning of the track (in seconds)." },
      { nom: "Après", nomEn: "After", plage: [0, 240], pas: 0.1, defaut: 1, unite: "s",
        doc: "Silence ajouté à la fin de la piste (en secondes).", docEn: "Silence added at the end of the track (in seconds)." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée." };
      const avant = Math.max(0, ctx.paramNombre("Avant", 1));
      const apres = Math.max(0, ctx.paramNombre("Après", 1));
      if (avant === 0 && apres === 0) return { valeurs: [a], message: "Aucun silence à ajouter." };
      const sr = a.sampleRate;
      const debutEch = Math.round(avant * sr);
      const finEch = Math.round(apres * sr);
      const totalLen = a.length + debutEch + finEch;
      const resultat = new AudioBuffer({ numberOfChannels: a.numberOfChannels, length: totalLen, sampleRate: sr });
      for (let c = 0; c < a.numberOfChannels; c++) {
        const src = a.getChannelData(c);
        const dst = resultat.getChannelData(c);
        dst.set(src, debutEch);
      }
      return { valeurs: [resultat], message: `${avant}s avant + ${apres}s après · total ${resultat.duration.toFixed(1)}s` };
    },
  },
  {
    id: "tremolo", nom: "Tremolo", nomEn: "Tremolo", univers: "Traitement", famille: "Effets",
    resume: "Modulation d'amplitude (variations de volume périodiques).",
    resumeEn: "Amplitude modulation (periodic volume variations).",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Fréquence", nomEn: "Rate", type: "curseur", plage: [0.1, 20], pas: 0.1, defaut: 5, unite: "Hz",
        doc: "Fréquence de la modulation (vibrations par seconde).", docEn: "Modulation rate (vibrations per second)." },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Intensité de la modulation (0% = aucun effet, 100% = volume coupé complètement).", docEn: "Modulation depth (0% = no effect, 100% = volume fully cut)." },
      { nom: "Forme", nomEn: "Shape", type: "choix", options: ["Sinus", "Carré", "Triangle", "Sawtooth"],
        optionsEn: ["Sine", "Square", "Triangle", "Sawtooth"], defaut: "Sinus",
        doc: "Forme de l'onde de modulation.", docEn: "LFO waveform shape." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée." };
      const freq = ctx.paramNombre("Fréquence", 5);
      const depth = ctx.paramNombre("Profondeur", 50) / 100;
      const forme = ctx.paramTexte("Forme", "Sinus");
      const sr = a.sampleRate;
      const resultat = new AudioBuffer({ numberOfChannels: a.numberOfChannels, length: a.length, sampleRate: sr });
      for (let c = 0; c < a.numberOfChannels; c++) {
        const src = a.getChannelData(c);
        const dst = resultat.getChannelData(c);
        for (let i = 0; i < a.length; i++) {
          const t = i / sr;
          const phase = 2 * Math.PI * freq * t;
          let lfo: number;
          if (forme === "Carré" || forme === "Square") lfo = Math.sin(phase) >= 0 ? 1 : -1;
          else if (forme === "Triangle") lfo = 2 * Math.abs(2 * (freq * t - Math.floor(freq * t + 0.5))) - 1;
          else if (forme === "Sawtooth") lfo = 2 * (freq * t - Math.floor(freq * t)) - 1;
          else lfo = Math.sin(phase);
          const gain = 1 - depth * (1 - lfo) / 2;
          dst[i] = src[i] * gain;
        }
      }
      return { valeurs: [resultat] };
    },
  },
  {
    id: "etirement-glissant", nom: "Étirement glissant", nomEn: "Slide Stretch", univers: "Traitement", famille: "Effets",
    resume: "Étirement dont le facteur varie progressivement du début à la fin.",
    resumeEn: "Time-stretch with a factor that gradually changes from start to end.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Début", nomEn: "Start", type: "curseur", plage: [0.25, 4], pas: 0.05, defaut: 1, unite: "x",
        doc: "Facteur d'étirement au début (0.25 = accéléré 4x, 1 = normal, 4 = ralenti 4x).", docEn: "Stretch factor at the start (0.25 = 4x faster, 1 = normal, 4 = 4x slower)." },
      { nom: "Fin", nomEn: "End", type: "curseur", plage: [0.25, 4], pas: 0.05, defaut: 2, unite: "x",
        doc: "Facteur d'étirement à la fin.", docEn: "Stretch factor at the end." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée." };
      const { etirementGlissant } = await import("../audio");
      const debut = ctx.paramNombre("Début", 1);
      const fin = ctx.paramNombre("Fin", 2);
      return { valeurs: [etirementGlissant(a, debut, fin)], message: `${debut}x → ${fin}x · ${a.duration.toFixed(1)}s → ${(a.duration * (debut + fin) / 2).toFixed(1)}s` };
    },
  },
  {
    id: "spatialisation-stereo", nom: "Spatialisation stéréo", nomEn: "Stereo Spatialization", univers: "Traitement", famille: "Effets",
    resume: "Positionne le son dans l'espace stéréo (gauche/droite).",
    resumeEn: "Positions the sound in stereo space (left/right).",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Position", nomEn: "Position", type: "curseur", plage: [-100, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Position stéréo (-100% = gauche, 0% = centre, 100% = droite).", docEn: "Stereo position (-100% = left, 0% = center, 100% = right)." },
      { nom: "Largeur", nomEn: "Width", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Largeur de l'effet spatial (0% = mono, 100% = spatialisation pleine).", docEn: "Spatial width (0% = mono, 100% = full spatialization)." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée." };
      const { spatialiserStereo } = await import("../audio");
      const pos = ctx.paramNombre("Position", 0) / 100;
      const larg = ctx.paramNombre("Largeur", 100) / 100;
      return { valeurs: [await spatialiserStereo(a, pos, larg)] };
    },
  },
  {
    id: "auto-pan", nom: "Auto-pan", nomEn: "Auto-pan", univers: "Traitement", famille: "Effets",
    resume: "Balayage automatique gauche/droite (panoramique animé).",
    resumeEn: "Automatic left/right sweep (animated panning).",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Fréquence", nomEn: "Rate", type: "curseur", plage: [0.1, 20], pas: 0.1, defaut: 2, unite: "Hz",
        doc: "Vitesse du balayage (allers-retours par seconde).", docEn: "Sweep speed (round trips per second)." },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Amplitude du balayage (0% = fixe, 100% = gauche extrême à droite extrême).", docEn: "Sweep depth (0% = static, 100% = extreme left to extreme right)." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée." };
      const { autoPan } = await import("../audio");
      const freq = ctx.paramNombre("Fréquence", 2);
      const depth = ctx.paramNombre("Profondeur", 80);
      return { valeurs: [await autoPan(a, freq, depth)] };
    },
  },
  {
    id: "wahwah", nom: "Wah-wah", nomEn: "Wah-wah", univers: "Traitement", famille: "Effets",
    resume: "Filtre passe-bande modulé (effet pédale wah).",
    resumeEn: "Modulated bandpass filter (wah pedal effect).",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Fréquence", nomEn: "Rate", type: "curseur", plage: [0.1, 10], pas: 0.1, defaut: 2, unite: "Hz",
        doc: "Vitesse de la modulation (balayages par seconde).", docEn: "Modulation speed (sweeps per second)." },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Amplitude du balayage en fréquence (0% = fixe, 100% = wah complet).", docEn: "Frequency sweep range (0% = static, 100% = full wah)." },
      { nom: "Résonance", nomEn: "Resonance", type: "curseur", plage: [0.5, 20], pas: 0.5, defaut: 5, unite: "Q",
        doc: "Résonance du filtre (Q élevé = wah prononcé, Q faible = doux).", docEn: "Filter resonance (high Q = pronounced wah, low Q = gentle)." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Mix entre signal original et effet (100% = wah seulement).", docEn: "Mix between dry and wet signal (100% = wah only)." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée." };
      const { wahwah } = await import("../audio");
      return { valeurs: [wahwah(a, ctx.paramNombre("Fréquence", 2), ctx.paramNombre("Profondeur", 100), ctx.paramNombre("Résonance", 5), ctx.paramNombre("Mix", 100))] };
    },
  },
  {
    id: "phaser", nom: "Phaser", nomEn: "Phaser", univers: "Traitement", famille: "Effets",
    resume: "Filtres passe-tout en cascade modulés par LFO (effet planant).",
    resumeEn: "All-pass filter cascade modulated by LFO (sweeping effect).",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Fréquence", nomEn: "Rate", type: "curseur", plage: [0.05, 10], pas: 0.05, defaut: 0.5, unite: "Hz",
        doc: "Vitesse de la modulation (balayages par seconde).", docEn: "Modulation speed (sweeps per second)." },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Amplitude du balayage en fréquence.", docEn: "Frequency sweep range." },
      { nom: "Étages", nomEn: "Stages", type: "curseur", plage: [2, 8], pas: 1, defaut: 4,
        doc: "Nombre d'étages passe-tout (plus = effet plus prononcé).", docEn: "Number of all-pass stages (more = stronger effect)." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Mix entre signal original et effet.", docEn: "Mix between dry and wet signal." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée." };
      const { phaser } = await import("../audio");
      return { valeurs: [phaser(a, ctx.paramNombre("Fréquence", 0.5), ctx.paramNombre("Profondeur", 80), ctx.paramNombre("Étages", 4), ctx.paramNombre("Mix", 50))] };
    },
  },
  {
    id: "vibrato", nom: "Vibrato", nomEn: "Vibrato", univers: "Traitement", famille: "Effets",
    resume: "Modulation de hauteur par LFO (oscillation de la note).",
    resumeEn: "Pitch modulation by LFO (note oscillation).",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Fréquence", nomEn: "Rate", type: "curseur", plage: [0.1, 20], pas: 0.1, defaut: 5, unite: "Hz",
        doc: "Vitesse de la modulation (oscillations par seconde).", docEn: "Modulation speed (oscillations per second)." },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Amplitude de la modulation de hauteur (0% = aucun, 100% = ±2 demi-tons).", docEn: "Pitch modulation depth (0% = none, 100% = ±2 semitones)." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée." };
      const { vibrato } = await import("../audio");
      return { valeurs: [vibrato(a, ctx.paramNombre("Fréquence", 5), ctx.paramNombre("Profondeur", 50))] };
    },
  },
  {
    id: "octaver", nom: "Octaver", nomEn: "Octaver", univers: "Traitement", famille: "Effets",
    resume: "Ajoute une octave supérieure et/ou inférieure.",
    resumeEn: "Adds an upper and/or lower octave.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Octave sup", nomEn: "Octave up", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Niveau de l'octave supérieure (doublement de fréquence).", docEn: "Upper octave level (frequency doubling)." },
      { nom: "Octave inf", nomEn: "Octave down", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Niveau de l'octave inférieure (demi-fréquence).", docEn: "Lower octave level (half frequency)." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Niveau du signal original (100% = signal original à fond).", docEn: "Dry signal level (100% = full dry signal)." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée." };
      const { octaver } = await import("../audio");
      return { valeurs: [octaver(a, ctx.paramNombre("Octave sup", 50), ctx.paramNombre("Octave inf", 50), ctx.paramNombre("Mix", 50))] };
    },
  },
  {
    id: "chopper", nom: "Chopper", nomEn: "Chopper", univers: "Traitement", famille: "Effets",
    resume: "Gate rythmique qui coupe le son périodiquement (effet stutter/DJ).",
    resumeEn: "Rhythmic gate that chops the sound periodically (stutter/DJ effect).",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Fréquence", nomEn: "Rate", type: "curseur", plage: [0.5, 20], pas: 0.5, defaut: 4, unite: "Hz",
        doc: "Vitesse de coupe (coups par seconde).", docEn: "Chop speed (cuts per second)." },
      { nom: "Durée", nomEn: "Length", type: "curseur", plage: [1, 99], pas: 1, defaut: 50, unite: "%",
        doc: "Ratio ON dans le cycle (1% = staccissimo, 50% = carré, 99% = quasi continu).", docEn: "ON ratio in cycle (1% = very short, 50% = square, 99% = near continuous)." },
      { nom: "Type", nomEn: "Type", type: "choix", options: ["Dur", "Fondu"], optionsEn: ["Hard", "Soft"], defaut: "Dur",
        doc: "Dur = coupure nette, Fondu = transition douce.", docEn: "Hard = abrupt cut, Soft = smooth transition." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée." };
      const { chopper } = await import("../audio");
      const typeStr = ctx.paramTexte("Type", "Dur");
      return { valeurs: [chopper(a, ctx.paramNombre("Fréquence", 4), ctx.paramNombre("Durée", 50), typeStr === "Fondu" || typeStr === "Soft" ? 1 : 0)] };
    },
  },
] as PluginDef[]).map(avecDoc);
