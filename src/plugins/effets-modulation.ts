// plugins/effets-modulation.ts — Modulations lentes : tremolo, panoramique, vibrato.
//
// Les fiches sont rangees par nature du traitement, et non par famille : les quarante-trois
// effets declarent la meme, « Effets », ce qui ne decoupe rien. Les fabriques partagees vivent
// dans `effets-aides.ts`.


import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { valeursParametre } from "../audio/courbe";

import { effet } from "./effets-aides";

export const fiches: FicheAudio[] = ([
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
      // EN DERNIER RANG, ET NON À CÔTÉ DE SON RÉGLAGE : les entrées se branchent par leur numéro, et
      // l'intercaler renverrait l'entrée fréquence d'un graphe enregistré vers la profondeur.
      { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false, module: "Profondeur" },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Fréquence", nomEn: "Rate", type: "curseur", plage: [0.1, 20], pas: 0.1, defaut: 2, unite: "Hz",
        doc: "Vitesse du balayage (allers-retours par seconde).", docEn: "Sweep speed (round trips per second)." },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Amplitude du balayage (0% = fixe, 100% = gauche extrême à droite extrême). Une courbe branchée sur l'entrée Modulation prend la main : le balancement qui s'ouvre au fil du morceau.", docEn: "Sweep depth (0% = static, 100% = extreme left to extreme right). A curve connected to the Modulation input takes over: the sway that opens up as the piece goes on." },
      { nom: "Modulation min", nomEn: "Modulation min", modulationDe: "Profondeur", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Amplitude que vaut le zéro d'une courbe branchée sur l'entrée Modulation. Sans courbe, ce réglage ne sert pas.",
        docEn: "Depth that a connected curve's zero means on the Modulation input. With no curve, this setting does nothing." },
      { nom: "Modulation max", nomEn: "Modulation max", modulationDe: "Profondeur", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Amplitude que vaut le un de la courbe.", docEn: "Depth that the curve's one means." },
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
      // Un seul chemin : sans courbe, un tableau plat à la valeur du réglage.
      const depth = valeursParametre(ctx.entree(2), a.length, ctx.paramNombre("Profondeur", 80), {
        min: ctx.paramNombre("Modulation min", 0), max: ctx.paramNombre("Modulation max", 100),
      });
      return { valeurs: [await autoPan(a, freq, depth, ctx.entree(1), { min: ctx.paramNombre("Fréquence min", 0.5), max: ctx.paramNombre("Fréquence max", 8) })] };
   },
  },
] as FicheAudio[]).map(avecDoc);
