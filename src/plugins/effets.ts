// plugins/effets.ts — Nœuds d'effets audio

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { creerAleatoire, hasardDuNoeud } from "../core";
import { parseMidi } from "midi-file";
import {
   appliquerDelay, appliquerReverberation, appliquerDistorsion,
   appliquerFlanger, appliquerChorus, compresser, normaliser,
   appliquerFiltre, supprimerClics, reduireBruit, reduireBruitNotches, calculerProfilBruit,
  dererverberer, changerTempo, changerTonalite, glissandoTonalite, equaliser,
  inverserAudio, echangerCanaux, extraireCentreCote,
  appliquerFondu,
  extraireZone,
  bitcrusher,
  gateExpandeur,
  deEsser,
  ringModulator,
  appliquerPaulstretch,
  paulstretchLogistique,
  appliquerFormuleEchantillons,
  appliquerFormuleSpectrale,
  reverberationFractale,
   appliquerEchoPingPong,
   appliquerEchoInverse,
   appliquerVoiceChanger,
   appliquerDecoupeAleatoire,
   limiter,
   transientShaper,
   ajusterLargeurStereo,
   compresserMultiBande,
   exciter,
   harmoniser,
   vocoder,
   granularFreeze,
    appliquerInstrumentMidi,
     griffinLim, picAbsolu,
    joindreMidi,
   bouclerMidi,
   analyserMidi,
} from "../audio";
import { PARAMETRE_INSTRUMENT_SF2 } from "./soundfontGlobal";

type ParamEffet = { nom: string; nomEn?: string; defaut: number; unite?: string; doc?: string; docEn?: string; plage?: [number, number]; pas?: number };
type FnEffet = (audio: AudioBuffer, ...args: number[]) => Promise<AudioBuffer> | AudioBuffer;

function effet(slug: string, nom: string, nomEn: string, resume: string, resumeEn: string, parametres: ParamEffet[], fn: FnEffet): FicheAudio {
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
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const args = parametres.map(p => ctx.paramNombre(p.nom, p.defaut));
      return { valeurs: [await fn(audio, ...args)] };
   },
  };
}

function param(nom: string, defaut: number, nomEn?: string, unite?: string, doc?: string, docEn?: string, plage?: [number, number], pas?: number): ParamEffet {
  return { nom, defaut, nomEn, unite, doc, docEn, plage, pas };
}

function simple(slug: string, nom: string, nomEn: string, resume: string, resumeEn: string, fn: (a: AudioBuffer) => AudioBuffer | Promise<AudioBuffer>): FicheAudio {
  return {
    id: slug, nom, nomEn, univers: "Traitement", famille: "Effets", resume, resumeEn,
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      return { valeurs: [await fn(audio)] };
   },
  };
}

export const fiches: FicheAudio[] = ([
  effet("delay-stereo", "Delay stéréo", "Stereo Delay", "Delay indépendant gauche/droite.", "Independent left/right delay.",
    [param("Temps G", 250, "Time L", "ms", "Délai canal gauche.", "Left channel delay."), param("Temps D", 375, "Time R", "ms", "Délai canal droit.", "Right channel delay."), param("Feedback", 40, "Feedback", "%", "Quantité de signal réinjecté.", "Amount of signal fed back."), param("Mix", 35, "Mix", "%", "Équilibre signal original / delay.", "Dry/wet balance.")],
    (a,tg,td,fb,mix) => appliquerDelay(a, tg, td, fb, mix)),
  effet("reverberation", "Réverbération", "Reverb", "Réverbération à convolution.", "Convolution reverb.",
    [param("Taille", 50, "Size", "%", "Taille de la pièce simulée.", "Simulated room size."), param("Decay", 2, "Decay", "s", "Temps de déclin de la réverbération.", "Reverb decay time."), param("Mix", 50, "Mix", "%", "Équilibre son direct / réverbération.", "Dry/wet balance."), param("Graine", 42, "Seed", "", "Graine du bruit de la réponse impulsionnelle. Valeur par défaut FIXE : une réverbération qui change de pièce à chaque exécution serait un défaut. La changer donne une autre pièce, de mêmes dimensions.", "Seed for the impulse-response noise. The default is FIXED: a reverb that moves to a different room on every run would be a defect. Changing it gives another room of the same dimensions.", [1, 999999], 1)],
    (a,taille,decay,mix,graine) => appliquerReverberation(a, taille, decay, mix, creerAleatoire(graine))),
  effet("reverb-fractale", "Réverbération fractale", "Fractal Reverb", "Réverbération à convolution dont la réponse impulsionnelle est générée par un motif fractal.", "Convolution reverb whose impulse response is generated by a fractal pattern.",
    [param("Decay", 3, "Decay", "s", "Durée totale de la réponse impulsionnelle.", "Total duration of the impulse response."), param("Pré-delay", 20, "Pre-delay", "ms", "Délai avant l'arrivée des premières réflexions.", "Delay before the first reflections arrive."), param("Densité", 5, "Density", "", "Profondeur de récursion fractale (1-8). Plus élevé = plus de réflexions.", "Fractal recursion depth (1-8). Higher = more reflections.", [1, 8], 1), param("Atténuation", 70, "Decay gain", "%", "Atténuation de l'amplitude à chaque niveau de récursion.", "Amplitude attenuation at each recursion level.", [10, 95], 5), param("Diffusion", 60, "Diffusion", "%", "Étalement stéréo des réflexions.", "Stereo spread of reflections."), param("Damping", 30, "Damping", "%", "Absorption des hautes fréquences.", "High-frequency absorption."), param("Mix", 40, "Mix", "%", "Équilibre son direct / réverbération.", "Dry/wet balance.")],
    (a, decay, preDelay, densite, attenuation, diffusion, damping, mix) => reverberationFractale(a, { decay, preDelay, densite, gainDecay: attenuation / 100, diffusion, damping, graine: 42 }, mix)),
  effet("distorsion", "Distorsion", "Distortion", "Saturation / overdrive.", "Saturation / overdrive.",
    [param("Gain", 50, "Gain", "%", "Quantité de saturation.", "Amount of saturation drive.")],
    (a,gain) => appliquerDistorsion(a, gain)),
  effet("bitcrusher", "Bitcrusher", "Bitcrusher", "Quantification + sous-échantillonnage (lo-fi).", "Bit quantization + downsampling (lo-fi).",
    [param("Bits", 8, "Bits", "", "Résolution en bits (1-16). 8 = son 8-bit rétro ; 4 = très crunch.", "Bit resolution (1-16). 8 = retro 8-bit sound; 4 = very crunchy.", [1, 16], 1),
     param("Fréquence", 22050, "Rate", "Hz", "Fréquence d'échantillonnage simulée. Plus basse = son plus cassé/aliased.", "Simulated sample rate. Lower = more broken/aliased sound.", [1000, 44100], 100),
     param("Mix", 100, "Mix", "%", "Équilibre signal original / effet. 100% = effet seul.", "Dry/wet balance. 100% = effect only.")],
    (a,bits,freq,mix) => bitcrusher(a, bits, freq, mix)),
  effet("exciter", "Exciter / Aural enhancer", "Exciter / Aural Enhancer", "Ajoute de la présence par distorsion harmonique dans les hauts médiums.", "Adds presence via harmonic distortion in the high mids.",
    [param("Amount", 50, "Amount", "%", "Intensité de la distorsion asymétrique.", "Intensity of the asymmetrical distortion.", [0, 100], 1), param("Fréquence", 3000, "Frequency", "Hz", "Fréquence de coupure du passe-haut après distorsion.", "High-pass cutoff after distortion.", [500, 10000], 100), param("Mix", 30, "Mix", "%", "Équilibre signal original / effet.", "Dry/wet balance.", [0, 100], 1)],
    (a, amount, freq, mix) => exciter(a, amount, freq, mix)),
  effet("flanger", "Flanger", "Flanger", "Modulation par délai variable.", "Variable delay modulation.",
    [param("Mix", 50, "Mix", "%", "Équilibre signal original / effet.", "Dry/wet balance."), param("Vitesse", 0.5, "Speed", "Hz", "Vitesse de modulation LFO.", "LFO modulation speed."), param("Profondeur", 3, "Depth", "ms", "Amplitude du balayage.", "Modulation depth in ms.")],
    (a,mix,v,p) => appliquerFlanger(a, v, p, mix/100)),
  effet("chorus", "Chorus", "Chorus", "Doublement stéréo modulé.", "Modulated stereo doubling.",
    [param("Mix", 40, "Mix", "%", "Équilibre signal original / effet.", "Dry/wet balance."), param("Vitesse", 0.8, "Speed", "Hz", "Vitesse de modulation LFO.", "LFO modulation speed."), param("Profondeur", 5, "Depth", "ms", "Amplitude du détimbrage.", "Detuning depth in ms.")],
    (a,mix,v,p) => appliquerChorus(a, v, p, mix/100)),
  effet("compresseur", "Compresseur", "Compressor", "Compresseur feed-forward.", "Feed-forward compressor.",
    [param("Seuil", -20, "Threshold", "dB", "Niveau au-dessus duquel la compression s'active.", "Level above which compression engages.", [-60, 0], 1), param("Ratio", 4, "Ratio", "∶1", "Taux de compression.", "Compression ratio.", [1, 20], 0.5), param("Attaque", 5, "Attack", "ms", "Temps de réaction du compresseur.", "Compressor attack time.", [0, 200], 1), param("Relâchement", 100, "Release", "ms", "Temps de retour au gain normal.", "Compressor release time.", [5, 1000], 5), param("Gain", 0, "Gain", "dB", "Gain de sortie (make-up gain).", "Output makeup gain.", [-12, 24], 1)],
    (a,seuil,ratio,att,rel,gain) => compresser(a, seuil, ratio, att, rel, gain)),
  effet("limiteur", "Limiteur", "Limiter", "Limiteur de crête pour le mastering.", "Peak limiter for mastering.",
    [param("Seuil", -3, "Threshold", "dB", "Niveau au-dessus duquel la limitation s'active.", "Level above which limiting engages.", [-40, 0], 1), param("Relâchement", 50, "Release", "ms", "Temps de retour au gain normal après un pic.", "Time to return to normal gain after a peak.", [1, 1000], 1), param("Plafond", -1, "Ceiling", "dB", "Niveau maximal de sortie.", "Maximum output level.", [-40, 0], 0.5)],
    (a, seuil, relachement, plafond) => limiter(a, seuil, relachement, plafond)),
  effet("compresseur-multibande", "Compresseur multibande", "Multiband Compressor", "Compresseur 3 bandes indépendantes (low/mid/high).", "3-band compressor with independent thresholds/ratios.",
    [
      param("Seuil Low", -20, "Low threshold", "dB", "Seuil du compresseur sur la bande grave.", "Compressor threshold for the low band.", [-60, 0], 1),
      param("Ratio Low", 4, "Low ratio", "∶1", "Ratio du compresseur sur la bande grave.", "Compressor ratio for the low band.", [1, 20], 0.5),
      param("Seuil Mid", -20, "Mid threshold", "dB", "Seuil du compresseur sur la bande médium.", "Compressor threshold for the mid band.", [-60, 0], 1),
      param("Ratio Mid", 4, "Mid ratio", "∶1", "Ratio du compresseur sur la bande médium.", "Compressor ratio for the mid band.", [1, 20], 0.5),
      param("Seuil High", -20, "High threshold", "dB", "Seuil du compresseur sur la bande aiguë.", "Compressor threshold for the high band.", [-60, 0], 1),
      param("Ratio High", 4, "High ratio", "∶1", "Ratio du compresseur sur la bande aiguë.", "Compressor ratio for the high band.", [1, 20], 0.5),
      param("Attaque", 5, "Attack", "ms", "Temps de réaction commun aux trois bandes.", "Common attack time for all bands.", [0, 200], 1),
      param("Relâchement", 100, "Release", "ms", "Temps de retour commun aux trois bandes.", "Common release time for all bands.", [5, 1000], 5),
      param("Fréq Low", 250, "Low freq", "Hz", "Fréquence de coupure entre les bandes low et mid.", "Crossover between low and mid bands.", [40, 1000], 10),
      param("Fréq High", 4000, "High freq", "Hz", "Fréquence de coupure entre les bandes mid et high.", "Crossover between mid and high bands.", [1000, 12000], 100),
    ],
    (a, seuilLow, ratioLow, seuilMid, ratioMid, seuilHigh, ratioHigh, attaque, relachement, freqLow, freqHigh) => compresserMultiBande(a, seuilLow, ratioLow, seuilMid, ratioMid, seuilHigh, ratioHigh, attaque, relachement, freqLow, freqHigh)),
  {
    id: "gate-expandeur", nom: "Gate/Expandeur", nomEn: "Gate/Expander",
    univers: "Traitement", famille: "Effets",
    resume: "Gate ou expandeur dynamique (coupe ou atténue le signal sous un seuil).",
    resumeEn: "Dynamic gate or expander (cuts or attenuates signal below a threshold).",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Mode", nomEn: "Mode", type: "choix", options: ["Gate", "Expandeur"], optionsEn: ["Gate", "Expander"], optionIds: ["gate", "expander"], defaut: "Gate",
        doc: "Gate = coupe le signal sous le seuil (atténuation fixe vers le plancher). Expandeur = atténue progressivement le signal sous le seuil selon le ratio (compresseur inversé).",
        docEn: "Gate = cuts signal below threshold (fixed attenuation to floor). Expander = gradually attenuates signal below threshold by ratio (reverse compressor).", defautEn: "Gate" },
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
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const mode = ctx.paramTexte("Mode", "gate");
      const seuil = ctx.paramNombre("Seuil", -40);
      const ratio = ctx.paramNombre("Ratio", 4);
      const attaque = ctx.paramNombre("Attaque", 1);
      const relachement = ctx.paramNombre("Relâchement", 100);
      const attenuation = ctx.paramNombre("Atténuation", 40);
      const r = gateExpandeur(audio, mode, seuil, ratio, attaque, relachement, attenuation);
      return { valeurs: [r], message: traduire("msg.var_0_seuil_var_1_db_var_2", mode === "gate" ? "Gate" : "Expandeur", seuil, mode === "expandeur" ? ` · ratio ${ratio}:1` : "") };
   },
  },
  effet("transient-shaper", "Transient Shaper", "Transient Shaper", "Contrôle indépendant de l'attaque et du sustain.", "Independent attack and sustain control.",
    [param("Attaque", 0, "Attack", "dB", "Gain appliqué à l'attaque des transitoires. Positif = plus de punch ; négatif = moins agressif.", "Gain applied to transient attacks. Positive = more punch; negative = less aggressive.", [-12, 12], 0.5), param("Sustain", 0, "Sustain", "dB", "Gain appliqué au corps/sustain. Positif = plus de tenue ; négatif = plus court.", "Gain applied to the sustain body. Positive = more sustain; negative = shorter.", [-12, 12], 0.5), param("Temps attaque", 1, "Attack time", "ms", "Temps de réaction du détecteur de transitoires.", "Transient detector reaction time.", [0.1, 50], 0.1), param("Temps sustain", 100, "Sustain time", "ms", "Temps de réaction du détecteur de sustain.", "Sustain detector reaction time.", [10, 500], 1)],
    (a, attaque, sustain, tAttaque, tSustain) => transientShaper(a, attaque, sustain, tAttaque, tSustain)),
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
  {
    id: "vocoder", nom: "Vocoder", nomEn: "Vocoder",
    univers: "Traitement", famille: "Effets",
    resume: "Vocoder filterbank : modulateur + porteuse → effet robot.",
    resumeEn: "Filterbank vocoder: modulator + carrier → robot voice effect.",
    entrees: [{ nom: "Modulateur", nomEn: "Modulator", type: "audio" }, { nom: "Porteuse", nomEn: "Carrier", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Bandes", nomEn: "Bands", type: "nombre", plage: [4, 16], pas: 1, defaut: 8, unite: "",
        doc: "Nombre de bandes passe-bande du vocoder. Plus de bandes = plus de précision spectrale.", docEn: "Number of vocoder filter bands. More bands = more spectral precision." },
      { nom: "Fréq min", nomEn: "Min freq", type: "nombre", plage: [80, 1000], pas: 10, defaut: 100, unite: "Hz",
        doc: "Fréquence la plus basse des bandes.", docEn: "Lowest band frequency." },
      { nom: "Fréq max", nomEn: "Max freq", type: "nombre", plage: [2000, 16000], pas: 100, defaut: 8000, unite: "Hz",
        doc: "Fréquence la plus haute des bandes.", docEn: "Highest band frequency." },
      { nom: "Q", nomEn: "Q", type: "nombre", plage: [0.5, 12], pas: 0.1, defaut: 2, unite: "",
        doc: "Facteur de qualité des filtres passe-bande. Plus élevé = bandes plus étroites.", docEn: "Bandpass filter quality factor. Higher = narrower bands." },
      { nom: "Mix", nomEn: "Mix", type: "nombre", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Équilibre modulateur original / vocoder.", docEn: "Dry/wet balance." },
    ],
    async executer(ctx: any) {
      const modulateur = ctx.entree(0);
      const porteuse = ctx.entree(1);
      if (!(modulateur instanceof AudioBuffer) || !(porteuse instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      const bands = ctx.paramNombre("Bandes", 8);
      const fMin = ctx.paramNombre("Fréq min", 100);
      const fMax = ctx.paramNombre("Fréq max", 8000);
      const Q = ctx.paramNombre("Q", 2);
      const mix = ctx.paramNombre("Mix", 50);
      const out = await vocoder(modulateur, porteuse, bands, fMin, fMax, Q, mix);
      return { valeurs: [out] };
    },
  },
  effet("normaliseur", "Normaliseur", "Normalizer", "Normalisation de niveau.", "Level normalization.",
    [param("Niveau", -3, "Level", "dB", "Niveau cible en dB (crête).", "Target peak level in dB.", [-40, 0], 0.5)],
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
  effet("glissando-tonalite", "Glissando de tonalité", "Pitch Glissando", "Pitch-shift glissant d'une tonalité à une autre.", "Pitch glissando from one pitch to another.",
    [param("Début", 0, "Start", "st", "Hauteur de départ en demi-tons.", "Start pitch in semitones.", [-24, 24], 0.5),
     param("Fin", 12, "End", "st", "Hauteur d'arrivée en demi-tons.", "End pitch in semitones.", [-24, 24], 0.5)],
    (a,debut,fin) => glissandoTonalite(a, debut, fin)),
  effet("harmonizer", "Harmonizer / Octaver", "Harmonizer / Octaver", "Ajoute des voix pitch-shiftées (octave, quinte…) sous l'original.", "Adds pitch-shifted voices (octave, fifth…) under the original.",
    [param("Voix 1", 12, "Voice 1", "st", "Intervalle de la première voix en demi-tons. 12 = octave supérieure, -12 = octave inférieure, 7 = quinte.", "Interval of first voice in semitones. 12 = octave up, -12 = octave down, 7 = fifth.", [-24, 24], 1), param("Mix 1", 30, "Mix 1", "%", "Niveau de la première voix.", "Level of first voice.", [0, 100], 1), param("Voix 2", -12, "Voice 2", "st", "Intervalle de la deuxième voix en demi-tons.", "Interval of second voice in semitones.", [-24, 24], 1), param("Mix 2", 30, "Mix 2", "%", "Niveau de la deuxième voix.", "Level of second voice.", [0, 100], 1)],
    (a, v1, m1, v2, m2) => harmoniser(a, v1, m1, v2, m2)),
  {
    id: "paulstretch", nom: "Paulstretch", nomEn: "Paulstretch", univers: "Traitement", famille: "Effets",
    resume: "Étirement extrême par randomisation des phases (stéréo).",
    resumeEn: "Extreme phase-randomization time-stretch (stereo).",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Stretch", nomEn: "Stretch", defaut: 8, unite: "×", doc: "Facteur d'étirement. 1 = pas d'effet, 8 = 8 fois plus long.", docEn: "Stretch factor. 1 = no effect, 8 = 8× longer.", plage: [1, 100], pas: 1 },
      { nom: "Fenêtre", nomEn: "Window", defaut: 0.25, unite: "s", doc: "Taille de la fenêtre STFT en secondes. Grande = texture lisse, petite = plus de transitoires.", docEn: "STFT window size in seconds. Large = smooth texture, small = more transients.", plage: [0.01, 1], pas: 0.01 },
      { nom: "Graine", nomEn: "Seed", plage: [1, 999999], pas: 1, defaut: 42,
        doc: "Graine de la randomisation des phases. Valeur par défaut FIXE : un étirement qui change à chaque exécution serait un défaut. La changer donne une autre texture, de même caractère.",
        docEn: "Seed for the phase randomization. The default is FIXED: a stretch that changes on every run would be a defect. Changing it gives another texture of the same character." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      const stretch = ctx.paramNombre("Stretch", 8);
      const fenetre = ctx.paramNombre("Fenêtre", 0.25);
      const out = await appliquerPaulstretch(audio, stretch, fenetre,
        { onProgress: ctx.onProgress, signal: ctx.signal, hasard: creerAleatoire(ctx.paramNombre("Graine", 42)) });
      return { valeurs: [out] };
    },
  },
  {
    id: "paulstretch-logistique", nom: "Paulstretch logistique", nomEn: "Logistic Paulstretch", univers: "Traitement", famille: "Effets",
    resume: "Étirement extrême qui s'installe progressivement.",
    resumeEn: "Extreme time-stretch that grows in progressively.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Stretch", nomEn: "Stretch", defaut: 8, unite: "×", doc: "Facteur d'étirement maximal atteint en fin de transition.", docEn: "Maximum stretch factor reached at the end of the transition.", plage: [1, 100], pas: 1 },
      { nom: "Fenêtre", nomEn: "Window", defaut: 0.25, unite: "s", doc: "Taille de la fenêtre STFT en secondes.", docEn: "STFT window size in seconds.", plage: [0.01, 1], pas: 0.01 },
      { nom: "Centre", nomEn: "Center", defaut: 50, unite: "%", doc: "Point milieu de la transition logistique.", docEn: "Midpoint of the logistic transition.", plage: [0, 100], pas: 1 },
      { nom: "Pente", nomEn: "Steepness", defaut: 10, unite: "", doc: "Raideur de la courbe logistique.", docEn: "Steepness of the logistic curve.", plage: [0.1, 50], pas: 0.1 },
      { nom: "Mix", nomEn: "Mix", defaut: 100, unite: "%", doc: "Équilibre signal original / effet.", docEn: "Dry/wet balance.", plage: [0, 100], pas: 1 },
      { nom: "Graine", nomEn: "Seed", plage: [1, 999999], pas: 1, defaut: 42,
        doc: "Graine de la randomisation des phases. Valeur par défaut FIXE : un étirement qui change à chaque exécution serait un défaut. La changer donne une autre texture, de même caractère.",
        docEn: "Seed for the phase randomization. The default is FIXED: a stretch that changes on every run would be a defect. Changing it gives another texture of the same character." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      const stretch = ctx.paramNombre("Stretch", 8);
      const fenetre = ctx.paramNombre("Fenêtre", 0.25);
      const centre = ctx.paramNombre("Centre", 50);
      const pente = ctx.paramNombre("Pente", 10);
      const mix = ctx.paramNombre("Mix", 100);
      const out = await paulstretchLogistique(audio, stretch, fenetre, centre, pente, mix,
        { onProgress: ctx.onProgress, signal: ctx.signal, hasard: creerAleatoire(ctx.paramNombre("Graine", 42)) });
      return { valeurs: [out], message: traduire("msg.paulstretch_logistique", out.duration.toFixed(1)) };
    },
  },
  effet("granular-freeze", "Granular freeze", "Granular Freeze", "Boucle un grain avec contrôle de taille et de hauteur.", "Loops a grain with size and pitch control.",
    [param("Taille", 50, "Grain size", "ms", "Taille du grain bouclé.", "Size of the looped grain.", [5, 500], 1), param("Pitch", 0, "Pitch", "st", "Transposition du grain en demi-tons.", "Grain pitch shift in semitones.", [-24, 24], 1), param("Position", 0, "Position", "%", "Position dans le fichier où le grain est extrait.", "Position in the file where the grain is extracted.", [0, 100], 1), param("Mix", 50, "Mix", "%", "Équilibre signal original / effet.", "Dry/wet balance.", [0, 100], 1)],
    (a, taille, pitch, position, mix) => granularFreeze(a, taille, pitch, position / 100, mix)),
  {
    id: "formule-echantillons", nom: "Formule sur échantillons", nomEn: "Sample Formula",
    univers: "Traitement", famille: "Effets",
    resume: "Applique une expression mathématique à chaque échantillon du signal.",
    resumeEn: "Applies a mathematical expression to each sample of the signal.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Formule", nomEn: "Formula", type: "texte", defaut: "sin(t * 2 * pi * 440) + x",
        doc: "Expression mathématique donnant la valeur de sortie de chaque échantillon. Variables : x (valeur actuelle), t (temps en secondes), i (index de l'échantillon), c (canal), ch (nombre de canaux), sr (fréquence d'échantillonnage).",
        docEn: "Mathematical expression giving the output value of each sample. Variables: x (current value), t (time in seconds), i (sample index), c (channel), ch (channel count), sr (sample rate).", defautEn: "sin(t * 2 * pi * 440) + x" },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 30, unite: "%", doc: "Gain de sortie.", docEn: "Output gain." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      const formule = ctx.paramTexte("Formule", "sin(t * 2 * pi * 440) + x");
      const volume = ctx.paramNombre("Volume", 30);
      try {
        const out = appliquerFormuleEchantillons(audio, formule);
        const vol = Math.max(0, Math.min(1, volume / 100));
        if (vol !== 1) {
          for (let c = 0; c < out.numberOfChannels; c++) {
            const d = out.getChannelData(c);
            for (let i = 0; i < d.length; i++) d[i] *= vol;
          }
        }
        return { valeurs: [out], message: traduire("msg.formule_appliqu_e_var_0", formule) };
      } catch (e: any) {
        return { valeurs: [null], message: traduire("msg.erreur_formule_var_0", e?.message ?? e) };
      }
   },
 },
  {
    id: "formule-spectrale", nom: "Formule spectrale", nomEn: "Spectral Formula",
    univers: "Traitement", famille: "Effets",
    resume: "Modifie le spectre du signal par des expressions mathématiques sur magnitude et phase.",
    resumeEn: "Modifies the signal spectrum by mathematical expressions on magnitude and phase.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Magnitude", nomEn: "Magnitude", type: "texte", defaut: "mag * 2",
        doc: "Expression pour la magnitude de chaque bin spectral. Variables : mag, phase, freq (Hz), bin, N (taille FFT), sr.",
        docEn: "Expression for the magnitude of each spectral bin. Variables: mag, phase, freq (Hz), bin, N (FFT size), sr.", defautEn: "mag * 2" },
      { nom: "Phase", nomEn: "Phase", type: "texte", defaut: "phase + 0.5",
        doc: "Expression pour la phase de chaque bin (laissez vide pour ne pas la modifier). Exemple : phase + 0.5 décale la phase de 0.5 radian. Variables : mag, phase, freq, bin, N, sr.",
        docEn: "Expression for the phase of each bin (leave empty to leave unchanged). Example: phase + 0.5 shifts the phase by 0.5 radian. Variables: mag, phase, freq, bin, N, sr.", defautEn: "phase + 0.5" },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 30, unite: "%", doc: "Gain de sortie.", docEn: "Output gain." },
      { nom: "FFT", nomEn: "FFT", type: "nombre", plage: [64, 8192], pas: 64, defaut: 2048, unite: "éch.",
        doc: "Taille de la FFT (arrondie à la puissance de 2 supérieure).", docEn: "FFT size (rounded up to next power of 2)." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      const formuleMag = ctx.paramTexte("Magnitude", "mag * 2");
      const formulePhase = ctx.paramTexte("Phase", "");
      const fftSize = ctx.paramNombre("FFT", 2048);
      const volume = ctx.paramNombre("Volume", 30);
      try {
        const out = appliquerFormuleSpectrale(audio, formuleMag, formulePhase, fftSize);
        const vol = Math.max(0, Math.min(1, volume / 100));
        if (vol !== 1) {
          for (let c = 0; c < out.numberOfChannels; c++) {
            const d = out.getChannelData(c);
            for (let i = 0; i < d.length; i++) d[i] *= vol;
          }
        }
        return { valeurs: [out], message: traduire("msg.formule_spectrale_appliqu_e") };
      } catch (e: any) {
        return { valeurs: [null], message: traduire("msg.erreur_formule_spectrale_var_0", e?.message ?? e) };
      }
   },
  },
  effet("equaliseur", "Égaliseur", "Equalizer", "Égaliseur 9 bandes.", "9-band equalizer.",
    [
      param("32 Hz", 0, "32 Hz", "dB", "Gain de la bande 32 Hz.", "32 Hz band gain.", [-24, 24], 1),
      param("64 Hz", 0, "64 Hz", "dB", "Gain de la bande 64 Hz.", "64 Hz band gain.", [-24, 24], 1),
      param("125 Hz", 0, "125 Hz", "dB", "Gain de la bande 125 Hz.", "125 Hz band gain.", [-24, 24], 1),
      param("250 Hz", 0, "250 Hz", "dB", "Gain de la bande 250 Hz.", "250 Hz band gain.", [-24, 24], 1),
      param("500 Hz", 0, "500 Hz", "dB", "Gain de la bande 500 Hz.", "500 Hz band gain.", [-24, 24], 1),
      param("1 kHz", 0, "1 kHz", "dB", "Gain de la bande 1 kHz.", "1 kHz band gain.", [-24, 24], 1),
      param("2 kHz", 0, "2 kHz", "dB", "Gain de la bande 2 kHz.", "2 kHz band gain.", [-24, 24], 1),
      param("4 kHz", 0, "4 kHz", "dB", "Gain de la bande 4 kHz.", "4 kHz band gain.", [-24, 24], 1),
      param("8 kHz", 0, "8 kHz", "dB", "Gain de la bande 8 kHz.", "8 kHz band gain.", [-24, 24], 1),
    ],
    (a, ...gains) => equaliser(a, ...gains)),
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
  effet("largeur-stereo", "Largeur stéréo / MS", "Stereo Width / MS", "Ajuste la largeur stéréo et le niveau Mid.", "Adjusts stereo width and Mid level.",
    [param("Largeur", 100, "Width", "%", "Largeur du champ stéréo. 0% = mono, 100% = original, 200% = stéréo élargi.", "Stereo width. 0% = mono, 100% = original, 200% = widened stereo.", [0, 200], 1), param("Mid", 100, "Mid", "%", "Gain du signal central (Mid).", "Mid channel gain.", [0, 200], 1)],
    (a, largeur, mid) => ajusterLargeurStereo(a, largeur, mid)),
  effet("fondu", "Fondu", "Fade", "Fondu entrée/sortie.", "Fade in/out.",
    [param("Entrée", 0.5, "In", "s", "Durée du fondu d'entrée.", "Fade-in duration."), param("Sortie", 0.5, "Out", "s", "Durée du fondu de sortie.", "Fade-out duration.")],
    (a,e,s) => { const r = appliquerFondu(a, "Fermeture", s); return appliquerFondu(r, "Ouverture", e); }),
  {
    id: "extraire-zone", nom: "Extraire une zone", nomEn: "Extract Zone", univers: "Traitement", famille: "Montage",
    resume: "Extrait une portion avec fondu et renvoie l'objet Zone.",
    resumeEn: "Extracts a portion with fade and returns the Zone object.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }, { nom: "Zone", nomEn: "Zone", type: "controle" }],
    parametres: [
      { nom: "Début", nomEn: "Start", plage: [0, 600], pas: 0.1, defaut: 0, unite: "s", doc: "Début de la zone à extraire.", docEn: "Start of the extracted zone." },
      { nom: "Durée", nomEn: "Duration", plage: [0.1, 600], pas: 0.1, defaut: 5, unite: "s", doc: "Durée de la zone extraite.", docEn: "Duration of the extracted zone." },
      { nom: "Fondu", nomEn: "Fade", plage: [0, 100], pas: 1, defaut: 5, unite: "ms", doc: "Durée du fondu aux bords.", docEn: "Crossfade duration at edges." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      const debut = ctx.paramNombre("Début", 0);
      const duree = Math.min(ctx.paramNombre("Durée", 5), a.duration - debut);
      // Le paramètre « Fondu » n'était tout simplement jamais lu : il existait
      // dans l'interface, documenté « fondu aux bords », sans piloter quoi que
      // ce soit (extraireZone n'avait d'ailleurs pas d'argument correspondant).
      const fondu = ctx.paramNombre("Fondu", 5);
      const zone = { debut, duree };
      return { valeurs: [extraireZone(a, debut, duree, fondu), zone] };
   },
  },
  {
    id: "reduction-bruit", nom: "Réduction de bruit", nomEn: "Noise Reduction", univers: "Traitement", famille: "Effets",
    resume: "Soustraction spectrale du bruit.",
    resumeEn: "Spectral noise subtraction.",
    entrees: [{ nom: "Audio", type: "audio" }, { nom: "Profil", nomEn: "Profile", type: "controle" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Mode", nomEn: "Mode", type: "choix", options: ["Spectral", "Notches"], optionsEn: ["Spectral", "Notches"], optionIds: ["spectral", "notches"], defaut: "Spectral",
        doc: "Spectral = soustraction de puissance standard. Notches = filtres coupe-bande dynamiques sur les fréquences les plus fortes du profil (utile pour un ronflement/hum).", docEn: "Spectral = standard power subtraction. Notches = dynamic notch filters on the strongest profile frequencies (useful for hum/buzz).", defautEn: "Spectral" },
      { nom: "Réduction", nomEn: "Reduction", type: "nombre", plage: [0, 100], pas: 1, defaut: 100, unite: "%", doc: "(Mode Spectral) Pourcentage de la puissance du bruit soustrait au signal. 100% = soustraction complète, 0% = aucun effet.", docEn: "(Spectral mode) Percentage of the noise power subtracted from the signal. 100% = full subtraction, 0% = no effect." },
      { nom: "Plancher", nomEn: "Floor", type: "nombre", plage: [0, 100], pas: 1, defaut: 1, unite: "%", doc: "(Mode Spectral) Niveau minimum de puissance conservé (pourcentage de la puissance du signal bruité). 0% = débruitage maximal, peut créer des artefacts musicaux.", docEn: "(Spectral mode) Minimum residual power level (percentage of the noisy signal power). 0% = maximum denoising, may create musical artifacts." },
      { nom: "Notches", nomEn: "Notches", type: "nombre", plage: [1, 100], pas: 1, defaut: 50, unite: "", doc: "(Mode Notches) Nombre maximum de filtres coupe-bande appliqués. Augmentez si le ronflement a beaucoup d'harmoniques.", docEn: "(Notches mode) Maximum number of notch filters applied. Increase if the hum has many harmonics." },
      { nom: "Q", nomEn: "Q", type: "nombre", plage: [1, 50], pas: 1, defaut: 10, unite: "", doc: "(Mode Notches) Sélectivité des filtres coupe-bande. Plus Q est élevé, plus la bande supprimée est étroite. Pour des harmoniques proches, laissez Q = 10.", docEn: "(Notches mode) Notch filter selectivity. Higher Q = narrower removed band. For close harmonics, leave Q = 10." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      const profil = ctx.entree(1);
      if (!(audio instanceof AudioBuffer) || !(profil instanceof Float32Array))
        return { valeurs: [null], message: traduire("msg.branchez_audio_profil_n_ud_profil_de_bruit") };
      const profilEnergie = profil.reduce((a, b) => a + b, 0) / profil.length;
      if (profilEnergie < 1e-6) {
        return { valeurs: [audio], message: traduire("msg.reduction_bruit_profil_trop_faible") };
      }
      const mode = ctx.paramTexte("Mode", "Spectral");
      if (mode === "Notches" || mode === "notches") {
        const nb = Math.round(ctx.paramNombre("Notches", 50));
        const q = ctx.paramNombre("Q", 10);
        return { valeurs: [await reduireBruitNotches(audio, profil, 2, nb, q)] };
      }
      const reduction = ctx.paramNombre("Réduction", 100) / 100;
      const plancher = ctx.paramNombre("Plancher", 1) / 100;
      return { valeurs: [await reduireBruit(audio, profil, reduction, plancher)] };
   },
  },
  {
    id: "profil-bruit", nom: "Profil de bruit", nomEn: "Noise Profile", univers: "Traitement", famille: "Effets",
    resume: "Capture le profil spectral d'un bruit.",
    resumeEn: "Captures the spectral profile of a noise.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Profil", nomEn: "Profile", type: "controle" }],
    parametres: [],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const profil = await calculerProfilBruit(audio);
      const profilEnergie = profil.reduce((a, b) => a + b, 0) / profil.length;
      return { valeurs: [profil], message: profilEnergie < 1e-6 ? traduire("msg.profil_bruit_trop_faible") : undefined };
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
        options: ["Passe-bas", "Passe-haut", "Passe-bande", "Coupe-bande"], optionIds: ["Passe-bas","Passe-haut","Passe-bande","Coupe-bande"], defaut: "Passe-bas",
        doc: "Type de filtre. Passe-bas laisse passer les graves, passe-haut les aigus, passe-bande une bande, coupe-bande retire une bande.",
        docEn: "Filter type. Lowpass passes lows, highpass passes highs, bandpass keeps a band, notch removes a band.", optionsEn: ["Lowpass", "Highpass", "Bandpass", "Notch"], defautEn: "Lowpass" },
      { nom: "Fréquence de coupure", nomEn: "Cutoff", plage: [20, 20000], pas: 1, defaut: 1000, unite: "Hz",
        doc: "Fréquence charnière du filtre (coupure ou centre de bande).", docEn: "Filter hinge frequency (cutoff or band center)." },
      { nom: "Résonance", nomEn: "Resonance", plage: [0.5, 12], pas: 0.1, defaut: 0.7, unite: "Q",
        doc: "Facteur de qualité Q : plus il est élevé, plus la courbe présente une bosse marquée à la coupure.", docEn: "Quality factor Q: higher = a sharper peak at the cutoff." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
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
        options: ["Room", "Hall", "Plate", "Spring", "Cathédrale"], optionIds: ["Room","Hall","Plate","Spring","Cathédrale"], defaut: "Hall",
        doc: "Room = petite pièce (courte, dense). Hall = grand espace (longue queue). Plate = réverbération métallique (dense, linéaire). Spring = ressort (caractéristique, oscillant). Cathédrale = très long, spectral.",
        docEn: "Room = small room (short, dense). Hall = large space (long tail). Plate = metallic reverb (dense, linear). Spring = spring reverb (characteristic, oscillating). Cathedral = very long, spectral.", optionsEn: ["Room", "Hall", "Plate", "Spring", "Cathedral"], defautEn: "Hall" },
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
      { nom: "Graine", nomEn: "Seed", plage: [1, 999999], pas: 1, defaut: 42,
        doc: "Graine de la queue diffuse. Contrairement aux nœuds où le hasard est l'effet recherché, la valeur par défaut est fixe : une réverbération qui change de pièce à chaque exécution serait un défaut. La changer donne une autre pièce, de mêmes dimensions.",
        docEn: "Seed for the diffuse tail. Unlike nodes where randomness is the point, the default is fixed: a reverb that moves to a different room on every run would be a defect. Changing it gives another room of the same dimensions." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      const { reverberationConvolution, genererIR } = await import("../audio");
      const mix = ctx.paramNombre("Mix", 50);
      let irBuffer: AudioBuffer;
      const fichier = ctx.noeud.data.irFichier as File | undefined;
      if (fichier) {
        const { decoderFichier } = await import("../audio");
        ctx.onProgress(traduire("progress.d_codage_de_l_ir"));
        irBuffer = await decoderFichier(fichier, ctx.runtime);
      } else {
        ctx.onProgress(traduire("progress.g_n_ration_de_l_ir"));
        const type = ctx.paramTexte("Type", "Hall");
        const taille = ctx.paramNombre("Taille", 50);
        const decay = ctx.paramNombre("Decay", 2);
        const preDelay = ctx.paramNombre("Pre-delay", 20);
        const damping = ctx.paramNombre("Damping", 30);
        irBuffer = genererIR(type, taille, decay, preDelay, damping, a.sampleRate,
          creerAleatoire(ctx.paramNombre("Graine", 42)));
      }
      ctx.onProgress(traduire("progress.convolution"));
      const r = await reverberationConvolution(a, irBuffer, mix);
      return { valeurs: [r], message: traduire("msg.r_verb_ration_convolution_ir_var_0_s", irBuffer.duration.toFixed(1)) };
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
        optionIds: ["none", "1/4", "1/8", "1/16", "1/32", "1/8t", "1/16t"],
        defaut: "1/16",
        doc: "Grille de quantification des départs de notes. Aligner les notes sur la grille rythmique choisie.",
        docEn: "Quantization grid for note onsets. Snaps notes to the chosen rhythmic grid.", defautEn: "1/16" },
      { nom: "Quantifier fins", nomEn: "Quantize ends", type: "choix",
        options: ["Non", "Oui"], optionsEn: ["No", "Yes"], optionIds: ["no", "yes"],
        defaut: "Non",
        doc: "Si « Oui », les fins de notes sont aussi alignées sur la grille (peut raccourcir/allonger les notes).",
        docEn: "If « Yes », note ends are also snapped to the grid (may shorten/lengthen notes).", defautEn: "No" },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      const { transposerQuantifierMidi } = await import("../audio");
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      const demiTons = Math.round(ctx.paramNombre("Transposition", 0));
      const grille = ctx.paramTexte("Quantisation", "1/16");
      const quantifierFin = ctx.paramTexte("Quantifier fins", "no") === "yes";
      const nouvFichier = await appliquerInstrumentMidi(
        await transposerQuantifierMidi(fichier, demiTons, grille, quantifierFin),
        ctx.paramNombre("Instrument", 0),
      );
      const msgs: string[] = [];
      if (demiTons !== 0) msgs.push(traduire("msg.transposition_var_0_var_1", `${demiTons > 0 ? "+" : ""}${demiTons}`, Math.abs(demiTons) > 1 ? "s" : ""));
      if (grille !== "none") msgs.push(traduire("msg.quantification_var_0_var_1", grille, quantifierFin ? " +fins" : ""));
      return { valeurs: [nouvFichier], message: msgs.length > 0 ? msgs.join(" · ") : traduire("msg.aucune_modification") };
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
        options: ["Montant", "Descendant", "UpDown", "DownUp", "Aléatoire"], optionIds: ["Montant","Descendant","UpDown","DownUp","Aléatoire"],
        optionsEn: ["Up", "Down", "UpDown", "DownUp", "Random"],
        defaut: "Montant",
        doc: "Ordre de lecture des notes de l'accord. Up = du grave à l'aigu ; Down = de l'aigu au grave ; UpDown = aller-retour ; Random = ordre aléatoire.",
        docEn: "Order in which chord notes are played. Up = low to high ; Down = high to low ; UpDown = back and forth ; Random = random order.", defautEn: "Up" },
      { nom: "Motif", nomEn: "Pattern", type: "choix",
        options: ["Droit", "1232", "12321", "1321", "1213"], optionIds: ["Droit","1232","12321","1321","1213"],
        optionsEn: ["Straight", "1232", "12321", "1321", "1213"],
        defaut: "Droit",
        doc: "Motif de répétition intra-accord (1=note basse, 2=médium, 3=haute). « Droit » = joue les notes dans l'ordre de la direction.",
        docEn: "Intra-chord repetition pattern (1=low note, 2=mid, 3=high). « Straight » = plays notes in the direction order.", defautEn: "Straight" },
      { nom: "Vitesse", nomEn: "Speed", type: "choix",
        options: ["1/8", "1/16", "1/32", "1/8 triplet", "1/16 triplet"],
        optionsEn: ["1/8", "1/16", "1/32", "1/8 triplet", "1/16 triplet"],
        defaut: "1/16",
        doc: "Vitesse de l'arpège (division du temps).",
        docEn: "Arpeggio speed (time division).", defautEn: "1/16" },
      { nom: "Octaves", nomEn: "Octaves", plage: [1, 4], pas: 1, defaut: 1,
        doc: "Nombre d'octaves sur lesquelles l'arpège se déploie (chaque octave ajoute +12 demi-tons).",
        docEn: "Number of octaves the arpeggio spans (each octave adds +12 semitones)." },
      { nom: "Graine", nomEn: "Seed", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Graine de l'ordre des notes, sans effet hors du mode « Aléatoire ». 0 = tirée au sort à chaque exécution, et affichée dans le message pour pouvoir être recopiée ici.",
        docEn: "Seed for the note order; no effect outside the « Random » mode. 0 = drawn at random on every run, and shown in the message so it can be copied back here." },
      { nom: "Durée note", nomEn: "Note length", plage: [10, 100], pas: 5, defaut: 50, unite: "%",
        doc: "Durée de chaque note arpégée en pourcentage du pas de temps. 100% = legato, 50% = staccato.",
        docEn: "Length of each arpeggiated note as a percentage of the step time. 100% = legato, 50% = staccato." },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      const { arpegerMidi } = await import("../audio");
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      const direction = ctx.paramTexte("Direction", "Montant");
      const motif = ctx.paramTexte("Motif", "Droit");
      const vitesse = ctx.paramTexte("Vitesse", "1/16");
      const octaves = Math.round(ctx.paramNombre("Octaves", 1));
      const dureeNote = ctx.paramNombre("Durée note", 50);
      const { graine, aleatoire: aleatoireArpege } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      const nouvFichier = await appliquerInstrumentMidi(
        await arpegerMidi(fichier, motif, direction, vitesse, octaves, dureeNote, aleatoireArpege),
        ctx.paramNombre("Instrument", 0),
      );
      return { valeurs: [nouvFichier], message: `${traduire("msg.arp_ge_var_0_var_1_var_2_oct", direction, vitesse, octaves)} · graine ${graine}` };
   },
  },
  {
    id: "jointure-midi", nom: "Jointure MIDI", nomEn: "MIDI Join",
    univers: "Traitement", famille: "Montage",
    resume: "Place deux fichiers MIDI l'un après l'autre avec un chevauchement.",
    resumeEn: "Places two MIDI files one after another with an overlap.",
    entrees: [{ nom: "MIDI 1", nomEn: "MIDI 1", type: "midi" }, { nom: "MIDI 2", nomEn: "MIDI 2", type: "midi" }],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Chevauchement", nomEn: "Overlap", plage: [0, 30], pas: 0.1, defaut: 0, unite: "s",
        doc: "Durée pendant laquelle le deuxième MIDI démarre avant la fin du premier. 0 = concaténation simple.",
        docEn: "Duration for which the second MIDI starts before the first ends. 0 = simple concatenation." },
    ],
    async executer(ctx: any) {
      const fichier1 = ctx.entree(0);
      const fichier2 = ctx.entree(1);
      if (!(fichier1 instanceof File) || !(fichier2 instanceof File)) {
        return { valeurs: [null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      }
      const chevauchement = ctx.paramNombre("Chevauchement", 0);
      const nouvFichier = await joindreMidi(fichier1, fichier2, chevauchement);
      const { notes, dureeTotale } = analyserMidi(parseMidi(new Uint8Array(await nouvFichier.arrayBuffer())));
      return { valeurs: [nouvFichier], message: traduire("msg.jointure_midi_var_0_notes_var_1_s", notes.length, dureeTotale.toFixed(2)) };
    },
  },
  {
    id: "boucle-midi", nom: "Boucle MIDI", nomEn: "MIDI Loop",
    univers: "Traitement", famille: "Montage",
    resume: "Répète un fichier MIDI un nombre de fois donné.",
    resumeEn: "Repeats a MIDI file a given number of times.",
    entrees: [{ nom: "MIDI", nomEn: "MIDI", type: "midi" }],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Répétitions", nomEn: "Repeats", plage: [1, 32], pas: 1, defaut: 4,
        doc: "Nombre de fois où le fichier MIDI est rejoué à la suite.",
        docEn: "Number of times the MIDI file is replayed in a row." },
      { nom: "Fondu", nomEn: "Fade", plage: [0, 1000], pas: 1, defaut: 0, unite: "ms",
        doc: "Chevauchement entre deux répétitions. 0 = pas de chevauchement (raccord sec).",
        docEn: "Overlap between two repetitions. 0 = no overlap (hard join)." },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      const repetitions = Math.round(ctx.paramNombre("Répétitions", 4));
      const fondu = ctx.paramNombre("Fondu", 0);
      const nouvFichier = await bouclerMidi(fichier, repetitions, fondu);
      const { notes, dureeTotale } = analyserMidi(parseMidi(new Uint8Array(await nouvFichier.arrayBuffer())));
      return { valeurs: [nouvFichier], message: traduire("msg.boucle_midi_var_0_repetitions_var_1_notes_var_2_s", repetitions, notes.length, dureeTotale.toFixed(2)) };
    },
  },
  {
    id: "aligneur-piste", nom: "Aligneur de piste", nomEn: "Track Aligner",
    univers: "Traitement", famille: "Montage",
    resume: "Ajuste une piste à la longueur d'une référence (silence ou fade).",
    resumeEn: "Aligns a track to a reference length (silence or fade).",
    entrees: [{ nom: "Référence", nomEn: "Reference", type: "audio" }, { nom: "Piste", nomEn: "Track", type: "audio" }],
    sorties: [{ nom: "Référence", nomEn: "Reference", type: "audio" }, { nom: "Piste alignée", nomEn: "Aligned track", type: "audio" }],
    parametres: [
      { nom: "Position", nomEn: "Position", type: "choix",
        options: ["Avant", "Après"], optionsEn: ["Before", "After"], optionIds: ["before", "after"],
        defaut: "Après",
        doc: "Où ajuster la différence. Si la piste est trop courte : ajoute du silence au début (« Avant ») ou à la fin (« Après »). Si trop longue : fade d'ouverture (« Avant », garde le début) ou fade de fermeture (« Après », garde la fin).",
        docEn: "Where to adjust the difference. If the track is too short: adds silence at the start (« Before ») or end (« After »). If too long: fade in (« Before », keeps the start) or fade out (« After », keeps the end).", defautEn: "After" },
    ],
    async executer(ctx: any) {
      const ref = ctx.entree(0);
      const piste = ctx.entree(1);
      if (!(ref instanceof AudioBuffer)) return { valeurs: [null, null], message: traduire("msg.branchez_une_r_f_rence_entr_e_1") };
      if (!(piste instanceof AudioBuffer)) return { valeurs: [ref, null], message: traduire("msg.branchez_une_piste_aligner_entr_e_2") };
      const { alignerPiste } = await import("../audio");
      const position = ctx.paramTexte("Position", "after");
      const [refOut, pisteOut] = alignerPiste(ref, piste, position === "before" ? "avant" : "apres");
      const diff = piste.length - ref.length;
      let msg: string;
      if (diff < 0) msg = `Piste ${(-diff / ref.sampleRate).toFixed(2)}s trop courte → silence ${position === "before" ? "au début" : "à la fin"}`;
      else if (diff > 0) msg = `Piste ${(diff / ref.sampleRate).toFixed(2)}s trop longue → fade ${position === "before" ? "d'ouverture" : "de fermeture"}`;
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
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { shiftFormants } = await import("../audio");
      const pitch = ctx.paramNombre("Hauteur", 0);
      const formantRatio = ctx.paramNombre("Formants", 100) / 100;
      ctx.onProgress(traduire("progress.analyse_lpc"));
      const r = shiftFormants(a, pitch, formantRatio);
      const pitchInfo = pitch !== 0 ? `pitch ${pitch > 0 ? "+" : ""}${pitch}½-ton` : "pitch inchangé";
      const formantInfo = formantRatio !== 1 ? `formants ${Math.round(formantRatio * 100)}%` : "formants inchangés";
      return { valeurs: [r], message: traduire("msg.var_0_var_1_2", pitchInfo, formantInfo) };
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
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const avant = Math.max(0, ctx.paramNombre("Avant", 1));
      const apres = Math.max(0, ctx.paramNombre("Après", 1));
      if (avant === 0 && apres === 0) return { valeurs: [a], message: traduire("msg.aucun_silence_ajouter") };
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
      return { valeurs: [resultat], message: traduire("msg.var_0_s_avant_var_1_s_apr_s_total_var_2_s", avant, apres, resultat.duration.toFixed(1)) };
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
      { nom: "Forme", nomEn: "Shape", type: "choix", options: ["Sinus", "Carré", "Triangle", "Sawtooth"], optionIds: ["Sinus","Carré","Triangle","Sawtooth"],
        optionsEn: ["Sine", "Square", "Triangle", "Sawtooth"], defaut: "Sinus",
        doc: "Forme de l'onde de modulation.", docEn: "LFO waveform shape.", defautEn: "Sine" },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
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
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { etirementGlissant } = await import("../audio");
      const debut = ctx.paramNombre("Début", 1);
      const fin = ctx.paramNombre("Fin", 2);
      return { valeurs: [etirementGlissant(a, debut, fin)], message: traduire("msg.var_0_x_var_1_x_var_2_s_var_3_s", debut, fin, a.duration.toFixed(1), (a.duration * (debut + fin) / 2).toFixed(1)) };
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
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
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
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { autoPan } = await import("../audio");
      const freq = ctx.paramNombre("Fréquence", 2);
      const depth = ctx.paramNombre("Profondeur", 80);
      return { valeurs: [await autoPan(a, freq, depth)] };
   },
  },
  {
    id: "auto-pan-logistique", nom: "Auto-pan logistique", nomEn: "Logistic auto-pan", univers: "Traitement", famille: "Effets",
    resume: "Balayage gauche → droite selon une courbe logistique.",
    resumeEn: "Left-to-right sweep following a logistic curve.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Centre", nomEn: "Center", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Point milieu de la transition logistique (0% = début, 100% = fin).", docEn: "Midpoint of the logistic transition (0% = start, 100% = end)." },
      { nom: "Pente", nomEn: "Steepness", type: "curseur", plage: [0.1, 50], pas: 0.1, defaut: 10, unite: "",
        doc: "Raideur de la courbe logistique (valeur élevée = transition très rapide).", docEn: "Steepness of the logistic curve (higher = very fast transition)." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Équilibre signal original / effet.", docEn: "Dry/wet balance." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { panLogistique } = await import("../audio");
      const centre = ctx.paramNombre("Centre", 50);
      const pente = ctx.paramNombre("Pente", 10);
      const mix = ctx.paramNombre("Mix", 100);
      return { valeurs: [panLogistique(a, centre, pente, mix)], message: traduire("msg.auto_pan_logistique", (a.duration ?? 0).toFixed(1)) };
    },
  },
  {
    id: "vibrato-logistique", nom: "Vibrato logistique", nomEn: "Logistic vibrato", univers: "Traitement", famille: "Effets",
    resume: "Vibrato dont la profondeur croît selon une courbe logistique.",
    resumeEn: "Vibrato whose depth grows following a logistic curve.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Fréquence", nomEn: "Rate", type: "curseur", plage: [0.1, 20], pas: 0.1, defaut: 5, unite: "Hz",
        doc: "Vitesse de la modulation (oscillations par seconde).", docEn: "Modulation speed (oscillations per second)." },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Amplitude maximale de la modulation de hauteur (0% = aucun, 100% = ±2 demi-tons).", docEn: "Maximum pitch modulation depth (0% = none, 100% = ±2 semitones)." },
      { nom: "Centre", nomEn: "Center", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Point milieu de la transition logistique (0% = début, 100% = fin).", docEn: "Midpoint of the logistic transition (0% = start, 100% = end)." },
      { nom: "Pente", nomEn: "Steepness", type: "curseur", plage: [0.1, 50], pas: 0.1, defaut: 10, unite: "",
        doc: "Raideur de la courbe logistique (valeur élevée = transition très rapide).", docEn: "Steepness of the logistic curve (higher = very fast transition)." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Équilibre signal original / effet.", docEn: "Dry/wet balance." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { vibratoLogistique } = await import("../audio");
      const freq = ctx.paramNombre("Fréquence", 5);
      const prof = ctx.paramNombre("Profondeur", 50);
      const centre = ctx.paramNombre("Centre", 50);
      const pente = ctx.paramNombre("Pente", 10);
      const mix = ctx.paramNombre("Mix", 100);
      return { valeurs: [vibratoLogistique(a, freq, prof, centre, pente, mix)], message: traduire("msg.vibrato_logistique", (a.duration ?? 0).toFixed(1)) };
    },
  },
  {
    id: "tremolo-logistique", nom: "Tremolo logistique", nomEn: "Logistic tremolo", univers: "Traitement", famille: "Effets",
    resume: "Tremolo dont la profondeur croît selon une courbe logistique.",
    resumeEn: "Tremolo whose depth grows following a logistic curve.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Fréquence", nomEn: "Rate", type: "curseur", plage: [0.1, 20], pas: 0.1, defaut: 5, unite: "Hz",
        doc: "Fréquence de la modulation (vibrations par seconde).", docEn: "Modulation rate (vibrations per second)." },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Profondeur maximale de la modulation (0% = aucun effet, 100% = volume coupé complètement).", docEn: "Maximum modulation depth (0% = no effect, 100% = volume fully cut)." },
      { nom: "Centre", nomEn: "Center", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Point milieu de la transition logistique (0% = début, 100% = fin).", docEn: "Midpoint of the logistic transition (0% = start, 100% = end)." },
      { nom: "Pente", nomEn: "Steepness", type: "curseur", plage: [0.1, 50], pas: 0.1, defaut: 10, unite: "",
        doc: "Raideur de la courbe logistique (valeur élevée = transition très rapide).", docEn: "Steepness of the logistic curve (higher = very fast transition)." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Équilibre signal original / effet.", docEn: "Dry/wet balance." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { tremoloLogistique } = await import("../audio");
      const freq = ctx.paramNombre("Fréquence", 5);
      const prof = ctx.paramNombre("Profondeur", 50);
      const centre = ctx.paramNombre("Centre", 50);
      const pente = ctx.paramNombre("Pente", 10);
      const mix = ctx.paramNombre("Mix", 100);
      return { valeurs: [tremoloLogistique(a, freq, prof, centre, pente, mix)], message: traduire("msg.tremolo_logistique", (a.duration ?? 0).toFixed(1)) };
    },
  },
  {
    id: "echo-logistique", nom: "Écho logistique", nomEn: "Logistic echo", univers: "Traitement", famille: "Effets",
    resume: "Écho dont le feedback croît selon une courbe logistique.",
    resumeEn: "Echo whose feedback grows following a logistic curve.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Temps", nomEn: "Time", type: "curseur", plage: [50, 2000], pas: 10, defaut: 350, unite: "ms",
        doc: "Temps de retard entre chaque répétition.", docEn: "Delay time between repetitions." },
      { nom: "Feedback", nomEn: "Feedback", type: "curseur", plage: [0, 95], pas: 1, defaut: 40, unite: "%",
        doc: "Feedback maximal atteint en fin de transition (0% = une seule répétition, 95% = répétitions longues).", docEn: "Maximum feedback reached at the end of the transition (0% = single repeat, 95% = long tail)." },
      { nom: "Centre", nomEn: "Center", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Point milieu de la transition logistique (0% = début, 100% = fin).", docEn: "Midpoint of the logistic transition (0% = start, 100% = end)." },
      { nom: "Pente", nomEn: "Steepness", type: "curseur", plage: [0.1, 50], pas: 0.1, defaut: 10, unite: "",
        doc: "Raideur de la courbe logistique (valeur élevée = transition très rapide).", docEn: "Steepness of the logistic curve (higher = very fast transition)." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Équilibre signal original / effet.", docEn: "Dry/wet balance." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { echoLogistique } = await import("../audio");
      const temps = ctx.paramNombre("Temps", 350);
      const feedback = ctx.paramNombre("Feedback", 40);
      const centre = ctx.paramNombre("Centre", 50);
      const pente = ctx.paramNombre("Pente", 10);
      const mix = ctx.paramNombre("Mix", 50);
      return { valeurs: [echoLogistique(a, temps, feedback, centre, pente, mix)], message: traduire("msg.echo_logistique", (a.duration ?? 0).toFixed(1)) };
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
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
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
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
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
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { vibrato } = await import("../audio");
      return { valeurs: [vibrato(a, ctx.paramNombre("Fréquence", 5), ctx.paramNombre("Profondeur", 50))] };
   },
 },
  {
    id: "octaver", nom: "Octaver", nomEn: "Octaver", univers: "Traitement", famille: "Effets",
    resume: "Ajoute une octave supérieure et/ou inférieure.",
    resumeEn: "Adds an upper and/or lower octave.",
    notice: "Génère jusqu'à DEUX voix supplémentaires — d'où les deux curseurs : « Octave sup » règle le volume de la voix une octave au-dessus, « Octave inf » celui de la voix une octave en dessous. Mettez l'un des deux à 0 pour n'ajouter qu'une voix. « Mix » équilibre ensuite l'original et les voix ajoutées. Technique monophonique (pédale analogique) : fonctionne le mieux sur une source à note unique (voix, basse, lead).",
    noticeEn: "Generates up to TWO extra voices — hence the two sliders: \"Octave up\" sets the volume of the voice one octave above, \"Octave down\" the voice one octave below. Set either to 0 to add a single voice. \"Mix\" then balances the original against the added voices. Monophonic technique (analog pedal style): works best on single-note sources (voice, bass, lead).",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Octave sup", nomEn: "Octave up", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Volume de la voix ajoutée une octave AU-DESSUS (fréquence doublée par redressement).", docEn: "Volume of the added voice one octave ABOVE (frequency doubled by rectification)." },
      { nom: "Octave inf", nomEn: "Octave down", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Volume de la voix ajoutée une octave EN DESSOUS (période doublée par inversion de polarité).", docEn: "Volume of the added voice one octave BELOW (period doubled by polarity flipping)." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Équilibre original / voix ajoutées. 0 % = original seul, 100 % = octaves seules.", docEn: "Dry / added-voices balance. 0% = dry only, 100% = octaves only." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
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
      { nom: "Type", nomEn: "Type", type: "choix", options: ["Dur", "Fondu"], optionIds: ["Dur","Fondu"], optionsEn: ["Hard", "Soft"], defaut: "Dur",
        doc: "Dur = coupure nette, Fondu = transition douce.", docEn: "Hard = abrupt cut, Soft = smooth transition.", defautEn: "Hard" },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { chopper } = await import("../audio");
      const typeStr = ctx.paramTexte("Type", "Dur");
      return { valeurs: [chopper(a, ctx.paramNombre("Fréquence", 4), ctx.paramNombre("Durée", 50), typeStr === "Fondu" || typeStr === "Soft" ? 1 : 0)] };
   },
  },
  {
    id: "chopper-logistique", nom: "Chopper logistique", nomEn: "Logistic chopper", univers: "Traitement", famille: "Effets",
    resume: "Gate rythmique dont la profondeur croît selon une courbe logistique.",
    resumeEn: "Rhythmic gate whose depth grows following a logistic curve.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Fréquence", nomEn: "Rate", type: "curseur", plage: [0.5, 20], pas: 0.5, defaut: 4, unite: "Hz",
        doc: "Vitesse de coupe (coups par seconde).", docEn: "Chop speed (cuts per second)." },
      { nom: "Durée", nomEn: "Length", type: "curseur", plage: [1, 99], pas: 1, defaut: 50, unite: "%",
        doc: "Ratio ON dans le cycle (1% = staccissimo, 50% = carré, 99% = quasi continu).", docEn: "ON ratio in cycle (1% = very short, 50% = square, 99% = near continuous)." },
      { nom: "Type", nomEn: "Type", type: "choix", options: ["Dur", "Fondu"], optionIds: ["Dur","Fondu"], optionsEn: ["Hard", "Soft"], defaut: "Dur",
        doc: "Dur = coupure nette, Fondu = transition douce.", docEn: "Hard = abrupt cut, Soft = smooth transition.", defautEn: "Hard" },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Profondeur maximale du gate atteinte en fin de transition (0% = aucun effet, 100% = gate complet).", docEn: "Maximum gate depth reached at the end of the transition (0% = no effect, 100% = full gate)." },
      { nom: "Centre", nomEn: "Center", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Point milieu de la transition logistique (0% = début, 100% = fin).", docEn: "Midpoint of the logistic transition (0% = start, 100% = end)." },
      { nom: "Pente", nomEn: "Steepness", type: "curseur", plage: [0.1, 50], pas: 0.1, defaut: 10, unite: "",
        doc: "Raideur de la courbe logistique (valeur élevée = transition très rapide).", docEn: "Steepness of the logistic curve (higher = very fast transition)." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Équilibre signal original / effet.", docEn: "Dry/wet balance." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { chopperLogistique } = await import("../audio");
      const typeStr = ctx.paramTexte("Type", "Dur");
      return { valeurs: [chopperLogistique(a, ctx.paramNombre("Fréquence", 4), ctx.paramNombre("Durée", 50), typeStr === "Fondu" || typeStr === "Soft" ? 1 : 0, ctx.paramNombre("Profondeur", 50), ctx.paramNombre("Centre", 50), ctx.paramNombre("Pente", 10), ctx.paramNombre("Mix", 100))], message: traduire("msg.chopper_logistique", (a.duration ?? 0).toFixed(1)) };
    },
  },
  {
    id: "beat-repeat", nom: "Beat Repeat / Stutter", nomEn: "Beat Repeat / Stutter", univers: "Traitement", famille: "Effets",
    resume: "Capture et répète un court segment à intervalles rythmiques (effet stutter).",
    resumeEn: "Captures and repeats a short segment at rhythmic intervals (stutter effect).",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Tempo", nomEn: "Tempo", type: "curseur", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Tempo utilisé pour synchroniser les intervalles et les segments.", docEn: "Tempo used to synchronize intervals and segments." },
      { nom: "Intervalle", nomEn: "Interval", type: "choix", options: ["1/1", "1/2", "1/4", "1/8", "1/16", "1/32"], optionsEn: ["1/1", "1/2", "1/4", "1/8", "1/16", "1/32"], defaut: "1/4",
        doc: "Intervalle entre deux captures. 1/4 = une capture par temps, 1/8 = une capture par demi-temps, etc.", docEn: "Interval between two captures. 1/4 = one capture per beat, 1/8 = one per half beat, etc." },
      { nom: "Taille", nomEn: "Size", type: "choix", options: ["1/32", "1/16", "1/8", "1/4", "1/2"], optionsEn: ["1/32", "1/16", "1/8", "1/4", "1/2"], defaut: "1/16",
        doc: "Longueur du segment capturé et répété.", docEn: "Length of the captured and repeated segment." },
      { nom: "Répétitions", nomEn: "Repeats", type: "curseur", plage: [1, 8], pas: 1, defaut: 4,
        doc: "Nombre de répétitions du segment capturé à chaque intervalle.", docEn: "Number of times the captured segment is repeated at each interval." },
      { nom: "Feedback", nomEn: "Feedback", type: "curseur", plage: [0, 95], pas: 1, defaut: 40, unite: "%",
        doc: "Atténuation de chaque répétition (0% = volume constant, 95% = décroissance rapide).", docEn: "Attenuation of each repeat (0% = constant volume, 95% = fast decay)." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Équilibre signal original / effet.", docEn: "Dry/wet balance." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { beatRepeat } = await import("../audio");
      const intervalStr = ctx.paramTexte("Intervalle", "1/4");
      const sizeStr = ctx.paramTexte("Taille", "1/16");
      const parseDiv = (s: string) => {
        const parts = s.split("/");
        return parts.length === 2 ? Math.max(1, Number(parts[1]) || 1) : 1;
      };
      return { valeurs: [beatRepeat(a, ctx.paramNombre("Tempo", 120), parseDiv(intervalStr), parseDiv(sizeStr), ctx.paramNombre("Répétitions", 4), ctx.paramNombre("Feedback", 40), ctx.paramNombre("Mix", 100))], message: traduire("msg.beat_repeat", (a.duration ?? 0).toFixed(1)) };
    },
  },
  {
    id: "echo", nom: "Echo", nomEn: "Echo", univers: "Traitement", famille: "Effets",
    resume: "Delay/écho ping-pong avec feedback.",
    resumeEn: "Ping-pong delay/echo with feedback.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Temps", nomEn: "Time", type: "curseur", plage: [50, 2000], pas: 10, defaut: 350, unite: "ms",
        doc: "Temps de retard entre chaque répétition.", docEn: "Delay time between repetitions." },
      { nom: "Feedback", nomEn: "Feedback", type: "curseur", plage: [0, 95], pas: 1, defaut: 40, unite: "%",
        doc: "Quantité de signal réinjectée dans le délai (plus = plus de répétitions).", docEn: "Amount of signal fed back into the delay (more = more repetitions)." },
      { nom: "Répartition", nomEn: "Spread", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Largeur stéréo de l'écho (0% = mono, 100% = balayage gauche/droite maximum).", docEn: "Stereo width of the echo (0% = mono, 100% = maximum left/right sweep)." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      return { valeurs: [await appliquerEchoPingPong(a, ctx.paramNombre("Temps", 350), ctx.paramNombre("Feedback", 40), ctx.paramNombre("Répartition", 50))] };
   },
  },
  {
    id: "echo-inverse", nom: "Echo inversé", nomEn: "Reverse Echo", univers: "Traitement", famille: "Effets",
    resume: "Echo inversé : les répétitions atténuées arrivent AVANT le son principal.",
    resumeEn: "Reverse echo: attenuated repetitions build up before the main sound.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Temps", nomEn: "Time", type: "curseur", plage: [50, 2000], pas: 10, defaut: 350, unite: "ms",
        doc: "Temps de retard entre chaque répétition.", docEn: "Delay time between repetitions." },
      { nom: "Feedback", nomEn: "Feedback", type: "curseur", plage: [0, 95], pas: 1, defaut: 40, unite: "%",
        doc: "Quantité de signal réinjecté (plus = plus de répétitions et plus longue montée).", docEn: "Amount of signal fed back (more = more repetitions and longer build-up)." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      return { valeurs: [appliquerEchoInverse(a, ctx.paramNombre("Temps", 350), ctx.paramNombre("Feedback", 40))] };
   },
  },
  {
    id: "voice-changer", nom: "Voice Changer", nomEn: "Voice Changer", univers: "Traitement", famille: "Effets",
    resume: "Transforme une voix avec des effets prédéfinis : chipmunk, monstre, robot, téléphone, alien, hélium, fantôme.",
    resumeEn: "Transforms a voice with preset effects: chipmunk, monster, robot, phone, alien, helium, ghost.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Effet", nomEn: "Effect", type: "choix",
        options: ["Chipmunk", "Monster", "Robot", "Phone", "Alien", "Helium", "Ghost"],
        optionsEn: ["Chipmunk", "Monster", "Robot", "Phone", "Alien", "Helium", "Ghost"],
        defaut: "Chipmunk",
        doc: "Type de transformation vocale.", docEn: "Voice transformation preset." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const effet = ctx.paramTexte("Effet", "Chipmunk");
      return { valeurs: [await appliquerVoiceChanger(a, effet)], message: `Voice Changer · ${effet}` };
   },
  },
  {
    id: "decoupe-aleatoire", nom: "Découpe aléatoire", nomEn: "Random Slice", univers: "Traitement", famille: "Effets",
    resume: "Découpe une piste en parts égales et les réarrange (ordre aléatoire, original ou inverse).",
    resumeEn: "Slices a track into equal parts and rearranges them (random, original or reverse order).",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Parts", nomEn: "Parts", type: "curseur", plage: [2, 64], pas: 1, defaut: 8,
        doc: "Nombre de tranches égales dans lesquelles la piste est découpée.", docEn: "Number of equal slices the track is cut into." },
      { nom: "Crossfade", nomEn: "Crossfade", type: "curseur", plage: [0, 100], pas: 1, defaut: 5, unite: "ms",
        doc: "Durée du fondu enchaîné entre les tranches pour éviter les clics.", docEn: "Crossfade duration between slices to avoid clicks." },
      { nom: "Mode", nomEn: "Mode", type: "choix",
        options: ["Random", "Original", "Reverse"],
        optionsEn: ["Random", "Original", "Reverse"],
        defaut: "Random",
        doc: "Ordre de réarrangement : aléatoire, original ou inversé.", docEn: "Rearrangement order: random, original or reversed." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [0, 9999], pas: 1, defaut: 0,
        doc: "Graine aléatoire (0 = nouvel ordre à chaque exécution). Même graine = même découpe.", docEn: "Random seed (0 = new order each run). Same seed = same slice order." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const parts = ctx.paramNombre("Parts", 8);
      const crossfade = ctx.paramNombre("Crossfade", 5);
      const mode = ctx.paramTexte("Mode", "Random");
      const graine = ctx.paramNombre("Graine", 0);
      const out = appliquerDecoupeAleatoire(a, parts, crossfade, mode, graine);
      return { valeurs: [out], message: `Découpe aléatoire · ${mode}` };
    },
  },
  {
    id: "griffin-lim", nom: "Griffin-Lim", nomEn: "Griffin-Lim", univers: "Traitement", famille: "Effets",
    resume: "Reconstruction itérative depuis le spectrogramme de magnitude. Change la phase pour créer des textures spectrales.",
    resumeEn: "Iterative reconstruction from the magnitude spectrogram. Changes phase to create spectral textures.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Itérations", nomEn: "Iterations", type: "nombre", plage: [1, 300], pas: 1, defaut: 60, unite: "",
        doc: "Nombre d'itérations Griffin-Lim. Plus c'est élevé, plus la phase est cohérente et le rendu propre.", docEn: "Number of Griffin-Lim iterations. Higher values produce more coherent phase and cleaner output." },
      { nom: "Phase initiale", nomEn: "Initial phase", type: "choix",
        options: ["Aléatoire", "Nulle", "Originale"],
        optionsEn: ["Random", "Zero", "Original"],
        optionIds: ["aleatoire", "nulle", "originale"],
        defaut: "Aléatoire",
        doc: "Phase de départ pour la reconstruction. Aléatoire = texture créative ; Nulle = impulsion initiale ; Originale = reconstruit le signal original.", docEn: "Starting phase for reconstruction. Random = creative texture; Zero = initial pulse; Original = reconstruct the original signal." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [1, 999999], pas: 1, defaut: 42,
        doc: "Graine des phases initiales, sans effet hors du mode « Aléatoire ». Valeur par défaut FIXE : une reconstruction qui change à chaque exécution serait un défaut.",
        docEn: "Seed for the initial phases; no effect outside the « Random » mode. The default is FIXED: a reconstruction that changes on every run would be a defect." },
      { nom: "FFT", nomEn: "FFT", type: "nombre", plage: [64, 8192], pas: 64, defaut: 2048, unite: "éch.",
        doc: "Taille de la FFT (arrondie à la puissance de 2 supérieure).", docEn: "FFT size (rounded up to next power of 2)." },
      { nom: "Recouvrement", nomEn: "Overlap", type: "choix",
        options: ["50 %", "75 %"],
        optionsEn: ["50 %", "75 %"],
        optionIds: ["50", "75"],
        defaut: "75 %",
        doc: "Taux de recouvrement entre fenêtres. 75 % donne un résultat plus lisse.", docEn: "Overlap between frames. 75% gives a smoother result." },
      { nom: "Mix", nomEn: "Mix", type: "nombre", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Équilibre signal original / effet.", docEn: "Dry/wet balance." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      const iterations = ctx.paramNombre("Itérations", 60);
      const phase = ctx.paramTexte("Phase initiale", "aleatoire");
      const fftSize = ctx.paramNombre("FFT", 2048);
      const recouvrement = ctx.paramTexte("Recouvrement", "75");
      const mix = ctx.paramNombre("Mix", 100);
      const peakIn = Math.max(...Array.from({ length: audio.numberOfChannels }, (_, c) => picAbsolu(audio.getChannelData(c))));
      try {
        const out = await griffinLim(audio, iterations, fftSize, recouvrement === "50" ? "50%" : "75%", phase as any, mix, ctx.onProgress,
          creerAleatoire(ctx.paramNombre("Graine", 42)));
        let peakOut = 0;
        let hasNaN = false;
        let hasInf = false;
        for (let c = 0; c < out.numberOfChannels; c++) {
          const ch = out.getChannelData(c);
          for (let i = 0; i < ch.length; i++) {
            const v = ch[i];
            if (Number.isNaN(v)) hasNaN = true;
            if (!Number.isFinite(v)) hasInf = true;
            const a = Math.abs(v);
            if (a > peakOut) peakOut = a;
          }
        }
        const fmt = (n: number) => n.toExponential(2);
        let message: string;
        if (peakIn < 1e-12) message = `Griffin-Lim · ${iterations} it. · entrée silencieuse (pic ${fmt(peakIn)})`;
        else if (hasNaN || hasInf) message = `Griffin-Lim · ${iterations} it. · sortie invalide (NaN/Inf)`;
        else if (peakOut < 1e-12) message = `Griffin-Lim · ${iterations} it. · sortie silencieuse (pic ${fmt(peakOut)})`;
        else message = `Griffin-Lim · ${iterations} it. · pic E/S ${fmt(peakIn)} / ${fmt(peakOut)}`;
        console.log("[griffin-lim]", message, { peakIn, peakOut, hasNaN, hasInf, mix, phase });
        return { valeurs: [out], message };
      } catch (e: any) {
        return { valeurs: [null], message: traduire("msg.erreur_formule_spectrale_var_0", e?.message ?? e) };
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
