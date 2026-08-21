// plugins/gendyn.ts — Nœud « GENDYN (Xenakis) » : la forme d'onde elle-même est
// une marche aléatoire bornée. Voir audio/gendyn.ts pour le principe.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "gendyn-xenakis", nom: "GENDYN (Xenakis)", nomEn: "GENDYN (Xenakis)",
    // Générateur sans entrée : sa place est parmi les sources.
    univers: "Entrées", famille: "Génération",
    resume: "Synthèse stochastique : la forme d'onde est une marche aléatoire bornée.",
    resumeEn: "Stochastic synthesis: the waveform itself is a bounded random walk.",
    notice: "D'après la synthèse stochastique dynamique d'Iannis Xenakis (GENDY3, 1991). Xenakis prend le problème par l'autre bout : plutôt que de partir d'un modèle acoustique — des partiels, un filtre, une enveloppe — il s'attaque directement à la forme d'onde, considérée comme une ligne brisée reliant quelques points, et laisse ces points SE DÉPLACER. À chaque période, l'abscisse et l'ordonnée de chaque sommet font un pas aléatoire. Il n'y a donc ici ni hauteur, ni timbre, ni enveloppe au sens habituel : ces notions ne sont plus des paramètres mais des conséquences. La hauteur émerge de la somme des durées de segments, le timbre de la forme du polygone, et tous deux dérivent d'eux-mêmes puisque les points ne cessent de bouger. On ne règle pas le son, on règle la LOI qui le fait évoluer. Tout tient à des barrières réfléchissantes : sans elles, une marche aléatoire finit toujours par s'échapper — les amplitudes saturent, les durées deviennent absurdes, le son meurt. Réfléchies, les valeurs restent bornées à jamais tout en continuant de se promener. Mettez les deux pas à zéro et le polygone se fige : vous obtenez une forme d'onde périodique, point de départ utile pour entendre ce que la marche apporte.",
    noticeEn: "After Iannis Xenakis's dynamic stochastic synthesis (GENDY3, 1991). Xenakis attacks the problem from the other end: rather than starting from an acoustic model — partials, a filter, an envelope — he works directly on the waveform, seen as a polygon joining a few points, and lets those points MOVE. At each period, every vertex takes a random step in both time and amplitude. There is therefore no pitch, timbre or envelope here in the usual sense: those are no longer parameters but consequences. Pitch emerges from the sum of the segment durations, timbre from the shape of the polygon, and both drift by themselves since the points never stop moving. You do not set the sound, you set the LAW that makes it evolve. Everything rests on reflecting barriers: without them a random walk always escapes — amplitudes clip, durations turn absurd, the sound dies. Reflected, values stay bounded forever while still wandering. Set both step sizes to zero and the polygon freezes into a periodic waveform, a useful starting point for hearing what the walk contributes.",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [0.5, 120], pas: 0.5, defaut: 10, unite: "s",
        doc: "Durée du son produit.", docEn: "Length of the produced sound." },
      { nom: "Points", nomEn: "Points", type: "nombre", plage: [2, 40], pas: 1, defaut: 8,
        doc: "Nombre de sommets de la ligne brisée. Peu de points = son simple, proche d'une onde élémentaire ; beaucoup = timbre riche et instable.",
        docEn: "Number of vertices in the polygon. Few points = simple sound, close to a basic waveform; many = rich, unstable timbre." },
      { nom: "Segment min", nomEn: "Min segment", type: "nombre", plage: [0.05, 20], pas: 0.05, defaut: 0.5, unite: "ms",
        doc: "Durée minimale d'un segment : borne AIGUË de la dérive. Plus elle est courte, plus le son peut monter.",
        docEn: "Minimum segment duration: the HIGH bound of the drift. The shorter it is, the higher the sound can go." },
      { nom: "Segment max", nomEn: "Max segment", type: "nombre", plage: [0.1, 50], pas: 0.1, defaut: 4, unite: "ms",
        doc: "Durée maximale d'un segment : borne GRAVE. L'écart entre les deux bornes détermine l'ampleur de la dérive de hauteur.",
        docEn: "Maximum segment duration: the LOW bound. The gap between the two bounds sets how far the pitch can wander." },
      { nom: "Pas temps", nomEn: "Time step", type: "curseur", plage: [0, 100], pas: 1, defaut: 10, unite: "%",
        doc: "Vivacité de la marche sur les durées, donc sur la hauteur. À 0 %, la hauteur ne bouge plus.",
        docEn: "Liveliness of the walk on durations, hence on pitch. At 0% the pitch stops moving." },
      { nom: "Pas amplitude", nomEn: "Amplitude step", type: "curseur", plage: [0, 100], pas: 1, defaut: 10, unite: "%",
        doc: "Vivacité de la marche sur les ordonnées, donc sur le timbre. Les deux pas à 0 % figent complètement la forme d'onde.",
        docEn: "Liveliness of the walk on amplitudes, hence on timbre. Both steps at 0% freeze the waveform entirely." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [1, 9999], pas: 1, defaut: 1,
        doc: "Graine du tirage. Même graine, même son — indispensable pour retrouver un résultat qui vous a plu.",
        docEn: "Random seed. Same seed, same sound — essential to recover a result you liked." },
    ],
    async executer(ctx: any) {
      const { gendyn } = await import("../audio/gendyn");
      const points = ctx.paramNombre("Points", 8);
      const dureeMinMs = ctx.paramNombre("Segment min", 0.5);
      const dureeMaxMs = ctx.paramNombre("Segment max", 4);
      const out = gendyn({
        dureeSec: ctx.paramNombre("Durée", 10),
        sampleRate: ctx.runtime?.sampleRate ?? 44100,
        points, dureeMinMs, dureeMaxMs,
        pasTemps: ctx.paramNombre("Pas temps", 10) / 100,
        pasAmplitude: ctx.paramNombre("Pas amplitude", 10) / 100,
        graine: ctx.paramNombre("Graine", 1),
      });
      // La hauteur n'étant pas un paramètre mais une conséquence, on donne la
      // plage qu'elle peut atteindre : une période vaut `points` segments.
      const hz = (ms: number) => Math.round(1000 / (ms * points));
      return {
        valeurs: [out],
        message: traduire("msg.gendyn_var_0_var_1_var_2", points, hz(dureeMaxMs), hz(dureeMinMs)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
