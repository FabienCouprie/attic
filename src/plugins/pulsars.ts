// plugins/pulsars.ts — Nœud « Synthèse par pulsars » : fondamentale et formant
// réglés indépendamment. Voir audio/pulsars.ts pour le principe.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "pulsars-roads", nom: "Synthèse par pulsars", nomEn: "Pulsar Synthesis",
    // Générateur sans entrée : sa place est parmi les sources.
    univers: "Entrées", famille: "Génération",
    resume: "Fondamentale et formant réglés séparément, par brèves impulsions répétées.",
    resumeEn: "Fundamental and formant set independently, from short repeated bursts.",
    notice: "D'après la synthèse par pulsars de Curtis Roads (« Microsound », 2001). Un pulsar est une brève forme d'onde — le pulsaret — suivie de silence, le tout répété. Deux durées le décrivent, et c'est là tout son intérêt : la PÉRIODE de répétition, dont l'inverse donne la fondamentale entendue, et la DURÉE DU PULSARET, dont l'inverse donne la position du formant, c'est-à-dire la région du spectre où l'énergie se concentre. Ces deux grandeurs sont indépendantes : vous pouvez descendre la note d'une octave sans déplacer le formant, ou déplacer le formant sans changer la note. Aucun instrument acoustique ne le permet, et une granulation classique non plus, sa grille temporelle et le contenu de ses grains restant liés. Le silence entre pulsars n'est pas un détail : c'est lui qui rend ce découplage possible. Quand la durée du pulsaret atteint la période — c'est-à-dire quand le formant descend jusqu'à la fondamentale — les pulsars se touchent et le procédé se dissout en une forme d'onde continue ; le nœud plafonne là, ce qui est une contrainte du modèle et non une limite de l'implémentation.",
    noticeEn: "After Curtis Roads's pulsar synthesis (\"Microsound\", 2001). A pulsar is a brief waveform — the pulsaret — followed by silence, the whole thing repeated. Two durations describe it, and therein lies its interest: the repetition PERIOD, whose inverse gives the fundamental you hear, and the PULSARET DURATION, whose inverse gives the formant position, that is, the region of the spectrum where energy concentrates. The two are independent: you can drop the note an octave without moving the formant, or move the formant without changing the note. No acoustic instrument allows this, and neither does classic granulation, whose time grid and grain content stay tied together. The silence between pulsars is not incidental: it is what makes the decoupling possible. When the pulsaret duration reaches the period — that is, when the formant drops to the fundamental — pulsars touch and the process dissolves into a continuous waveform; the node caps there, which is a constraint of the model rather than a limitation of the implementation.",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Fondamentale", nomEn: "Fundamental", type: "nombre", plage: [20, 2000], pas: 1, defaut: 110, unite: "Hz",
        doc: "Nombre de pulsars par seconde, donc la note entendue. Elle se règle sans toucher au formant.",
        docEn: "Number of pulsars per second, hence the note you hear. It is set without touching the formant." },
      { nom: "Formant", nomEn: "Formant", type: "nombre", plage: [50, 8000], pas: 10, defaut: 1100, unite: "Hz",
        doc: "Région du spectre où l'énergie se concentre, égale à l'inverse de la durée du pulsaret. Elle se règle sans toucher à la note. Descendue jusqu'à la fondamentale, elle sature : les pulsars se touchent et le son redevient continu.",
        docEn: "Region of the spectrum where energy concentrates, equal to the inverse of the pulsaret duration. It is set without touching the note. Brought down to the fundamental it saturates: pulsars touch and the sound becomes continuous again." },
      { nom: "Forme", nomEn: "Shape", type: "choix",
        options: ["Sinus", "Carré", "Dents de scie"], optionsEn: ["Sine", "Square", "Sawtooth"],
        optionIds: ["sinus", "carre", "dents-de-scie"],
        defaut: "sinus", defautEn: "sinus",
        doc: "Forme d'onde du pulsaret. Le sinus donne un formant net ; le carré et les dents de scie en ajoutent des répliques plus aiguës.",
        docEn: "Waveform of the pulsaret. Sine gives a clean formant; square and sawtooth add higher replicas of it." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [0.2, 120], pas: 0.1, defaut: 5, unite: "s",
        doc: "Durée du son produit.", docEn: "Length of the produced sound." },
      { nom: "Amplitude", nomEn: "Amplitude", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Niveau de sortie.", docEn: "Output level." },
    ],
    async executer(ctx: any) {
      const { pulsars, cycleDeService } = await import("../audio/pulsars");
      const fondamentaleHz = ctx.paramNombre("Fondamentale", 110);
      const formantHz = ctx.paramNombre("Formant", 1100);
      const out = pulsars({
        dureeSec: ctx.paramNombre("Durée", 5),
        sampleRate: ctx.runtime?.sampleRate ?? 44100,
        fondamentaleHz, formantHz,
        forme: ctx.paramTexte("Forme", "sinus") as any,
        amplitude: ctx.paramNombre("Amplitude", 80) / 100,
      });
      // Le cycle de service dit d'un coup d'œil si l'on est encore dans le
      // régime « pulsars » ou déjà revenu à une onde continue.
      const cycle = Math.round(cycleDeService(fondamentaleHz, formantHz) * 100);
      return {
        valeurs: [out],
        message: traduire("msg.pulsars_var_0_var_1_var_2", fondamentaleHz, formantHz, cycle),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
