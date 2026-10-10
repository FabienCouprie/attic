// plugins/effets-temporel.ts — Effets a base de filtre balaye, de decoupe et d'echo.
//
// Les fiches sont rangees par nature du traitement, et non par famille : les quarante-trois
// effets declarent la meme, « Effets », ce qui ne decoupe rien. Les fabriques partagees vivent
// dans `effets-aides.ts`.


import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { estCourbe, valeursParametre } from "../audio/courbe";
import { creerAleatoire, hasardDuNoeud } from "../core";
import { appliquerEchoPingPong, appliquerEchoInverse, appliquerVoiceChanger, appliquerDecoupeAleatoire, griffinLim, picAbsolu } from "../audio";
import { decalerFormantsHorsFil } from "./formants-hors-fil";

import { MODULATION_MIX, MODULATION_MIX_NOMMEE, bornesModulation, effet, reglageModule, portModulation } from "./effets-aides";

export const fiches: FicheAudio[] = ([
  {
    id: "wahwah", nom: "Wah-wah", nomEn: "Wah-wah", univers: "Traitement", famille: "Effets",
    memoire: "flux", // biquad, etat dans quatre scalaires
    resume: "Filtre passe-bande modulé (effet pédale wah).",
    resumeEn: "Modulated bandpass filter (wah pedal effect).",
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false },
      { nom: "Modulation fréquence", nomEn: "Rate modulation", type: "courbe", requis: false, module: "Fréquence" },
      // SOUS UN NOM À ELLE : l'entrée « Modulation » de ce composant promène la fréquence centrale
      // au lieu de doser le mélange, et deux ports du même nom ne se distinguent pas à l'écran.
      portModulation("Mix", "Mix", { court: false }),
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
      ...bornesModulation(MODULATION_MIX_NOMMEE),
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { wahwah } = await import("../audio");
      return { valeurs: [wahwah(
        a, ctx.paramNombre("Fréquence", 2), ctx.paramNombre("Profondeur", 100),
        ctx.paramNombre("Résonance", 5),
        reglageModule(ctx, a.length, 3, { reglage: "Mix", defaut: 100, rendu: "pourCent", noms: ["Mix min", "Mix max"] }),
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
      // SOUS UN NOM À ELLE : la fiche a déjà un port de courbe, et « Modulation » tout court se
      // lirait comme la modulation principale du composant alors qu'elle ne dose que le mélange.
      portModulation("Mix", "Mix", { court: false }),
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
      ...bornesModulation(MODULATION_MIX_NOMMEE),
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { phaser } = await import("../audio");
      return { valeurs: [phaser(a, ctx.paramNombre("Fréquence", 0.5), ctx.paramNombre("Profondeur", 80), ctx.paramNombre("Étages", 4),
        reglageModule(ctx, a.length, 2, { reglage: "Mix", defaut: 50, rendu: "pourCent", noms: ["Mix min", "Mix max"] }),
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
      // EN DERNIER RANG : les entrées se branchent par leur numéro, et l'intercaler renverrait
      // ailleurs les câbles des graphes enregistrés. Sous un nom à elle, aussi : l'entrée
      // « Modulation » de ce composant remplace l'oscillateur au lieu d'en régler la profondeur.
      { nom: "Modulation profondeur", nomEn: "Depth modulation", type: "courbe", requis: false, module: "Profondeur" },
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
        doc: "Écart de hauteur au sommet de l'oscillation (0% = aucun, 100% = ±2 demi-tons), le même à toute vitesse : accélérer le vibrato ne l'élargit pas. Une courbe branchée sur l'entrée Modulation profondeur prend la main : le vibrato qui s'ouvre sur une note tenue. L'entrée Modulation, elle, remplace l'oscillateur et laisse alors la profondeur sans objet.", docEn: "Pitch deviation at the peak of the oscillation (0% = none, 100% = ±2 semitones), the same at any speed: speeding the vibrato up does not widen it. A curve connected to the Depth modulation input takes over: the vibrato that opens up on a held note. The Modulation input replaces the oscillator instead, and leaves depth without purpose." },
      { nom: "Modulation min", nomEn: "Modulation min", modulationDe: "Profondeur", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Écart que vaut le zéro d'une courbe branchée sur l'entrée Modulation profondeur. Sans courbe, ce réglage ne sert pas.",
        docEn: "Deviation that a connected curve's zero means on the Depth modulation input. With no curve, this setting does nothing." },
      { nom: "Modulation max", nomEn: "Modulation max", modulationDe: "Profondeur", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Écart que vaut le un de la courbe.", docEn: "Deviation that the curve's one means." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { vibrato } = await import("../audio");
      // Un seul chemin : sans courbe, un tableau plat à la valeur du réglage.
      const profondeur = valeursParametre(ctx.entree(3), a.length, ctx.paramNombre("Profondeur", 50), {
        min: ctx.paramNombre("Modulation min", 0), max: ctx.paramNombre("Modulation max", 100),
      });
      return { valeurs: [vibrato(a, ctx.paramNombre("Fréquence", 5), profondeur, ctx.entree(1),
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
      // EN DERNIER RANG, ET NON À CÔTÉ DE SON RÉGLAGE : les entrées se branchent par leur numéro, et
      // l'intercaler renverrait l'entrée fréquence d'un graphe enregistré vers la profondeur.
      { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false, module: "Profondeur" },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Fréquence", nomEn: "Rate", type: "curseur", plage: [0.5, 20], pas: 0.5, defaut: 4, unite: "Hz",
        doc: "Vitesse de coupe (coups par seconde).", docEn: "Chop speed (cuts per second)." },
      { nom: "Durée", nomEn: "Length", type: "curseur", plage: [1, 99], pas: 1, defaut: 50, unite: "%",
        doc: "Ratio ON dans le cycle (1% = staccissimo, 50% = carré, 99% = quasi continu).", docEn: "ON ratio in cycle (1% = very short, 50% = square, 99% = near continuous)." },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Part du signal que la coupe emporte (0% = aucun effet, 100% = silence complet entre les coups). Une courbe branchée sur l'entrée Modulation prend la main : la coupe qui s'installe au fil du morceau.", docEn: "Share of the signal the chop removes (0% = no effect, 100% = full silence between cuts). A curve connected to the Modulation input takes over: the chop that settles in as the piece goes on." },
      { nom: "Modulation min", nomEn: "Modulation min", modulationDe: "Profondeur", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Profondeur que vaut le zéro d'une courbe branchée sur l'entrée Modulation. Sans courbe, ce réglage ne sert pas.",
        docEn: "Depth that a connected curve's zero means on the Modulation input. With no curve, this setting does nothing." },
      { nom: "Modulation max", nomEn: "Modulation max", modulationDe: "Profondeur", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Profondeur que vaut le un de la courbe.", docEn: "Depth that the curve's one means." },
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
      // Un seul chemin : sans courbe, un tableau plat à la valeur du réglage.
      const profondeur = valeursParametre(ctx.entree(2), a.length, ctx.paramNombre("Profondeur", 100), {
        min: ctx.paramNombre("Modulation min", 0), max: ctx.paramNombre("Modulation max", 100),
      });
      return { valeurs: [chopper(a, ctx.paramNombre("Fréquence", 4), ctx.paramNombre("Durée", 50), typeStr === "Fondu" || typeStr === "Soft" ? 1 : 0,
        ctx.entree(1), { min: ctx.paramNombre("Fréquence min", 1), max: ctx.paramNombre("Fréquence max", 16) }, profondeur)] };
   },
  },
  {
    id: "beat-repeat", nom: "Beat Repeat / Stutter", nomEn: "Beat Repeat / Stutter", univers: "Traitement", famille: "Effets",
    resume: "Capture et répète un court segment à intervalles rythmiques (effet stutter).",
    resumeEn: "Captures and repeats a short segment at rhythmic intervals (stutter effect).",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }, portModulation("Mix")],
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
        doc: "Équilibre signal original / effet.",
        docEn: "Dry/wet balance." },
      ...bornesModulation(MODULATION_MIX),
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
      const mix = reglageModule(ctx, a.length, 1, { reglage: "Mix", rendu: "pourCent" });
      return { valeurs: [beatRepeat(a, ctx.paramNombre("Tempo", 120), parseDiv(intervalStr), parseDiv(sizeStr), ctx.paramNombre("Répétitions", 4), ctx.paramNombre("Feedback", 40), mix)], message: traduire("msg.beat_repeat", (a.duration ?? 0).toFixed(1)) };
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
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 0,
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
      { nom: "Graine", graine: true, nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 42,
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
