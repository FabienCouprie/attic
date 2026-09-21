// plugins/ampleur.ts — Remplir la pièce sans monter le son.
//
// La logique est dans `audio/ampleur.ts`, testée ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { ampleur, correlation, efficace, tenueAttendue, tenueEnMono, type OptionsAmpleur } from "../audio/ampleur";
import { valeursParametre } from "../audio/courbe";

export const fiches: FicheAudio[] = ([
  {
    id: "ampleur", nom: "Ampleur", nomEn: "Spaciousness",
    univers: "Traitement", famille: "Effets",
    resume: "Élargit un son au lieu de le monter : des premières réflexions différentes pour chaque oreille, à sonie constante.",
    resumeEn: "Widens a sound instead of raising it: early reflections that differ for each ear, at constant loudness.",
    notice: "D'après Vesa Välimäki et ses collègues sur le bruit de velours — « A perceptual study on velvet noise and its variants at different pulse densities », IEEE Transactions on Audio, Speech and Language Processing 21(7), 2013.\n\nCe qu'aucun nœud existant ne fait. « Largeur stéréo / M-S » décode en milieu et côtés puis rehausse les côtés : sur une source mono, le côté vaut la différence des deux canaux, donc zéro, et amplifier zéro donne zéro. Le délai stéréo et le chorus manipulent de même une différence qui doit déjà exister. Aucun outil du catalogue ne sait créer cette différence quand il n'y en a pas. Et les six réverbérations ont toutes une queue, alors que remplir la pièce est le travail des premières réflexions.\n\nLes deux mécanismes sont le même. Un motif de réflexions différent pour chaque canal décorrèle et donne un corps de pièce d'un seul geste — et c'est ce qu'une vraie pièce fait, puisque vos deux oreilles ne reçoivent pas les mêmes réflexions. Les premières réflexions arrivent dans la fenêtre de précédence : l'oreille les fusionne avec le son direct plutôt que de les entendre comme des échos. Le son grossit ; rien ne se répète.\n\nUne courbe branchée sur l'entrée Modulation pilote le mélange, et la pièce se remplit ou se vide au fil du son : une rampe l'ouvre d'un bout à l'autre, un sinus la fait respirer, une courbe extraite du son lui-même l'ouvre sur les passages forts. C'est le mélange, et non les quatre autres réglages, parce qu'eux décrivent la pièce : elle est fabriquée une fois, comme une suite de réflexions tirée à la graine donnée. Les faire varier en continu demanderait de la reconstruire à chaque échantillon, et « une même graine rejoue la même pièce » n'aurait plus de sens. Le mélange, lui, est un gain sur ce qui est déjà calculé : il se module exactement. La sonie ne bouge pas davantage qu'à mélange fixe — la correction se fait sur le son entier, une fois le mélange appliqué.\n\nTrois chiffres disent si la promesse tient, et le nœud les affiche.\n\nLa sonie ne bouge pas. Chaque canal retrouve son propre niveau d'entrée : si l'énergie montait, ce ne serait pas de l'ampleur mais du gain, l'illusion la plus commune du traitement sonore.\n\nLa corrélation tombe. Un vaut deux canaux identiques, donc une source ponctuelle coincée entre les enceintes ; zéro vaut un son sans position repérable. Aux réglages par défaut, elle passe de 1,000 à 0,035.\n\nLa somme mono tient, et il faut savoir lire ce chiffre. Elle n'est pas libre : une corrélation ρ impose une tenue de racine de (1+ρ)/2. Deux canaux parfaitement décorrélés donnent donc 0,707, et la géométrie ne permet pas mieux — ce n'est pas une perte mais le prix de la largeur. Mesuré dans l'application : une corrélation de −0,06 donne 0,68, quand la formule en prédit 0,686. Le nœud affiche les deux côte à côte, parce que c'est leur écart qui signale un défaut, jamais la valeur seule : un seuil fixe à 0,707 aurait crié au creusement sur un résultat parfaitement sain.",
    noticeEn: "After Vesa Välimäki and colleagues on velvet noise — « A perceptual study on velvet noise and its variants at different pulse densities », IEEE Transactions on Audio, Speech and Language Processing 21(7), 2013.\n\nWhat no existing node does. « Stereo Width / MS » decodes into mid and side then raises the side: on a mono source the side is the difference of the two channels, hence zero, and amplifying zero gives zero. Stereo delay and chorus likewise manipulate a difference that must already exist. No tool in the catalogue can create that difference when there is none. And the six reverbs all have a tail, whereas filling the room is the work of early reflections.\n\nThe two mechanisms are one. A reflection pattern that differs for each channel decorrelates and gives room body in a single gesture — and that is what a real room does, since your two ears do not receive the same reflections. Early reflections arrive within the precedence window: the ear fuses them with the direct sound rather than hearing them as echoes. The sound grows; nothing repeats.\n\nA curve connected to the Modulation input drives the mix, and the room fills or empties along the sound: a ramp opens it from one end to the other, a sine makes it breathe, a curve extracted from the sound itself opens it on the loud passages. It is the mix, and not the four other settings, because those describe the room: it is built once, as a reflection sequence drawn from the given seed. Making them vary continuously would mean rebuilding it at every sample, and « the same seed replays the same room » would no longer mean anything. The mix, for its part, is a gain on what is already computed: it modulates exactly. Loudness moves no more than at a fixed mix — the correction is made on the whole sound, once the mix has been applied.\n\nThree figures say whether the promise holds, and the node shows them.\n\nLoudness does not move. Each channel returns to its own input level: if the energy rose it would not be spaciousness but gain, the commonest illusion in sound processing.\n\nCorrelation falls. One means two identical channels, hence a point source wedged between the speakers; zero means a sound with no locatable position. At the default settings it goes from 1.000 to 0.035.\n\nThe mono sum holds, and that figure must be read correctly. It is not free: a correlation of rho imposes a hold of the square root of (1+rho)/2. Two perfectly decorrelated channels therefore give 0.707, and geometry allows no better — not a loss but the price of width. Measured in the application: a correlation of -0.06 gives 0.68, where the formula predicts 0.686. The node shows both side by side, because it is their gap that signals a fault, never the value alone: a fixed threshold at 0.707 would have cried collapse over a perfectly healthy result.",
    entrees: [
      { nom: "Audio", type: "audio" },
      { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false },
    ],
    sorties: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Mesures", nomEn: "Measurements", type: "texte" },
    ],
    parametres: [
      { nom: "Densité", nomEn: "Density", type: "curseur", plage: [20, 400], pas: 10, defaut: 200, unite: "/s",
        doc: "Réflexions par seconde. C'est la rareté du bruit de velours qui lui permet de décorréler sans colorer : un bruit dense s'entendrait comme un souffle, un peigne régulier comme un timbre. Mesuré, à 20 réflexions par seconde la corrélation ne bouge presque pas ; à 200 elle tombe à presque rien.",
        docEn: "Reflections per second. It is the sparseness of velvet noise that lets it decorrelate without colouring: dense noise would be heard as hiss, a regular comb as a timbre. Measured, at 20 reflections per second the correlation barely moves; at 200 it falls to almost nothing." },
      { nom: "Fenêtre", nomEn: "Window", type: "curseur", plage: [5, 120], pas: 5, defaut: 80, unite: "ms",
        doc: "Durée pendant laquelle les réflexions arrivent. En deçà d'une quarantaine de millisecondes, l'oreille les fusionne franchement avec le son direct ; au-delà de cent, elles commencent à s'entendre comme des échos séparés. Quatre-vingts est le point où la décorrélation est franche sans que rien ne se détache.",
        docEn: "How long the reflections keep arriving. Below some forty milliseconds the ear firmly fuses them with the direct sound; beyond a hundred they start to be heard as separate echoes. Eighty is where decorrelation is clear without anything standing out." },
      { nom: "Pré-délai", nomEn: "Pre-delay", type: "curseur", plage: [0, 60], pas: 1, defaut: 12, unite: "ms",
        doc: "Silence avant la première réflexion. C'est l'indice de la taille de la pièce : le son met ce temps-là à atteindre le premier mur et à revenir. Trois millisecondes donnent une cabine, quarante une salle.",
        docEn: "Silence before the first reflection. This is the cue to the room's size: the sound takes that long to reach the first wall and return. Three milliseconds give a booth, forty a hall." },
      { nom: "Absorption", nomEn: "Absorption", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Amortissement des réflexions tardives. À zéro, elles gardent toutes la même force — une pièce aux murs nus. Au maximum, elles s'éteignent vite : des rideaux, des livres, des gens.",
        docEn: "Damping of the later reflections. At zero they all keep the same strength — a room with bare walls. At maximum they die away fast: curtains, books, people." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Proportion de réflexions ajoutée. À 0 %, la sortie est l'entrée, inchangée. La sonie ne change à aucun réglage : seule la largeur bouge. Une courbe branchée sur l'entrée Modulation prend la place de ce réglage, qui ne sert alors plus à rien.",
        docEn: "Proportion of reflections added. At 0 %, the output is the input, unchanged. Loudness does not change at any setting: only the width moves. A curve connected to the Modulation input takes this setting's place, which then serves no purpose." },
      { nom: "Modulation min", nomEn: "Modulation min", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Mélange que vaut le zéro d'une courbe branchée. À zéro, la pièce disparaît complètement quand la courbe descend ; à vingt, il en reste toujours un fond. Sans courbe, ce réglage ne sert pas.",
        docEn: "Mix that a connected curve's zero means. At zero the room vanishes entirely when the curve falls; at twenty, some of it always remains. With no curve, this setting does nothing." },
      { nom: "Modulation max", nomEn: "Modulation max", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Mélange que vaut le un de la courbe. Une rampe de zéro à cent pour cent ouvre la pièce d'un bout à l'autre du son ; un sinus la fait respirer.",
        docEn: "Mix that the curve's one means. A ramp from zero to a hundred per cent opens the room from one end of the sound to the other; a sine makes it breathe." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 7,
        doc: "Graine des deux motifs de réflexions. Une même graine rejoue la même pièce. Changer de graine change la pièce sans changer ses dimensions.",
        docEn: "Seed for the two reflection patterns. The same seed replays the same room. Changing the seed changes the room without changing its dimensions." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const e = ctx.entree(0);
      if (!(e instanceof AudioBuffer)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };

      const melange = ctx.paramNombre("Mix", 100) / 100;
      const gauche = e.getChannelData(0);
      const droite = e.numberOfChannels > 1 ? e.getChannelData(1) : gauche;
      const o: OptionsAmpleur = {
        densite: ctx.paramNombre("Densité", 200),
        fenetreSec: ctx.paramNombre("Fenêtre", 80) / 1000,
        preDelaiSec: ctx.paramNombre("Pré-délai", 12) / 1000,
        absorption: ctx.paramNombre("Absorption", 50) / 100,
        melange: melange,
        // Une courbe branchée pilote le mélange échantillon par échantillon ; sans elle,
        // `valeursParametre` rend une constante à la valeur du réglage — un seul chemin.
        melangeCourbe: valeursParametre(ctx.entree(1), e.length, melange, {
          min: ctx.paramNombre("Modulation min", 0) / 100,
          max: ctx.paramNombre("Modulation max", 100) / 100,
        }),
        graine: Math.round(ctx.paramNombre("Graine", 7)),
        frequence: e.sampleRate,
      };
      const [g, d] = ampleur(gauche, droite, o);
      const out = new AudioBuffer({ numberOfChannels: 2, length: e.length, sampleRate: e.sampleRate });
      out.getChannelData(0).set(g);
      out.getChannelData(1).set(d);

      const correlAvant = correlation(gauche, droite);
      const correlApres = correlation(g, d);
      const monoApres = tenueEnMono(g, d);
      const sonie = efficace(gauche) > 0 ? efficace(g) / efficace(gauche) : 1;
      const lignes = [
        `${en ? "Loudness" : "Sonie"} : ×${sonie.toFixed(3)}   ${en ? "(1.000 = unchanged)" : "(1,000 = inchangée)"}`,
        `${en ? "Correlation" : "Corrélation"} : ${correlAvant.toFixed(3)} → ${correlApres.toFixed(3)}`,
        `${en ? "Mono sum" : "Somme mono"} : ${monoApres.toFixed(3)}   `
          + `${en ? "expected" : "attendu"} ${tenueAttendue(correlApres).toFixed(3)}`,
        "",
        monoApres >= tenueAttendue(correlApres) - 0.03
          ? (en
            ? "Exactly what the correlation imposes — the width is paid for, the centre is not hollowed."
            : "Exactement ce que la corrélation impose — la largeur est payée, le centre n'est pas creusé.")
          : (en
            ? "Below what the correlation imposes: something is cancelling. Lower the mix or the density."
            : "Sous ce que la corrélation impose : quelque chose s'annule. Baissez le mélange ou la densité."),
      ];
      return {
        valeurs: [out, lignes.join("\n")],
        message: traduire("msg.ampleur.resume",
          correlAvant.toFixed(2), correlApres.toFixed(2), monoApres.toFixed(2), sonie.toFixed(3)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
