// plugins/effets.ts — Nœuds d'effets audio

import { normaliserSonie } from "../audio/normalisation-sonie";
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";
import { estCourbe, progressionPour, valeurA, valeursParametre } from "../audio/courbe";
import { creerAleatoire, hasardDuNoeud } from "../core";
import { parseMidi } from "midi-file";
import {
   appliquerDelay, appliquerReverberation, appliquerDistorsion,
   appliquerFlanger, appliquerChorus, compresser, normaliser,
   appliquerFiltre, supprimerClics, reduireBruit, reduireBruitNotches, calculerProfilBruit,
  dererverberer, changerTempo, changerTonalite, glissandoTonalite, equaliser,
  inverserAudio, inverserPolarite, echangerCanaux, extraireCentreCote,
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
   harmoniser, harmoniserVoie, type OptionsHarmoniser,
   vocoder,
   granularFreeze,
    appliquerInstrumentMidi,
     griffinLim, picAbsolu,
    joindreMidi,
   bouclerMidi,
   analyserMidi,
   notesVersFichierMidi,
   rendreSequence,
} from "../audio";
import { rendreBatterieMidi } from "../audio/tone-synths";
import {
  eclaircir, echoNotes, evenements, imposerRythme, palindrome, repeterEtTourner,
  type NoteMotif, type SensMotif,
} from "../audio/motifs-midi";
import { PARAMETRE_INSTRUMENT_SF2, PARAMETRE_SYNTHESE, decoderInstrumentSF2, normaliserModeSynthèse, sf2Chargee } from "./soundfontGlobal";
import { TEMPERAMENTS, noteTemperee, tableEcarts, temperament } from "../audio/temperaments";
import { quadrafuzz } from "../audio/quadrafuzz";
import { apprendre, engendrer, statistiques, tableEnTexte } from "../audio/markov";
import { parCanal } from "./hors-fil";
import { decalerFormantsHorsFil } from "./formants-hors-fil";

type ParamEffet = { nom: string; nomEn?: string; defaut: number; unite?: string; doc?: string; docEn?: string; plage?: [number, number]; pas?: number };
/**
 * Le calcul d'un effet, ses réglages passés dans l'ordre où la fiche les déclare.
 *
 * LES ARGUMENTS NE SONT PAS TYPÉS `number`, ET C'EST DÉLIBÉRÉ. Un effet qui accepte une modulation
 * reçoit un `Float32Array` à la place du nombre, une valeur par échantillon. Typer la liste en
 * `number | Float32Array` obligerait une trentaine d'effets non modulés à convertir leurs arguments
 * un par un, pour un gain nul : la fabrique distribue déjà ses arguments par position, sans que le
 * type les relie aux paramètres déclarés.
 */
type FnEffet = (audio: AudioBuffer, ...args: any[]) => Promise<AudioBuffer> | AudioBuffer;

/**
 * Le réglage qu'une courbe branchée vient piloter.
 *
 * L'ENTRÉE RESTE FACULTATIVE, ET C'EST LA CONDITION. Sans courbe, `valeursParametre` rend une
 * constante à la valeur du réglage : le cœur de l'effet reçoit exactement ce qu'il recevait, et sa
 * sortie ne bouge pas d'un chiffre. Les empreintes enregistrées avant l'ajout le vérifient.
 *
 * `echelle` suit la nature de la grandeur : une fréquence se parcourt en multipliant, un mélange en
 * ajoutant.
 */
type ModulationEffet = {
  /** Le nom du réglage piloté, tel qu'il apparaît à l'écran. */
  parametre: string;
  /** Bornes des réglages « Modulation min » et « Modulation max », dans l'unité de l'écran. */
  bornes: [number, number];
  /** Ce que valent le zéro et le un de la courbe. Par défaut, les bornes elles-mêmes. */
  defauts?: [number, number];
  echelle?: "lineaire" | "logarithmique";
  unite?: string;
  uniteEn?: string;
};

/**
 * De quoi faire calculer un effet hors du fil de l'interface, quand son calcul le permet.
 *
 * SEULS LES EFFETS DONT LE CALCUL EST PUR PEUVENT L'EMPLOYER, c'est-à-dire ceux qui ne touchent pas
 * au Web Audio : `AudioBuffer` n'existe pas dans un worker. `voix` reçoit un canal et les réglages
 * dans l'ordre où la fiche les déclare, et c'est cette même fonction que le worker exécute.
 */
type HorsFilEffet = {
  creerWorker: () => Worker;
  voix: (x: Float32Array, o: Record<string, number>) => Float32Array;
  /** Les noms sous lesquels les réglages voyagent, dans l'ordre des paramètres de la fiche. */
  cles: string[];
};

function effet(
  slug: string, nom: string, nomEn: string, resume: string, resumeEn: string,
  parametres: ParamEffet[], fn: FnEffet, hors?: HorsFilEffet, modulation?: ModulationEffet,
): FicheAudio {
  const rangModule = modulation ? parametres.findIndex((p) => p.nom === modulation.parametre) : -1;
  if (modulation && rangModule < 0) {
    throw new Error(`${slug} : « ${modulation.parametre} » n'est pas un de ses réglages.`);
  }
  const bornesDe = (m: ModulationEffet) => [
    { nom: "Modulation min", nomEn: "Modulation min", modulationDe: m.parametre,
      type: "curseur" as const, plage: m.bornes, pas: 1,
      defaut: m.defauts?.[0] ?? m.bornes[0], unite: m.unite, uniteEn: m.uniteEn,
      doc: `Valeur de « ${m.parametre} » que vaut le zéro d'une courbe branchée. Sans courbe, ce réglage ne sert pas.`,
      docEn: `Value of « ${m.parametre} » that a connected curve's zero means. With no curve, this setting does nothing.` },
    { nom: "Modulation max", nomEn: "Modulation max", modulationDe: m.parametre,
      type: "curseur" as const, plage: m.bornes, pas: 1,
      defaut: m.defauts?.[1] ?? m.bornes[1], unite: m.unite, uniteEn: m.uniteEn,
      doc: `Valeur de « ${m.parametre} » que vaut le un de la courbe.`,
      docEn: `Value of « ${m.parametre} » that the curve's one means.` },
  ];

  return {
    id: slug, nom, nomEn, univers: "Traitement", famille: "Effets", resume, resumeEn,
    entrees: modulation
      ? [
        { nom: "Audio", type: "audio", sousType: "stereo" },
        { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false, module: modulation.parametre },
      ]
      : [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      ...parametres.map(p => ({
        nom: p.nom, nomEn: p.nomEn, defaut: p.defaut, doc: p.doc, docEn: p.docEn,
        unite: p.unite ?? (p.nom.includes("Mix") || p.nom === "Gain" || p.nom === "Réduction" ? "%" : undefined),
        ...(p.plage ? { plage: p.plage } : {}),
        ...(p.pas ? { pas: p.pas } : {}),
      })),
      ...(modulation ? bornesDe(modulation) : []),
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const args: any[] = parametres.map(p => ctx.paramNombre(p.nom, p.defaut));
      if (modulation) {
        // UN SEUL CHEMIN, modulé ou non : sans courbe, une constante à la valeur du réglage.
        args[rangModule] = valeursParametre(
          ctx.entree(1), audio.length, args[rangModule] as number,
          {
            min: ctx.paramNombre("Modulation min", modulation.defauts?.[0] ?? modulation.bornes[0]),
            max: ctx.paramNombre("Modulation max", modulation.defauts?.[1] ?? modulation.bornes[1]),
            echelle: modulation.echelle,
          },
        );
      }
      if (hors) {
        const reglages: Record<string, number> = {};
        hors.cles.forEach((cle, i) => { reglages[cle] = args[i]; });
        const voies = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
        const parVoie = await parCanal<Record<string, number>, Float32Array>(voies, reglages, {
          creerWorker: hors.creerWorker, calcul: hors.voix,
        });
        const out = new AudioBuffer({
          numberOfChannels: audio.numberOfChannels, length: audio.length, sampleRate: audio.sampleRate,
        });
        for (let c = 0; c < audio.numberOfChannels; c++) out.getChannelData(c).set(parVoie[c]);
        return { valeurs: [out] };
      }
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

/**
 * Lit un MIDI d'entrée en notes de motif.
 *
 * Les quatre nœuds de motifs partagent cette lecture, donc la même tolérance et le même
 * message quand il n'y a rien à lire. Le champ de vélocité s'appelle `velocite` dans le
 * domaine — une coquille ancienne, gardée pour ne pas casser les graphes enregistrés.
 */
async function notesDuMidi(fichier: unknown): Promise<NoteMotif[] | null> {
  if (!(fichier instanceof File)) return null;
  const { notes } = analyserMidi(parseMidi(new Uint8Array(await fichier.arrayBuffer())));
  return notes.map((n) => ({
    note: n.note, velocite: n.velocite ?? 90, debut: n.debut, fin: n.fin, canal: n.canal,
  }));
}

/** Le canal le plus représenté : une percussion doit ressortir en percussion. */
function canalDominant(notes: NoteMotif[]): number {
  const compte = new Map<number, number>();
  for (const n of notes) {
    const c = n.canal ?? 0;
    compte.set(c, (compte.get(c) ?? 0) + 1);
  }
  let meilleur = 0, max = -1;
  for (const [canal, n] of compte) if (n > max) { max = n; meilleur = canal; }
  return meilleur;
}

/**
 * Rend le motif transformé en AUDIO et en MIDI.
 *
 * L'audio n'est pas un supplément : sans lui, le nœud n'a pas de lecteur et l'on ne peut
 * pas entendre ce qu'on vient de régler sans lui brancher un point d'écoute. Le canal 9
 * passe par la synthèse de batterie — un MIDI de percussion joué en FM donnerait des sons
 * de flûte sur les notes de grosse caisse —, et l'instrument mélodique n'est alors pas
 * imposé au fichier, ce qui ferait taire la batterie chez les autres lecteurs.
 */
async function rendreMotif(
  ctx: any, notes: NoteMotif[], canal: number,
): Promise<[AudioBuffer, File]> {
  const tempo = ctx.paramNombre("Tempo", 120);
  const volume = ctx.paramNombre("Volume", 80);
  const brut = notesVersFichierMidi(notes, tempo, canal);
  if (canal === 9) {
    return [await rendreBatterieMidi({ notes, volume }), brut];
  }
  const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
  const modeRendu: "FM/Oscillateurs" | "SoundFont" =
    mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
  const { programme, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
  return [
    await rendreSequence(notes, modeRendu, volume, programme, banque),
    await appliquerInstrumentMidi(brut, ctx.paramNombre("Instrument", 0)),
  ];
}

/** Les réglages de rendu communs aux nœuds de motifs : écouter d'abord, exporter ensuite. */
const PARAMETRES_RENDU_MOTIF = [
  { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 300] as [number, number], pas: 1, defaut: 120, unite: "BPM",
    doc: "Tempo inscrit dans le fichier MIDI produit. Les durées, elles, sont en secondes et ne changent pas.",
    docEn: "Tempo written into the produced MIDI file. The durations themselves are in seconds and do not change." },
  { ...PARAMETRE_SYNTHESE,
    doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. Sans effet sur une piste de percussion, qui passe toujours par la synthèse de batterie.",
    docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. No effect on a percussion track, which always goes through the drum synthesis." },
  PARAMETRE_INSTRUMENT_SF2,
  { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100] as [number, number], pas: 1, defaut: 80, unite: "%",
    doc: "Volume du rendu audio.", docEn: "Output volume." },
];

const SORTIES_MOTIF = [
  { nom: "Audio", type: "audio" as const },
  { nom: "MIDI", nomEn: "MIDI", type: "midi" as const },
];

export const fiches: FicheAudio[] = ([
  effet("delay-stereo", "Delay stéréo", "Stereo Delay", "Delay indépendant gauche/droite.", "Independent left/right delay.",
    [param("Temps G", 250, "Time L", "ms", "Délai canal gauche.", "Left channel delay."), param("Temps D", 375, "Time R", "ms", "Délai canal droit.", "Right channel delay."), param("Feedback", 40, "Feedback", "%", "Quantité de signal réinjecté.", "Amount of signal fed back."), param("Mix", 35, "Mix", "%", "Équilibre signal original / delay.", "Dry/wet balance.")],
    (a,tg,td,fb,mix) => appliquerDelay(a, tg, td, fb, mix),
    undefined,
    { parametre: "Mix", bornes: [0, 100], unite: "%" }),
  effet("reverberation", "Réverbération", "Reverb", "Réverbération à convolution.", "Convolution reverb.",
    [param("Taille", 50, "Size", "%", "Taille de la pièce simulée.", "Simulated room size."), param("Decay", 2, "Decay", "s", "Temps de déclin de la réverbération.", "Reverb decay time."), param("Mix", 50, "Mix", "%", "Équilibre son direct / réverbération.", "Dry/wet balance."), param("Graine", 42, "Seed", "", "Graine du bruit de la réponse impulsionnelle. Valeur par défaut fixe : une réverbération qui change de pièce à chaque exécution serait un défaut. La changer donne une autre pièce, de mêmes dimensions.", "Seed for the impulse-response noise. The default is fixed: a reverb that moves to a different room on every run would be a defect. Changing it gives another room of the same dimensions.", [1, 999999], 1)],
    (a, taille, decay, mix, graine) => appliquerReverberation(a, taille, decay, mix, creerAleatoire(graine)),
    undefined,
    { parametre: "Mix", bornes: [0, 100], unite: "%" }),
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
    (a, bits, freq, mix) => bitcrusher(a, bits, freq, mix),
    undefined,
    { parametre: "Mix", bornes: [0, 100], unite: "%" }),
  effet("quadrafuzz", "Quadrafuzz", "Quadrafuzz",
    "Distorsion à quatre bandes : chaque registre sature séparément.",
    "Four-band distortion: each register saturates independently.",
    [param("Graves", 60, "Low", "%", "Saturation de la bande grave, sous la première coupure.", "Saturation of the low band, below the first crossover.", [0, 100], 1),
     param("Bas médiums", 40, "Low mids", "%", "Saturation entre la première et la deuxième coupure.", "Saturation between the first and second crossovers.", [0, 100], 1),
     param("Hauts médiums", 40, "High mids", "%", "Saturation entre la deuxième et la troisième coupure.", "Saturation between the second and third crossovers.", [0, 100], 1),
     param("Aigus", 20, "High", "%", "Saturation de la bande aiguë, au-dessus de la troisième coupure. À garder basse : c'est elle qui rend un fuzz strident.", "Saturation of the high band, above the third crossover. Keep it low: this is what makes a fuzz shrill.", [0, 100], 1),
     param("Coupure 1", 160, "Crossover 1", "Hz", "Limite entre graves et bas médiums.", "Boundary between low and low mids.", [40, 800], 10),
     param("Coupure 2", 1000, "Crossover 2", "Hz", "Limite entre bas et hauts médiums.", "Boundary between low mids and high mids.", [200, 4000], 50),
     param("Coupure 3", 4000, "Crossover 3", "Hz", "Limite entre hauts médiums et aigus.", "Boundary between high mids and high.", [1000, 12000], 100),
     param("Mix", 100, "Mix", "%", "Équilibre signal original / effet. 0 % rend le signal d'origine tel quel.", "Dry/wet balance. 0% returns the original signal untouched.", [0, 100], 1),
     param("Sortie", -6, "Output", "dB", "Gain de sortie. Une saturation fait monter le niveau : ce réglage le rattrape.", "Output gain. Saturation raises the level: this brings it back.", [-24, 12], 0.5)],
    (a, graves, basMediums, hautsMediums, aigus, f1, f2, f3, mix, sortie) =>
      quadrafuzz(a, { graves, basMediums, hautsMediums, aigus, f1, f2, f3, mix, sortie }),
    undefined,
    { parametre: "Mix", bornes: [0, 100], unite: "%" }),
  effet("exciter", "Exciter / Aural enhancer", "Exciter / Aural Enhancer", "Ajoute de la présence par distorsion harmonique dans les hauts médiums.", "Adds presence via harmonic distortion in the high mids.",
    [param("Amount", 50, "Amount", "%", "Intensité de la distorsion asymétrique.", "Intensity of the asymmetrical distortion.", [0, 100], 1), param("Fréquence", 3000, "Frequency", "Hz", "Fréquence de coupure du passe-haut après distorsion.", "High-pass cutoff after distortion.", [500, 10000], 100), param("Mix", 30, "Mix", "%", "Équilibre signal original / effet.", "Dry/wet balance.", [0, 100], 1)],
    (a, amount, freq, mix) => exciter(a, amount, freq, mix),
    undefined,
    { parametre: "Mix", bornes: [0, 100], unite: "%" }),
  effet("flanger", "Flanger", "Flanger", "Modulation par délai variable.", "Variable delay modulation.",
    [param("Mix", 50, "Mix", "%", "Équilibre signal original / effet.", "Dry/wet balance."), param("Vitesse", 0.5, "Speed", "Hz", "Vitesse de modulation LFO.", "LFO modulation speed."), param("Profondeur", 3, "Depth", "ms", "Amplitude du balayage.", "Modulation depth in ms.")],
    (a,mix,v,p) => appliquerFlanger(a, v, p, mix),
    undefined,
    { parametre: "Mix", bornes: [0, 100], unite: "%" }),
  effet("chorus", "Chorus", "Chorus", "Doublement stéréo modulé.", "Modulated stereo doubling.",
    [param("Mix", 40, "Mix", "%", "Équilibre signal original / effet.", "Dry/wet balance."), param("Vitesse", 0.8, "Speed", "Hz", "Vitesse de modulation LFO.", "LFO modulation speed."), param("Profondeur", 5, "Depth", "ms", "Amplitude du détimbrage.", "Detuning depth in ms.")],
    (a,mix,v,p) => appliquerChorus(a, v, p, mix),
    undefined,
    { parametre: "Mix", bornes: [0, 100], unite: "%" }),
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
    memoire: "flux", // enveloppe recursive, un seul scalaire
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
      return { valeurs: [r], message: traduire("msg.var_0_seuil_var_1_db_var_2", mode === "gate" ? "Gate" : "Expandeur", seuil, mode === "expander" ? ` · ratio ${ratio}:1` : "") };
   },
  },
  effet("transient-shaper", "Transient Shaper", "Transient Shaper", "Contrôle indépendant de l'attaque et du sustain.", "Independent attack and sustain control.",
    [param("Attaque", 0, "Attack", "dB", "Gain appliqué à l'attaque des transitoires. Positif = plus de punch ; négatif = moins agressif.", "Gain applied to transient attacks. Positive = more punch; negative = less aggressive.", [-12, 12], 0.5), param("Sustain", 0, "Sustain", "dB", "Gain appliqué au corps/sustain. Positif = plus de tenue ; négatif = plus court.", "Gain applied to the sustain body. Positive = more sustain; negative = shorter.", [-12, 12], 0.5), param("Temps attaque", 1, "Attack time", "ms", "Temps de réaction du détecteur de transitoires. Sans effet tant qu'Attaque et Sustain sont tous deux à 0 dB : le nœud laisse alors passer le son tel quel.", "Transient detector reaction time. No effect while Attack and Sustain are both at 0 dB: the node then passes the sound through unchanged.", [0.1, 50], 0.1), param("Temps sustain", 100, "Sustain time", "ms", "Temps de réaction du détecteur de sustain. Sans effet tant qu'Attaque et Sustain sont tous deux à 0 dB.", "Sustain detector reaction time. No effect while Attack and Sustain are both at 0 dB.", [10, 500], 1)],
    (a, attaque, sustain, tAttaque, tSustain) => transientShaper(a, attaque, sustain, tAttaque, tSustain),
    undefined,
    { parametre: "Attaque", bornes: [-12, 12], unite: "dB" }),
  effet("de-esser", "De-esser", "De-esser", "Compression dynamique des sibilances.", "Dynamic sibilance compression.",
    [param("Fréquence", 7000, "Frequency", "Hz", "Fréquence centrale de la bande cible (sibilances : 5-9 kHz).", "Center frequency of the target band (sibilances: 5-9 kHz).", [2000, 12000], 100),
     param("Largeur", 2000, "Width", "Hz", "Largeur de la bande cible (Q = fréquence/largeur).", "Width of the target band (Q = frequency/width).", [200, 6000], 100),
     param("Seuil", -20, "Threshold", "dB", "Niveau de la bande au-dessus duquel l'atténuation s'active.", "Band level above which attenuation engages.", [-60, 0], 1),
     param("Ratio", 3, "Ratio", "∶1", "Taux de réduction des sibilances.", "Sibilance reduction ratio.", [1, 10], 0.5),
     param("Attaque", 1, "Attack", "ms", "Temps de réaction (court = précis, long = doux).", "Reaction time (short = precise, long = smooth).", [0.1, 50], 0.1),
     param("Relâchement", 50, "Release", "ms", "Temps de retour au gain normal.", "Recovery time to normal gain.", [5, 500], 1)],
    (a,freq,largeur,seuil,ratio,att,rel) => deEsser(a, freq, largeur, seuil, ratio, att, rel),
    undefined,
    { parametre: "Seuil", bornes: [-60, 0], unite: "dB" }),
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
  // DEUX MODES, ET LE SECOND MANQUAIT DEPUIS LE DÉBUT. Attic MESURAIT la sonie — le VU-mètre rend
  // des LUFS — sans savoir y amener un son : normaliser à la crête est la réponse d'avant 2015.
  {
    id: "normaliseur", nom: "Normaliseur", nomEn: "Normalizer",
    univers: "Traitement", famille: "Effets",
    resume: "Amène le son à un niveau cible, en crête ou en sonie (LUFS).",
    resumeEn: "Brings the sound to a target level, by peak or by loudness (LUFS).",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Mode", nomEn: "Mode", type: "choix",
        options: ["Crête", "Sonie (LUFS)"], optionsEn: ["Peak", "Loudness (LUFS)"],
        optionIds: ["crete", "sonie"], defaut: "Crête", defautEn: "Peak",
        doc: "Crête aligne le plus grand échantillon ; sonie aligne ce qui s'entend. Deux morceaux normalisés à la même crête peuvent différer de quinze décibels à l'oreille, une batterie sèche et une nappe compressée culminant toutes deux à 0 dBFS.",
        docEn: "Peak aligns the largest sample; loudness aligns what is heard. Two pieces normalised to the same peak can differ by fifteen decibels to the ear, a dry drum kit and a compressed pad both topping out at 0 dBFS." },
      { nom: "Niveau", nomEn: "Level", type: "curseur", plage: [-40, 0], pas: 0.5, defaut: -3, unite: "dB",
        doc: "Crête cible, en mode Crête. Ce réglage ne sert pas en mode Sonie.",
        docEn: "Target peak, in Peak mode. This setting does nothing in Loudness mode." },
      { nom: "Sonie cible", nomEn: "Target loudness", type: "curseur", plage: [-36, -6], pas: 0.5, defaut: -14, unite: "LUFS",
        doc: "Sonie visée, en mode Sonie. −14 est la cible des plateformes de diffusion, −23 celle de la norme EBU R 128 pour la télévision, −16 un usage courant en balado.",
        docEn: "Target loudness, in Loudness mode. -14 is the streaming platforms' target, -23 the EBU R 128 broadcast standard, -16 a common podcast value." },
      { nom: "Plafond", nomEn: "Ceiling", type: "curseur", plage: [-6, 0], pas: 0.1, defaut: -1, unite: "dBTP",
        doc: "Vrai pic à ne pas dépasser, en mode Sonie. Si la cible demandait de le franchir, le plafond gagne et le composant annonce que la cible n'est pas atteinte : il préfère le dire plutôt qu'écrêter en silence ou glisser un limiteur derrière un bouton qui promet seulement de normaliser. Mettez un limiteur en amont si vous voulez les deux.",
        docEn: "True peak not to be exceeded, in Loudness mode. If the target required crossing it, the ceiling wins and the node announces that the target was not reached: it prefers saying so to clipping silently or slipping a limiter behind a button that only promises to normalise. Put a limiter upstream if you want both." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      if (ctx.paramTexte("Mode", "crete") === "crete") {
        const niveau = ctx.paramNombre("Niveau", -3);
        return { valeurs: [normaliser(audio, niveau)], message: traduire("msg.normaliseur.crete", niveau.toFixed(1)) };
      }
      const r = normaliserSonie(audio, ctx.paramNombre("Sonie cible", -14), { plafondDb: ctx.paramNombre("Plafond", -1) });
      const resume = traduire("msg.normaliseur.sonie",
        r.lufsAvant.toFixed(1), r.lufsApres.toFixed(1), (r.gainDb >= 0 ? "+" : "") + r.gainDb.toFixed(1), r.vraiPicDb.toFixed(1));
      return {
        valeurs: [r.audio],
        message: r.plafonne ? `${resume} — ${traduire("msg.normaliseur.plafonne")}` : resume,
      };
    },
  },
  effet("suppression-clics", "Suppression de clics", "Click Removal", "Détection et suppression de clicks.", "Click detection and removal.",
    [param("Seuil", 5, "Threshold", "×", "Sensibilité de détection (multiple de la dérivée médiane). Plus élevé = moins sensible (détecte seulement les gros clics). Plus bas = plus sensible.", "Detection sensitivity (multiple of median derivative). Higher = less sensitive (only big clicks). Lower = more sensitive.", [1, 50], 1),
     param("Fenêtre", 5, "Window", "ms", "Largeur de la fenêtre de remplacement.", "Replacement window width.")],
    (a,s,f) => supprimerClics(a, s, f),
    undefined,
    { parametre: "Seuil", bornes: [1, 50], unite: "×" }),
  effet("dereverberation", "Déréverbération", "Dereverb", "Atténuation de la réverbération.", "Reverb attenuation.",
    [param("Réduction", 60, "Reduction", "%", "Force de l'atténuation de la réverb.", "Reverb reduction strength.")],
    (a,r) => dererverberer(a, r)),
  effet("changement-tempo", "Changement de tempo", "Tempo Change", "Time-stretch via vocodeur de phase.", "Time-stretch via phase vocoder.",
    [param("Tempo (%)", 100, "Tempo (%)", "%", "Tempo cible. 100=normal, 50=moitié, 200=double.", "Target tempo. 100=normal, 50=half, 200=double.", [25, 400], 5), param("Fenêtre", 50, "Window", "ms", "Taille de la fenêtre d'analyse, ramenée à la puissance de deux d'échantillons la plus proche. Courte (10 à 30 ms), les attaques restent nettes mais les sons graves se brouillent ; longue (80 à 200 ms), les sons tenus restent lisses mais les attaques s'étalent.", "Analysis window size, rounded to the nearest power of two in samples. Short (10 to 30 ms), attacks stay sharp but low sounds blur; long (80 to 200 ms), held sounds stay smooth but attacks smear.", [5, 400], 5)],
    (a,t,f) => changerTempo(a, t, f)),
  effet("changement-tonalite", "Changement de tonalité", "Pitch Shift", "Pitch-shift.", "Pitch shift.",
    [param("Demi-tons", 2, "Semitones", "", "Transposition en demi-tons.", "Transposition in semitones.", [-24, 24], 1)],
    (a,d) => changerTonalite(a, d)),
  effet("glissando-tonalite", "Glissando de tonalité", "Pitch Glissando", "Pitch-shift glissant d'une tonalité à une autre.", "Pitch glissando from one pitch to another.",
    [param("Début", 0, "Start", "st", "Hauteur de départ en demi-tons.", "Start pitch in semitones.", [-24, 24], 0.5),
     param("Fin", 12, "End", "st", "Hauteur d'arrivée en demi-tons.", "End pitch in semitones.", [-24, 24], 0.5)],
    (a,debut,fin) => glissandoTonalite(a, debut, fin)),
  effet("harmonizer", "Harmonizer / Octaver", "Harmonizer / Octaver", "Ajoute des voix pitch-shiftées (octave, quinte…) sous l'original.", "Adds pitch-shifted voices (octave, fifth…) under the original.",
    [param("Voix 1", 12, "Voice 1", "st", "Intervalle de la première voix en demi-tons. 12 = octave supérieure, -12 = octave inférieure, 7 = quinte.", "Interval of first voice in semitones. 12 = octave up, -12 = octave down, 7 = fifth.", [-24, 24], 1), param("Mix 1", 30, "Mix 1", "%", "Niveau de la première voix.", "Level of first voice.", [0, 100], 1), param("Voix 2", -12, "Voice 2", "st", "Intervalle de la deuxième voix en demi-tons.", "Interval of second voice in semitones.", [-24, 24], 1), param("Mix 2", 30, "Mix 2", "%", "Niveau de la deuxième voix.", "Level of second voice.", [0, 100], 1)],
    (a, v1, m1, v2, m2) => harmoniser(a, v1, m1, v2, m2),
    {
      creerWorker: () => new Worker(new URL("../workers/harmoniser-worker.ts", import.meta.url), { type: "module" }),
      voix: (x, o) => harmoniserVoie(x, o as unknown as OptionsHarmoniser),
      cles: ["interval1", "mix1", "interval2", "mix2"],
    }),
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
        doc: "Graine de la randomisation des phases. Valeur par défaut fixe : un étirement qui change à chaque exécution serait un défaut. La changer donne une autre texture, de même caractère.",
        docEn: "Seed for the phase randomization. The default is fixed: a stretch that changes on every run would be a defect. Changing it gives another texture of the same character." },
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
        doc: "Graine de la randomisation des phases. Valeur par défaut fixe : un étirement qui change à chaque exécution serait un défaut. La changer donne une autre texture, de même caractère.",
        docEn: "Seed for the phase randomization. The default is fixed: a stretch that changes on every run would be a defect. Changing it gives another texture of the same character." },
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
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false, module: "Volume" },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Formule", nomEn: "Formula", type: "texte", defaut: "sin(t * 2 * pi * 440) + x",
        doc: "Expression mathématique donnant la valeur de sortie de chaque échantillon. Variables : x (valeur actuelle), t (temps en secondes), i (index de l'échantillon), c (canal), ch (nombre de canaux), sr (fréquence d'échantillonnage).",
        docEn: "Mathematical expression giving the output value of each sample. Variables: x (current value), t (time in seconds), i (sample index), c (channel), ch (channel count), sr (sample rate).", defautEn: "sin(t * 2 * pi * 440) + x" },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 30, unite: "%",
        doc: "Gain de sortie. Une courbe branchée sur l'entrée Modulation donne cette valeur à chaque instant, à la place du curseur.",
        docEn: "Output gain. A curve connected to the Modulation input gives this value at each instant, in place of the slider." },
      { nom: "Modulation min", nomEn: "Modulation min", modulationDe: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Gain que vaut le zéro d'une courbe branchée sur l'entrée Modulation. Sans courbe branchée, ce réglage n'agit pas.",
        docEn: "Gain that a connected curve's zero means on the Modulation input. With no curve connected, this setting has no effect." },
      { nom: "Modulation max", nomEn: "Modulation max", modulationDe: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Gain que vaut le un de la courbe. Une valeur inférieure à Modulation min inverse le sens du parcours.",
        docEn: "Gain that the curve's one means. A value below Modulation min reverses the direction of travel." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      const formule = ctx.paramTexte("Formule", "sin(t * 2 * pi * 440) + x");
      const volume = ctx.paramNombre("Volume", 30);
      // Sans courbe branchée, le gain reste un nombre et la boucle garde son chemin : à volume plein
      // elle n'est même pas parcourue, comme avant.
      const modulation = ctx.entree(1);
      const courbeVolume = estCourbe(modulation)
        ? valeursParametre(modulation, audio.length, 0, {
          min: ctx.paramNombre("Modulation min", 0), max: ctx.paramNombre("Modulation max", 100),
        })
        : null;
      try {
        const out = appliquerFormuleEchantillons(audio, formule);
        const vol = Math.max(0, Math.min(1, volume / 100));
        if (courbeVolume) {
          for (let c = 0; c < out.numberOfChannels; c++) {
            const d = out.getChannelData(c);
            for (let i = 0; i < d.length; i++) d[i] *= Math.max(0, Math.min(1, valeurA(courbeVolume, i) / 100));
          }
        } else if (vol !== 1) {
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
      { nom: "FFT", nomEn: "FFT", type: "nombre", plage: [64, 8192], pas: 64, defaut: 2048, unite: "éch.", uniteEn: "samples",
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
  simple("inverseur-audio", "Lecture inversée", "Reverse Playback",
    "Lit la piste de la fin vers le début.", "Plays the track from end to start.", inverserAudio),
  // L'INVERSION DE POLARITÉ MANQUAIT, et le nœud ci-dessus la promettait sans la faire : il
  // s'appelait « Inverseur audio » et se résumait par « inverse le signal », la formule qui désigne
  // la polarité partout ailleurs. Qui la cherchait le trouvait et obtenait une lecture à l'envers.
  simple("inversion-polarite", "Inversion de polarité", "Polarity Inversion",
    "Change le signe de chaque échantillon. Inaudible seule, décisive en relation.",
    "Flips the sign of every sample. Inaudible on its own, decisive in relation.", inverserPolarite),
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
    (a, largeur, mid) => ajusterLargeurStereo(a, largeur, mid),
    undefined,
    { parametre: "Largeur", bornes: [0, 200], unite: "%" }),
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
    resumeEn: "Filters the signal and displays the frequency response curve.",
    entrees: [
      { nom: "Audio", type: "audio" },
      { nom: "Modulation coupure", nomEn: "Cutoff modulation", type: "courbe", requis: false, module: "Fréquence de coupure" },
      // Ajouté EN FIN DE LISTE : les ports se désignent par leur rang, et l'insérer ailleurs
      // débrancherait l'audio de tous les graphes déjà enregistrés.
      { nom: "Modulation résonance", nomEn: "Resonance modulation", type: "courbe", requis: false, module: "Résonance" },
    ],
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
      { nom: "Modulation min", nomEn: "Modulation min", modulationDe: "Fréquence de coupure", plage: [20, 20000], pas: 1, defaut: 200, unite: "Hz",
        doc: "Coupure que vaut le zéro d'une courbe branchée sur l'entrée Modulation. Sans courbe, ce réglage ne sert pas.",
        docEn: "Cutoff that a connected curve's zero means. With no curve, this setting does nothing." },
      { nom: "Modulation max", nomEn: "Modulation max", modulationDe: "Fréquence de coupure", plage: [20, 20000], pas: 1, defaut: 6000, unite: "Hz",
        doc: "Coupure que vaut le un de la courbe. Brancher la brillance du son lui-même sur cette entrée donne l'effet adaptatif de l'article : le filtre s'ouvre quand le son devient dur.",
        docEn: "Cutoff that the curve's one means. Feeding the sound's own brightness into this input gives the paper's adaptive effect: the filter opens as the sound gets harsh." },
      { nom: "Résonance min", nomEn: "Resonance min", modulationDe: "Résonance", type: "curseur", plage: [0.5, 12], pas: 0.1, defaut: 0.7, unite: "Q",
        doc: "Résonance que vaut le zéro d'une courbe branchée sur l'entrée Modulation résonance.",
        docEn: "Resonance that a curve's zero means on the Resonance modulation input." },
      { nom: "Résonance max", nomEn: "Resonance max", modulationDe: "Résonance", type: "curseur", plage: [0.5, 12], pas: 0.1, defaut: 8, unite: "Q",
        doc: "Résonance que vaut le un de la courbe. Deux réglages du même filtre peuvent bouger ensemble : la coupure qui balaie pendant que la résonance se pince est ce qu'aucune mise en série de deux filtres ne reproduit.",
        docEn: "Resonance that the curve's one means. Two settings of the same filter can move together: the cutoff sweeping while the resonance pinches is what no two filters in series can reproduce." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const type = ctx.paramTexte("Type", "Passe-bas");
      const modulationQ = ctx.entree(2);
      const q = estCourbe(modulationQ)
        ? valeursParametre(modulationQ, a.length, 0, {
          min: ctx.paramNombre("Résonance min", 0.7), max: ctx.paramNombre("Résonance max", 8),
          ...progressionPour({ unite: "Q" }),
        })
        : ctx.paramNombre("Résonance", 0.7);
      const map: Record<string, BiquadFilterType> = { "Passe-bas": "lowpass", "Passe-haut": "highpass", "Passe-bande": "bandpass", "Coupe-bande": "notch" };
      // Sans courbe branchée, on passe le NOMBRE et non un tableau constant : le filtre garde
      // alors exactement le chemin qu'il avait, et son résultat ne bouge pas d'un bit.
      const modulation = ctx.entree(1);
      const coupure = estCourbe(modulation)
        // LA COUPURE EST UNE FRÉQUENCE, DONC ELLE SE PARCOURT EN MULTIPLIANT. Réparti
        // linéairement, un balayage de 200 à 6000 Hz mettait sa moitié à 3 100 Hz : l'octave
        // 200-400, la plus audible du trajet, occupait trois pour-cent de la course, et le
        // balayage se précipitait puis s'arrêtait. La progression est déduite de l'unité déclarée
        // par le réglage, et non choisie ici — voir `progressionPour` dans `audio/courbe.ts`.
        ? valeursParametre(modulation, a.length, 0, {
          min: ctx.paramNombre("Modulation min", 200),
          max: ctx.paramNombre("Modulation max", 6000),
          ...progressionPour({ unite: "Hz", pas: 1 }),
        })
        : ctx.paramNombre("Fréquence de coupure", 1000);
      return { valeurs: [await appliquerFiltre(a, map[type] ?? "lowpass", coupure, q)] };
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
        doc: "Graine de la queue diffuse. Contrairement aux composants où le hasard est l'effet recherché, la valeur par défaut est fixe : une réverbération qui change de pièce à chaque exécution serait un défaut. La changer donne une autre pièce, de mêmes dimensions.",
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
    id: "motif-imposer-rythme", nom: "Imposer un rythme", nomEn: "Impose Rhythm",
    univers: "Traitement", famille: "Effets",
    resume: "Plaque la grille rythmique d'un MIDI sur les hauteurs d'un autre.",
    resumeEn: "Applies one MIDI file's rhythmic grid to another's pitches.",
    entrees: [
      { nom: "Hauteurs", nomEn: "Pitches", type: "midi" },
      { nom: "Rythme", nomEn: "Rhythm", type: "midi" },
    ],
    sorties: SORTIES_MOTIF,
    parametres: PARAMETRES_RENDU_MOTIF,
    async executer(ctx: any) {
      const hauteurs = await notesDuMidi(ctx.entree(0));
      const grille = await notesDuMidi(ctx.entree(1));
      if (!hauteurs || !grille) return { valeurs: [null, null], message: traduire("msg.motif.deuxMidi") };
      const sortie = imposerRythme(hauteurs, grille);
      if (sortie.length === 0) return { valeurs: [null, null], message: traduire("msg.aucune_note") };
      const [audio, midi] = await rendreMotif(ctx, sortie, canalDominant(hauteurs));
      return {
        valeurs: [audio, midi],
        // On annonce des ÉVÉNEMENTS et non des notes : ce qui tourne en boucle, ce sont
        // les accords, et ce qui commande la longueur, ce sont les frappes.
        message: traduire("msg.motif.imposer", sortie.length, evenements(grille).length, evenements(hauteurs).length),
      };
    },
  },
  {
    id: "motif-echo-notes", nom: "Écho de notes", nomEn: "Note Echo",
    univers: "Traitement", famille: "Effets",
    resume: "Superpose des copies décalées d'un motif, de vélocité décroissante.",
    resumeEn: "Layers time-shifted copies of a pattern, with decreasing velocity.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: SORTIES_MOTIF,
    parametres: [
      { nom: "Répétitions", nomEn: "Repeats", type: "nombre", plage: [0, 16], pas: 1, defaut: 3,
        doc: "Nombre de copies ajoutées après chaque note. Les copies qui descendraient sous la vélocité 1 ne sont pas écrites.",
        docEn: "Number of copies added after each note. Copies that would fall below velocity 1 are not written." },
      { nom: "Décalage", nomEn: "Offset", type: "nombre", plage: [0.01, 4], pas: 0.01, defaut: 0.25, unite: "s",
        doc: "Écart entre deux copies successives.", docEn: "Gap between two successive copies." },
      { nom: "Atténuation", nomEn: "Feedback", type: "nombre", plage: [0, 100], pas: 1, defaut: 60, unite: "%",
        doc: "Part de la vélocité que chaque copie garde de la précédente. 100 % = copies aussi fortes que l'original.",
        docEn: "Share of the velocity each copy keeps from the previous one. 100 % = copies as loud as the original." },
      { nom: "Transposition", nomEn: "Transpose", type: "nombre", plage: [-12, 12], pas: 1, defaut: 0, unite: " ½-ton", uniteEn: "st",
        doc: "Transposition cumulée à chaque copie : +7 fait monter l'écho de quinte en quinte. Une copie qui sortirait du clavier MIDI arrête la série.",
        docEn: "Transposition accumulated at each copy: +7 sends the echo up fifth by fifth. A copy that would leave the MIDI range ends the series." },
      ...PARAMETRES_RENDU_MOTIF,
    ],
    async executer(ctx: any) {
      const notes = await notesDuMidi(ctx.entree(0));
      if (!notes) return { valeurs: [null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      if (notes.length === 0) return { valeurs: [null, null], message: traduire("msg.aucune_note") };
      const sortie = echoNotes(notes, {
        repetitions: ctx.paramNombre("Répétitions", 3),
        decalage: ctx.paramNombre("Décalage", 0.25),
        attenuation: ctx.paramNombre("Atténuation", 60) / 100,
        transposition: ctx.paramNombre("Transposition", 0),
      });
      const [audio, midi] = await rendreMotif(ctx, sortie, canalDominant(notes));
      return {
        valeurs: [audio, midi],
        message: traduire("msg.motif.echo", notes.length, sortie.length - notes.length),
      };
    },
  },
  {
    id: "motif-eclaircir", nom: "Éclaircir", nomEn: "Thin Out",
    univers: "Traitement", famille: "Effets",
    resume: "Retire une part des notes au hasard, de façon reproductible.",
    resumeEn: "Removes a share of the notes at random, reproducibly.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: SORTIES_MOTIF,
    parametres: [
      { nom: "Proportion", nomEn: "Amount", type: "nombre", plage: [0, 100], pas: 1, defaut: 30, unite: "%",
        doc: "Part des événements retirés. Le tirage se fait par événement et non par note : un accord part entier ou reste entier.",
        docEn: "Share of events removed. The draw is per event, not per note: a chord leaves whole or stays whole." },
      { nom: "Garder les temps", nomEn: "Keep beats", type: "choix",
        options: ["Non", "Oui"], optionsEn: ["No", "Yes"], optionIds: ["non", "oui"],
        defaut: "Oui", defautEn: "Yes",
        doc: "Épargne les événements qui tombent sur un temps. Une trame éclaircie entièrement au hasard perd sa pulsation ; on veut souvent l'alléger sans la dissoudre.",
        docEn: "Spares the events that land on a beat. A texture thinned purely at random loses its pulse; one often wants to lighten it without dissolving it." },
      { nom: "Durée d'un temps", nomEn: "Beat length", type: "nombre", plage: [0.05, 4], pas: 0.05, defaut: 0.5, unite: "s",
        doc: "Ce qui compte pour un temps, en secondes. À 120 BPM, la noire fait 0,5 s.",
        docEn: "What counts as a beat, in seconds. At 120 BPM, a quarter note is 0.5 s." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "0 = tirée au sort à chaque exécution, et affichée dans le message. Toute autre valeur rejoue exactement le même éclaircissement.",
        docEn: "0 = drawn at random on every run, and shown in the message. Any other value replays the exact same thinning." },
      ...PARAMETRES_RENDU_MOTIF,
    ],
    async executer(ctx: any) {
      const notes = await notesDuMidi(ctx.entree(0));
      if (!notes) return { valeurs: [null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      if (notes.length === 0) return { valeurs: [null, null], message: traduire("msg.aucune_note") };
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      const sortie = eclaircir(notes, ctx.paramNombre("Proportion", 30) / 100, aleatoire, {
        preserverPremierTemps: ctx.paramTexte("Garder les temps", "oui") === "oui",
        dureeTemps: ctx.paramNombre("Durée d'un temps", 0.5),
      });
      if (sortie.length === 0) return { valeurs: [null, null], message: traduire("msg.motif.toutRetire") };
      const [audio, midi] = await rendreMotif(ctx, sortie, canalDominant(notes));
      return {
        valeurs: [audio, midi],
        message: traduire("msg.motif.eclaircir", notes.length - sortie.length, notes.length, graine),
      };
    },
  },
  {
    id: "motif-retrograde", nom: "Rétrograde et palindrome", nomEn: "Retrograde and Palindrome",
    univers: "Traitement", famille: "Effets",
    resume: "Joue un motif à l'envers, ou en aller-retour.",
    resumeEn: "Plays a pattern backwards, or there and back.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: SORTIES_MOTIF,
    parametres: [
      { nom: "Sens", nomEn: "Direction", type: "choix",
        options: ["Rétrograde", "Aller-retour", "Retour-aller"],
        optionsEn: ["Retrograde", "There and back", "Back and there"],
        optionIds: ["retrograde", "aller-retour", "retour-aller"],
        defaut: "Aller-retour", defautEn: "There and back",
        doc: "« Rétrograde » ne rend que le motif à l'envers. « Aller-retour » met le motif puis son rétrograde à la suite, ce qui donne un palindrome. « Retour-aller » commence par le rétrograde, ce qui fait entendre le motif d'origine comme une résolution.",
        docEn: "« Retrograde » outputs the reversed pattern only. « There and back » puts the pattern then its retrograde one after the other, giving a palindrome. « Back and there » starts with the retrograde, which makes the original pattern sound like a resolution." },
      { nom: "Rejouer la charnière", nomEn: "Repeat the hinge", type: "choix",
        options: ["Non", "Oui"], optionsEn: ["No", "Yes"], optionIds: ["non", "oui"],
        defaut: "Non", defautEn: "No",
        doc: "Sort de l'événement du retournement. Do-ré-mi suivi de son rétrograde donne do-ré-mi-mi-ré-do, où le mi est joué deux fois ; le palindrome qu'on écrit en musique est do-ré-mi-ré-do, avec un seul mi au sommet. La répétition marque le retournement, son absence le rend fluide. Sans effet en mode « Rétrograde ».",
        docEn: "What becomes of the turning event. C-D-E followed by its retrograde gives C-D-E-E-D-C, where the E is played twice; the palindrome one writes in music is C-D-E-D-C, with a single E at the top. Repeating marks the turn, dropping it makes it flow. No effect in « Retrograde » mode." },
      ...PARAMETRES_RENDU_MOTIF,
    ],
    async executer(ctx: any) {
      const notes = await notesDuMidi(ctx.entree(0));
      if (!notes) return { valeurs: [null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      if (notes.length === 0) return { valeurs: [null, null], message: traduire("msg.aucune_note") };
      const sens = ctx.paramTexte("Sens", "aller-retour") as SensMotif;
      const pivot = ctx.paramTexte("Rejouer la charnière", "non") === "oui";
      const sortie = palindrome(notes, sens, pivot);
      const [audio, midi] = await rendreMotif(ctx, sortie, canalDominant(notes));
      return {
        valeurs: [audio, midi],
        message: traduire("msg.motif.retrograde", evenements(sortie).length, evenements(notes).length),
      };
    },
  },
  {
    id: "motif-repeter-tourner", nom: "Répéter et tourner", nomEn: "Ply and Rotate",
    univers: "Traitement", famille: "Effets",
    resume: "Répète chaque note dans sa propre durée, et décale les hauteurs sur la grille.",
    resumeEn: "Repeats each note within its own duration, and shifts the pitches along the grid.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: SORTIES_MOTIF,
    parametres: [
      { nom: "Répétitions", nomEn: "Repeats", type: "nombre", plage: [1, 16], pas: 1, defaut: 2,
        doc: "Nombre de fois que chaque événement est joué à l'intérieur de sa durée d'origine. La grille ne se déplace pas : elle se remplit. 1 = aucune répétition.",
        docEn: "How many times each event is played inside its original duration. The grid does not move: it fills up. 1 = no repetition." },
      { nom: "Rotation", nomEn: "Rotation", type: "nombre", plage: [-32, 32], pas: 1, defaut: 0,
        doc: "Décale la suite des hauteurs sur la grille rythmique, sans toucher aux départs : le rythme reste, la mélodie glisse. La rotation s'applique après les répétitions, donc sur le motif densifié.",
        docEn: "Shifts the pitch sequence along the rhythmic grid without touching the onsets: the rhythm stays, the melody slides. The rotation applies after the repeats, hence on the densified pattern." },
      ...PARAMETRES_RENDU_MOTIF,
    ],
    async executer(ctx: any) {
      const notes = await notesDuMidi(ctx.entree(0));
      if (!notes) return { valeurs: [null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      if (notes.length === 0) return { valeurs: [null, null], message: traduire("msg.aucune_note") };
      const repetitions = ctx.paramNombre("Répétitions", 2);
      const rotation = ctx.paramNombre("Rotation", 0);
      const sortie = repeterEtTourner(notes, repetitions, rotation);
      const [audio, midi] = await rendreMotif(ctx, sortie, canalDominant(notes));
      return {
        valeurs: [audio, midi],
        message: traduire("msg.motif.repeter", sortie.length, repetitions, rotation),
      };
    },
  },
  {
    id: "markov-midi", nom: "Chaîne de Markov", nomEn: "Markov Chain",
    univers: "Traitement", famille: "Effets",
    resume: "Apprend les enchaînements de notes d'un MIDI et en engendre de nouveaux, avec la table de transitions en clair.",
    resumeEn: "Learns a MIDI file's note transitions and generates new ones, with the transition table in plain sight.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
      { nom: "Table", nomEn: "Table", type: "texte" },
    ],
    parametres: [
      { nom: "Ordre", nomEn: "Order", type: "nombre", plage: [1, 4], pas: 1, defaut: 2,
        doc: "Nombre de notes regardées en arrière. À 1, le morceau ressort dans sa tonalité mais sans phrase ; à 2 ou 3, ses tournures réapparaissent ; au-delà, la chaîne n'a plus le choix et recopie la source. La sortie texte indique la part de contextes sans choix, qui mesure ce sur-apprentissage.",
        docEn: "How many notes are looked back on. At 1, the piece comes out in its key but without phrasing; at 2 or 3, its turns of phrase reappear; beyond that, the chain has no choice left and copies the source. The text output gives the share of contexts with no choice, which measures that overfitting." },
      { nom: "Notes", nomEn: "Notes", type: "nombre", plage: [4, 2000], pas: 1, defaut: 64,
        doc: "Nombre de notes engendrées.", docEn: "Number of notes generated." },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 300], pas: 1, defaut: 120, unite: "BPM",
        doc: "Vitesse du MIDI produit. Les durées de la source ne sont pas apprises : le composant n'imite que les hauteurs, et les joue en croches.",
        docEn: "Speed of the produced MIDI. The source's durations are not learned: the node imitates pitches only, and plays them as eighth notes." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "0 = tirée au sort à chaque exécution, et affichée dans le message. Toute autre valeur rejoue exactement la même suite.",
        docEn: "0 = drawn at random on every run, and shown in the message. Any other value replays the exact same sequence." },
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume du rendu audio.", docEn: "Output volume." },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null, null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      const { notes } = analyserMidi(parseMidi(new Uint8Array(await fichier.arrayBuffer())));
      if (notes.length === 0) return { valeurs: [null, null, null], message: traduire("msg.aucune_note") };
      const ordre = ctx.paramNombre("Ordre", 2);
      const table = apprendre(
        notes.map((n: any) => ({ note: n.note, velocite: n.velocite ?? 90, debut: n.debut, fin: n.fin })),
        ordre,
      );
      if (table.size === 0) return { valeurs: [null, null, null], message: traduire("msg.markov.tropCourt") };
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      const hauteurs = engendrer(table, ordre, ctx.paramNombre("Notes", 64), aleatoire);
      const tempo = ctx.paramNombre("Tempo", 120);
      const pas = (60 / tempo) / 2;
      const engendrees = hauteurs.map((note, i) => ({ note, velocite: 90, debut: i * pas, fin: i * pas + pas * 0.9 }));
      const stats = statistiques(table);
      const rapport = [
        traduire("msg.markov.stats", stats.contextes, stats.transitions, Math.round(stats.partSansChoix * 100)),
        "",
        tableEnTexte(table),
      ].join("\n");
      // La chaîne n'apprend que des hauteurs : elle ne reprend donc jamais le canal de
      // la source, et sa sortie est mélodique même apprise sur une piste de batterie.
      const [audio, midi] = await rendreMotif(ctx, engendrees, 0);
      return {
        valeurs: [audio, midi, rapport],
        message: traduire("msg.markov.resultat", engendrees.length, stats.contextes, graine),
      };
    },
  },
  {
    id: "temperament", nom: "Tempérament", nomEn: "Temperament",
    univers: "Traitement", famille: "Effets",
    resume: "Rejoue un MIDI dans un tempérament historique ou en intonation juste, au lieu du tempérament égal.",
    resumeEn: "Replays a MIDI file in a historical temperament or just intonation, instead of equal temperament.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "Écarts", nomEn: "Deviations", type: "texte" }],
    parametres: [
      { nom: "Tempérament", nomEn: "Temperament", type: "choix",
        options: TEMPERAMENTS.map((t) => t.fr),
        optionsEn: TEMPERAMENTS.map((t) => t.en),
        optionIds: TEMPERAMENTS.map((t) => t.id),
        defaut: "Intonation juste", defautEn: "Just intonation",
        doc: "L'accord employé. « Égal » est celui de tous les autres composants ; les autres donnent à chaque tonalité une couleur propre.",
        docEn: "The tuning used. « Equal » is the one every other node uses; the others give each key its own colour." },
      { nom: "Tonique", nomEn: "Tonic", type: "choix",
        options: ["Do", "Do#", "Ré", "Mi♭", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "Si♭", "Si"],
        optionsEn: ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"],
        optionIds: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
        defaut: "Do", defautEn: "C",
        doc: "La note sur laquelle le tempérament est accordé. C'est elle qui sonne pure ; les tonalités éloignées s'écartent d'autant plus.",
        docEn: "The note the temperament is tuned on. It is the one that sounds pure; distant keys drift the further away." },
      { ...PARAMETRE_SYNTHESE, doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM.", docEn: "Auto = SoundFont if an SF2 file is loaded, else FM." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume du rendu.", docEn: "Output volume." },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      const { analyserMidi, rendreSequence } = await import("../audio");
      const { notes } = analyserMidi(parseMidi(new Uint8Array(await fichier.arrayBuffer())));
      if (notes.length === 0) return { valeurs: [null, null], message: traduire("msg.aucune_note") };
      const temp = temperament(ctx.paramTexte("Tempérament", "juste"));
      const tonique = parseInt(ctx.paramTexte("Tonique", "0"), 10) || 0;
      // Les hauteurs deviennent FRACTIONNAIRES : c'est l'écart qui s'entend. Les deux
      // rendus d'Attic l'acceptent, puisqu'ils en tirent une fréquence ou un rapport de
      // lecture d'échantillon.
      const temperees = notes.map((n: any) => ({
        note: noteTemperee(n.note, tonique, temp),
        velocite: n.velocite ?? 90,
        debut: n.debut,
        fin: n.fin,
      }));
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const modeRendu: "FM/Oscillateurs" | "SoundFont" = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
      const { programme, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
      const buffer = await rendreSequence(temperees, modeRendu, ctx.paramNombre("Volume", 80), programme, banque);
      const nom = langueCourante() === "en" ? temp.en : temp.fr;
      const explication = langueCourante() === "en" ? temp.noteEn : temp.noteFr;
      return {
        valeurs: [buffer, [nom, tableEcarts(temp), "", explication].join("\n")],
        message: `${nom} · ${notes.length} notes`,
      };
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
      { nom: "Transposition", nomEn: "Transpose", plage: [-24, 24], pas: 1, defaut: 0, unite: " ½-ton", uniteEn: "st",
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
    // AUCUN LECTEUR ICI. L'aperçu joue la PREMIÈRE sortie audio, et celle-ci est « Référence »,
    // c'est-à-dire l'entrée rendue telle quelle : le lecteur proposait d'écouter ce qu'on venait de
    // brancher, et non le travail du nœud. Ses deux sorties sont des pairs, la référence et la piste
    // mise à sa longueur, et aucune ne représente à elle seule ce qu'il produit.
    sansApercuAudio: true,
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
    resume: "Décalage formantique par LPC, change hauteur et timbre indépendamment (conversion vocale).",
    resumeEn: "Formant shifting via LPC: change pitch and timbre independently (voice conversion).",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Hauteur", nomEn: "Pitch", plage: [-12, 12], pas: 1, defaut: 0, unite: " ½-ton", uniteEn: "st",
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
    memoire: "flux", // dst[i] = src[i] * gain
    resume: "Modulation d'amplitude (variations de volume périodiques).",
    resumeEn: "Amplitude modulation (periodic volume variations).",
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false, module: "Profondeur" },
      { nom: "Modulation fréquence", nomEn: "Rate modulation", type: "courbe", requis: false, module: "Fréquence" },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Fréquence", nomEn: "Rate", type: "curseur", plage: [0.1, 20], pas: 0.1, defaut: 5, unite: "Hz",
        doc: "Fréquence de la modulation (vibrations par seconde). Une courbe branchée sur l'entrée Modulation fréquence prend la main : le trémolo qui s'accélère ou se calme.", docEn: "Modulation rate (vibrations per second). A curve connected to the Rate modulation input takes over: the tremolo that speeds up or settles." },
      { nom: "Fréquence min", nomEn: "Rate min", modulationDe: "Fréquence", type: "curseur", plage: [0.1, 20], pas: 0.1, defaut: 1, unite: "Hz",
        doc: "Fréquence que vaut le zéro d'une courbe branchée sur l'entrée Modulation fréquence. La course se parcourt en multipliant : de 1 à 16 Hz, le milieu de la courbe vaut 4 Hz, et chaque octave dure autant.",
        docEn: "Rate that a curve's zero means on the Rate modulation input. The travel is multiplicative: from 1 to 16 Hz, the middle of the curve is 4 Hz, and every octave lasts as long." },
      { nom: "Fréquence max", nomEn: "Rate max", modulationDe: "Fréquence", type: "curseur", plage: [0.1, 20], pas: 0.1, defaut: 10, unite: "Hz",
        doc: "Fréquence que vaut le un de la courbe.", docEn: "Rate that the curve's one means." },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Intensité de la modulation (0% = aucun effet, 100% = volume coupé complètement). Une courbe branchée sur l'entrée Modulation prend la main : c'est ainsi qu'on obtient le trémolo dont la profondeur suit une suite logistique, sans qu'il faille un composant séparé pour cela.", docEn: "Modulation depth (0% = no effect, 100% = volume fully cut). A curve connected to the Modulation input takes over: that is how one gets a tremolo whose depth follows a logistic sequence, without needing a separate node for it." },
      { nom: "Modulation min", nomEn: "Modulation min", modulationDe: "Profondeur", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Profondeur que vaut le zéro d'une courbe branchée. Sans courbe, ce réglage ne sert pas.",
        docEn: "Depth that a connected curve's zero means. With no curve, this setting does nothing." },
      { nom: "Modulation max", nomEn: "Modulation max", modulationDe: "Profondeur", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Profondeur que vaut le un de la courbe.", docEn: "Depth that the curve's one means." },
      { nom: "Forme", nomEn: "Shape", type: "choix", options: ["Sinus", "Carré", "Triangle", "Sawtooth"], optionIds: ["Sinus","Carré","Triangle","Sawtooth"],
        optionsEn: ["Sine", "Square", "Triangle", "Sawtooth"], defaut: "Sinus",
        doc: "Forme de l'onde de modulation.", docEn: "LFO waveform shape.", defautEn: "Sine" },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const freq = ctx.paramNombre("Fréquence", 5);
      // Un seul chemin : sans courbe, une constante à la valeur du réglage.
      const profondeurs = valeursParametre(ctx.entree(1), a.length, ctx.paramNombre("Profondeur", 50) / 100,
        { min: ctx.paramNombre("Modulation min", 0) / 100, max: ctx.paramNombre("Modulation max", 100) / 100 });
      const forme = ctx.paramTexte("Forme", "Sinus");
      const { tremolo } = await import("../audio");
      return { valeurs: [tremolo(a, freq, profondeurs, forme, ctx.entree(2), {
        min: ctx.paramNombre("Fréquence min", 1), max: ctx.paramNombre("Fréquence max", 10),
      })] };
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
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      // Ajoutée EN DERNIER : les prises sont identifiées par leur rang, l'insérer avant l'audio
      // aurait déplacé les branchements de tous les graphes enregistrés.
      { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false, module: "Position" },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Position", nomEn: "Position", type: "curseur", plage: [-100, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Position stéréo (-100% = gauche, 0% = centre, 100% = droite). Une courbe branchée sur l'entrée Modulation prend la main : le son se déplace alors au lieu de rester posé, et c'est le trajet de la courbe qu'on entend.",
        docEn: "Stereo position (-100% = left, 0% = center, 100% = right). A curve connected to the Modulation input takes over: the sound then travels instead of sitting still, and what one hears is the curve's path." },
      { nom: "Largeur", nomEn: "Width", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Ampleur du déplacement autour de la position : 0 % laisse le son au centre, 100 % l'emmène jusqu'à la position réglée. Le son est d'abord ramené en mono ; sans effet quand la position est au centre et qu'aucune courbe n'est branchée.", docEn: "Extent of the movement around the position: 0% leaves the sound in the centre, 100% takes it all the way to the set position. The sound is first folded to mono; no effect when the position is centred and no curve is connected." },
      { nom: "Modulation min", nomEn: "Modulation min", modulationDe: "Position", type: "curseur", plage: [-100, 100], pas: 1, defaut: -100, unite: "%",
        doc: "Position que vaut le zéro d'une courbe branchée. Sans courbe, ce réglage ne sert pas.",
        docEn: "Position that a connected curve's zero means. With no curve, this setting does nothing." },
      { nom: "Modulation max", nomEn: "Modulation max", modulationDe: "Position", type: "curseur", plage: [-100, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Position que vaut le un de la courbe.", docEn: "Position that the curve's one means." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { spatialiserStereo } = await import("../audio");
      const pos = ctx.paramNombre("Position", 0) / 100;
      const larg = ctx.paramNombre("Largeur", 100) / 100;
      return { valeurs: [await spatialiserStereo(a, pos, larg, ctx.entree(1), {
        min: ctx.paramNombre("Modulation min", -100) / 100,
        max: ctx.paramNombre("Modulation max", 100) / 100,
      })] };
   },
 },
  {
    id: "auto-pan", nom: "Auto-pan", nomEn: "Auto-pan", univers: "Traitement", famille: "Effets",
    memoire: "flux", // dst[i] = src[i] * gain
    resume: "Balayage automatique gauche/droite (panoramique animé).",
    resumeEn: "Automatic left/right sweep (animated panning).",
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Modulation fréquence", nomEn: "Rate modulation", type: "courbe", requis: false, module: "Fréquence" },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Fréquence", nomEn: "Rate", type: "curseur", plage: [0.1, 20], pas: 0.1, defaut: 2, unite: "Hz",
        doc: "Vitesse du balayage (allers-retours par seconde).", docEn: "Sweep speed (round trips per second)." },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Amplitude du balayage (0% = fixe, 100% = gauche extrême à droite extrême).", docEn: "Sweep depth (0% = static, 100% = extreme left to extreme right)." },
      { nom: "Fréquence min", nomEn: "Rate min", modulationDe: "Fréquence", type: "curseur", plage: [0.1, 20], pas: 0.1, defaut: 0.5, unite: "Hz",
        doc: "Fréquence que vaut le zéro d'une courbe branchée sur l'entrée Modulation fréquence : le balancement qui s'accélère. La course se parcourt en multipliant, comme pour toute fréquence. Sans courbe, ce réglage ne sert pas.",
        docEn: "Rate that a curve's zero means on the Rate modulation input: the sway that speeds up. The travel is multiplicative, as for any frequency. With no curve, this setting does nothing." },
      { nom: "Fréquence max", nomEn: "Rate max", modulationDe: "Fréquence", type: "curseur", plage: [0.1, 20], pas: 0.1, defaut: 8, unite: "Hz",
        doc: "Fréquence que vaut le un de la courbe.", docEn: "Rate that the curve's one means." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { autoPan } = await import("../audio");
      const freq = ctx.paramNombre("Fréquence", 2);
      const depth = ctx.paramNombre("Profondeur", 80);
      return { valeurs: [await autoPan(a, freq, depth, ctx.entree(1), { min: ctx.paramNombre("Fréquence min", 0.5), max: ctx.paramNombre("Fréquence max", 8) })] };
   },
  },
  {
    id: "auto-pan-logistique", nom: "Auto-pan logistique", nomEn: "Logistic auto-pan", univers: "Traitement", famille: "Effets",
    memoire: "flux", // dst[i] = src[i] * gain
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
    memoire: "flux", // lecture decalee bornee, comme le vibrato
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
    memoire: "flux", // dst[i] = src[i] * ...
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
    memoire: "flux", // biquad, etat dans quatre scalaires
    resume: "Filtre passe-bande modulé (effet pédale wah).",
    resumeEn: "Modulated bandpass filter (wah pedal effect).",
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false },
      { nom: "Modulation fréquence", nomEn: "Rate modulation", type: "courbe", requis: false, module: "Fréquence" },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Fréquence", nomEn: "Rate", type: "curseur", plage: [0.1, 10], pas: 0.1, defaut: 2, unite: "Hz",
        doc: "Vitesse de la modulation (balayages par seconde). Sans effet quand une courbe est branchée sur l'entrée Modulation : c'est alors elle qui promène la fréquence centrale, et le rythme du balayage est le sien.",
        docEn: "Modulation speed (sweeps per second). No effect when a curve is connected to the Modulation input: it then walks the centre frequency, and the sweep's rhythm is its own." },
      { nom: "Balayage de", nomEn: "Sweep from", type: "curseur", plage: [50, 5000], pas: 10, defaut: 200, unite: "Hz",
        doc: "Le grave du balayage. Ces deux bornes étaient câblées à 200 et 2500 Hz, invisibles et irréglables ; elles valent avec ou sans courbe, puisque le wah balaie entre elles dans les deux cas.",
        docEn: "The low end of the sweep. These two bounds were hard-wired at 200 and 2500 Hz, invisible and unsettable; they hold with or without a curve, since the wah sweeps between them either way." },
      { nom: "Balayage à", nomEn: "Sweep to", type: "curseur", plage: [50, 8000], pas: 10, defaut: 2500, unite: "Hz",
        doc: "L'aigu du balayage. Une courbe branchée le parcourt en multipliant et non en ajoutant, une octave est un doublement, de sorte que le balayage ne se précipite pas dans l'aigu.",
        docEn: "The high end of the sweep. A connected curve travels it by multiplying rather than adding, an octave is a doubling, so the sweep does not rush into the treble." },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Amplitude du balayage en fréquence (0% = fixe, 100% = wah complet).", docEn: "Frequency sweep range (0% = static, 100% = full wah)." },
      { nom: "Résonance", nomEn: "Resonance", type: "curseur", plage: [0.5, 20], pas: 0.5, defaut: 5, unite: "Q",
        doc: "Résonance du filtre (Q élevé = wah prononcé, Q faible = doux).", docEn: "Filter resonance (high Q = pronounced wah, low Q = gentle)." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Mix entre signal original et effet (100% = wah seulement).", docEn: "Mix between dry and wet signal (100% = wah only)." },
      { nom: "Fréquence min", nomEn: "Rate min", modulationDe: "Fréquence", type: "curseur", plage: [0.1, 10], pas: 0.1, defaut: 0.5, unite: "Hz",
        doc: "Fréquence que vaut le zéro d'une courbe branchée sur l'entrée Modulation fréquence : la pédale qui s'emballe. La course se parcourt en multipliant, comme pour toute fréquence. Sans courbe, ce réglage ne sert pas.",
        docEn: "Rate that a curve's zero means on the Rate modulation input: the pedal that runs away. The travel is multiplicative, as for any frequency. With no curve, this setting does nothing." },
      { nom: "Fréquence max", nomEn: "Rate max", modulationDe: "Fréquence", type: "curseur", plage: [0.1, 10], pas: 0.1, defaut: 8, unite: "Hz",
        doc: "Fréquence que vaut le un de la courbe.", docEn: "Rate that the curve's one means." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { wahwah } = await import("../audio");
      return { valeurs: [wahwah(
        a, ctx.paramNombre("Fréquence", 2), ctx.paramNombre("Profondeur", 100),
        ctx.paramNombre("Résonance", 5), ctx.paramNombre("Mix", 100),
        ctx.entree(1),
        { min: ctx.paramNombre("Balayage de", 200), max: ctx.paramNombre("Balayage à", 2500) },
        ctx.entree(2), { min: ctx.paramNombre("Fréquence min", 0.5), max: ctx.paramNombre("Fréquence max", 8) },
      )] };
   },
 },
  {
    id: "phaser", nom: "Phaser", nomEn: "Phaser", univers: "Traitement", famille: "Effets",
    memoire: "flux", // passe-tout en cascade, etat par etage
    resume: "Filtres passe-tout en cascade modulés par LFO (effet planant).",
    resumeEn: "All-pass filter cascade modulated by LFO (sweeping effect).",
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Modulation fréquence", nomEn: "Rate modulation", type: "courbe", requis: false, module: "Fréquence" },
    ],
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
      { nom: "Fréquence min", nomEn: "Rate min", modulationDe: "Fréquence", type: "curseur", plage: [0.05, 10], pas: 0.05, defaut: 0.1, unite: "Hz",
        doc: "Fréquence que vaut le zéro d'une courbe branchée sur l'entrée Modulation fréquence : le tourbillon qui se resserre. La course se parcourt en multipliant, comme pour toute fréquence. Sans courbe, ce réglage ne sert pas.",
        docEn: "Rate that a curve's zero means on the Rate modulation input: the swirl that tightens. The travel is multiplicative, as for any frequency. With no curve, this setting does nothing." },
      { nom: "Fréquence max", nomEn: "Rate max", modulationDe: "Fréquence", type: "curseur", plage: [0.05, 10], pas: 0.05, defaut: 4, unite: "Hz",
        doc: "Fréquence que vaut le un de la courbe.", docEn: "Rate that the curve's one means." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { phaser } = await import("../audio");
      return { valeurs: [phaser(a, ctx.paramNombre("Fréquence", 0.5), ctx.paramNombre("Profondeur", 80), ctx.paramNombre("Étages", 4), ctx.paramNombre("Mix", 50),
        ctx.entree(1), { min: ctx.paramNombre("Fréquence min", 0.1), max: ctx.paramNombre("Fréquence max", 4) })] };
   },
 },
  {
    id: "vibrato", nom: "Vibrato", nomEn: "Vibrato", univers: "Traitement", famille: "Effets",
    memoire: "flux", // lecture decalee bornee : 0,18 s au plus (0,1 Hz, 100 %), en avant comme en arriere
    resume: "Modulation de hauteur par LFO (oscillation de la note).",
    resumeEn: "Pitch modulation by LFO (note oscillation).",
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false },
      { nom: "Modulation fréquence", nomEn: "Rate modulation", type: "courbe", requis: false, module: "Fréquence" },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Fréquence", nomEn: "Rate", type: "curseur", plage: [0.1, 20], pas: 0.1, defaut: 5, unite: "Hz",
        doc: "Vitesse de la modulation (oscillations par seconde). Une courbe branchée sur l'entrée Modulation fréquence prend la main : le vibrato qui s'accélère, comme celui d'un chanteur qui tient une note. Si l'entrée Modulation est branchée aussi, c'est elle qui l'emporte : elle dessine alors le geste entier, et il n'y a plus de LFO dont régler la vitesse.", docEn: "Modulation speed (oscillations per second). A curve connected to the Rate modulation input takes over: the vibrato that speeds up, like a singer holding a note. If the Modulation input is connected too, it wins: it then draws the whole gesture, and there is no LFO left whose speed could be set." },
      { nom: "Fréquence min", nomEn: "Rate min", modulationDe: "Fréquence", type: "curseur", plage: [0.1, 20], pas: 0.1, defaut: 1, unite: "Hz",
        doc: "Fréquence que vaut le zéro d'une courbe branchée sur l'entrée Modulation fréquence. La course se parcourt en multipliant, comme pour toute fréquence.",
        docEn: "Rate that a curve's zero means on the Rate modulation input. The travel is multiplicative, as for any frequency." },
      { nom: "Fréquence max", nomEn: "Rate max", modulationDe: "Fréquence", type: "curseur", plage: [0.1, 20], pas: 0.1, defaut: 10, unite: "Hz",
        doc: "Fréquence que vaut le un de la courbe.", docEn: "Rate that the curve's one means." },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Écart de hauteur au sommet de l'oscillation (0% = aucun, 100% = ±2 demi-tons), le même à toute vitesse : accélérer le vibrato ne l'élargit pas.", docEn: "Pitch deviation at the peak of the oscillation (0% = none, 100% = ±2 semitones), the same at any speed: speeding the vibrato up does not widen it." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { vibrato } = await import("../audio");
      return { valeurs: [vibrato(a, ctx.paramNombre("Fréquence", 5), ctx.paramNombre("Profondeur", 50), ctx.entree(1),
        ctx.entree(2), { min: ctx.paramNombre("Fréquence min", 1), max: ctx.paramNombre("Fréquence max", 10) })] };
   },
 },
  {
    id: "octaver", nom: "Octaver", nomEn: "Octaver", univers: "Traitement", famille: "Effets",
    memoire: "flux", // redresseur, etat dans trois scalaires
    resume: "Ajoute une octave supérieure et/ou inférieure.",
    resumeEn: "Adds an upper and/or lower octave.",
    notice: "Génère jusqu'à deux voix supplémentaires, d'où les deux curseurs : « Octave sup » règle le volume de la voix une octave au-dessus, « Octave inf » celui de la voix une octave en dessous. L'un des deux à 0 n'ajoute qu'une voix. « Mix » équilibre ensuite l'original et les voix ajoutées. Technique monophonique (pédale analogique) : fonctionne le mieux sur une source à note unique (voix, basse, lead).",
    noticeEn: "Generates up to two extra voices, hence the two sliders: \"Octave up\" sets the volume of the voice one octave above, \"Octave down\" the voice one octave below. Either one at 0 adds a single voice. \"Mix\" then balances the original against the added voices. Monophonic technique (analog pedal style): works best on single-note sources (voice, bass, lead).",
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false, module: "Mix" },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Octave sup", nomEn: "Octave up", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Volume de la voix ajoutée une octave au-dessus (fréquence doublée par redressement).", docEn: "Volume of the added voice one octave above (frequency doubled by rectification)." },
      { nom: "Octave inf", nomEn: "Octave down", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Volume de la voix ajoutée une octave en dessous (période doublée par inversion de polarité).", docEn: "Volume of the added voice one octave below (period doubled by polarity flipping)." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Équilibre original / voix ajoutées. 0 % = original seul, 100 % = octaves seules. Une courbe branchée sur l'entrée Modulation donne cette valeur à chaque instant, à la place du curseur.",
        docEn: "Dry / added-voices balance. 0% = dry only, 100% = octaves only. A curve connected to the Modulation input gives this value at each instant, in place of the slider." },
      { nom: "Modulation min", nomEn: "Modulation min", modulationDe: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Mélange que vaut le zéro d'une courbe branchée sur l'entrée Modulation. Sans courbe branchée, ce réglage n'agit pas.",
        docEn: "Mix that a connected curve's zero means on the Modulation input. With no curve connected, this setting has no effect." },
      { nom: "Modulation max", nomEn: "Modulation max", modulationDe: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Mélange que vaut le un de la courbe. Une valeur inférieure à Modulation min inverse le sens du parcours.",
        docEn: "Mix that the curve's one means. A value below Modulation min reverses the direction of travel." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { octaver } = await import("../audio");
      // Sans courbe branchée, on passe le NOMBRE et non un tableau constant : la boucle garde
      // exactement le chemin qu'elle avait, et sa sortie ne bouge pas d'un bit.
      const modulation = ctx.entree(1);
      const mix = estCourbe(modulation)
        ? valeursParametre(modulation, a.length, 0, {
          min: ctx.paramNombre("Modulation min", 0), max: ctx.paramNombre("Modulation max", 100),
        })
        : ctx.paramNombre("Mix", 50);
      return { valeurs: [octaver(a, ctx.paramNombre("Octave sup", 50), ctx.paramNombre("Octave inf", 50), mix)] };
   },
 },
  {
    id: "chopper", nom: "Chopper", nomEn: "Chopper", univers: "Traitement", famille: "Effets",
    memoire: "flux", // gain fonction de i seul
    resume: "Gate rythmique qui coupe le son périodiquement (effet stutter/DJ).",
    resumeEn: "Rhythmic gate that chops the sound periodically (stutter/DJ effect).",
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Modulation fréquence", nomEn: "Rate modulation", type: "courbe", requis: false, module: "Fréquence" },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Fréquence", nomEn: "Rate", type: "curseur", plage: [0.5, 20], pas: 0.5, defaut: 4, unite: "Hz",
        doc: "Vitesse de coupe (coups par seconde).", docEn: "Chop speed (cuts per second)." },
      { nom: "Durée", nomEn: "Length", type: "curseur", plage: [1, 99], pas: 1, defaut: 50, unite: "%",
        doc: "Ratio ON dans le cycle (1% = staccissimo, 50% = carré, 99% = quasi continu).", docEn: "ON ratio in cycle (1% = very short, 50% = square, 99% = near continuous)." },
      { nom: "Type", nomEn: "Type", type: "choix", options: ["Dur", "Fondu"], optionIds: ["Dur","Fondu"], optionsEn: ["Hard", "Soft"], defaut: "Dur",
        doc: "Dur = coupure nette, Fondu = transition douce.", docEn: "Hard = abrupt cut, Soft = smooth transition.", defautEn: "Hard" },
      { nom: "Fréquence min", nomEn: "Rate min", modulationDe: "Fréquence", type: "curseur", plage: [0.5, 20], pas: 0.5, defaut: 1, unite: "Hz",
        doc: "Fréquence que vaut le zéro d'une courbe branchée sur l'entrée Modulation fréquence : la coupe qui accélère jusqu'au bégaiement. La course se parcourt en multipliant, comme pour toute fréquence. Sans courbe, ce réglage ne sert pas.",
        docEn: "Rate that a curve's zero means on the Rate modulation input: the chop that accelerates into a stutter. The travel is multiplicative, as for any frequency. With no curve, this setting does nothing." },
      { nom: "Fréquence max", nomEn: "Rate max", modulationDe: "Fréquence", type: "curseur", plage: [0.5, 20], pas: 0.5, defaut: 16, unite: "Hz",
        doc: "Fréquence que vaut le un de la courbe.", docEn: "Rate that the curve's one means." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { chopper } = await import("../audio");
      const typeStr = ctx.paramTexte("Type", "Dur");
      return { valeurs: [chopper(a, ctx.paramNombre("Fréquence", 4), ctx.paramNombre("Durée", 50), typeStr === "Fondu" || typeStr === "Soft" ? 1 : 0,
        ctx.entree(1), { min: ctx.paramNombre("Fréquence min", 1), max: ctx.paramNombre("Fréquence max", 16) })] };
   },
  },
  {
    id: "chopper-logistique", nom: "Chopper logistique", nomEn: "Logistic chopper", univers: "Traitement", famille: "Effets",
    memoire: "flux", // gain fonction de i seul
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
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Modulation temps", nomEn: "Time modulation", type: "courbe", requis: false, module: "Temps" },
      { nom: "Modulation feedback", nomEn: "Feedback modulation", type: "courbe", requis: false, module: "Feedback" },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Temps", nomEn: "Time", type: "curseur", plage: [50, 2000], pas: 10, defaut: 350, unite: "ms",
        doc: "Temps de retard entre chaque répétition.", docEn: "Delay time between repetitions." },
      { nom: "Feedback", nomEn: "Feedback", type: "curseur", plage: [0, 95], pas: 1, defaut: 40, unite: "%",
        doc: "Quantité de signal réinjectée dans le délai (plus = plus de répétitions).", docEn: "Amount of signal fed back into the delay (more = more repetitions)." },
      { nom: "Répartition", nomEn: "Spread", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Largeur stéréo de l'écho (0% = mono, 100% = balayage gauche/droite maximum).", docEn: "Stereo width of the echo (0% = mono, 100% = maximum left/right sweep)." },
      { nom: "Temps min", nomEn: "Time min", modulationDe: "Temps", type: "curseur", plage: [50, 2000], pas: 10, defaut: 100, unite: "ms",
        doc: "Retard que vaut le zéro d'une courbe branchée sur l'entrée Modulation temps. Faire bouger le retard fait glisser la hauteur des répétitions, comme un écho à bande dont on touche la vitesse : c'est le son voulu. Sans courbe, ce réglage ne sert pas.",
        docEn: "Delay that a curve's zero means on the Time modulation input. Moving the delay makes the repeats glide in pitch, like a tape echo whose speed is touched: that is the intended sound. With no curve, this setting does nothing." },
      { nom: "Temps max", nomEn: "Time max", modulationDe: "Temps", type: "curseur", plage: [50, 2000], pas: 10, defaut: 800, unite: "ms",
        doc: "Retard que vaut le un de la courbe.", docEn: "Delay that the curve's one means." },
      { nom: "Feedback min", nomEn: "Feedback min", modulationDe: "Feedback", type: "curseur", plage: [0, 95], pas: 1, defaut: 0, unite: "%",
        doc: "Réinjection que vaut le zéro d'une courbe branchée sur l'entrée Modulation feedback : l'écho qui s'éteint, ou qui s'emballe. Plafonnée à 95 %, comme le réglage, pour que la boucle ne diverge jamais.",
        docEn: "Feedback that a curve's zero means on the Feedback modulation input: the echo that dies away, or that runs away. Capped at 95%, like the setting, so the loop never diverges." },
      { nom: "Feedback max", nomEn: "Feedback max", modulationDe: "Feedback", type: "curseur", plage: [0, 95], pas: 1, defaut: 80, unite: "%",
        doc: "Réinjection que vaut le un de la courbe.", docEn: "Feedback that the curve's one means." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      return { valeurs: [await appliquerEchoPingPong(a, ctx.paramNombre("Temps", 350), ctx.paramNombre("Feedback", 40), ctx.paramNombre("Répartition", 50),
      {
        temps: ctx.entree(1), bornesTemps: { min: ctx.paramNombre("Temps min", 100), max: ctx.paramNombre("Temps max", 800) },
        feedback: ctx.entree(2), bornesFeedback: { min: ctx.paramNombre("Feedback min", 0), max: ctx.paramNombre("Feedback max", 80) },
      })] };
   },
  },
  {
    id: "echo-inverse", nom: "Echo inversé", nomEn: "Reverse Echo", univers: "Traitement", famille: "Effets",
    resume: "Echo inversé : les répétitions atténuées arrivent avant le son principal.",
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
      // Le décalage de formants, seule étape qui figeait, est calculé hors du fil.
      return {
        valeurs: [await appliquerVoiceChanger(a, effet, decalerFormantsHorsFil)],
        message: `Voice Changer · ${effet}`,
      };
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
      // Graine 0 : tirée une fois ici, passée au calcul et montrée dans le message — la convention
      // du projet, sans laquelle un résultat réussi ne pouvait pas être rejoué.
      const { graine } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      const out = appliquerDecoupeAleatoire(a, parts, crossfade, mode, graine);
      return { valeurs: [out], message: `Découpe aléatoire · ${mode} · graine ${graine}` };
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
        doc: "Graine des phases initiales, sans effet hors du mode « Aléatoire ». Valeur par défaut fixe : une reconstruction qui change à chaque exécution serait un défaut.",
        docEn: "Seed for the initial phases; no effect outside the « Random » mode. The default is fixed: a reconstruction that changes on every run would be a defect." },
      { nom: "FFT", nomEn: "FFT", type: "nombre", plage: [64, 8192], pas: 64, defaut: 2048, unite: "éch.", uniteEn: "samples",
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
