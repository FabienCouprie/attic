// plugins/finitions.ts — Les quatre dernières pièces manquantes : deux réverbérations que le
// câblage ne sait pas faire, et deux gestes de montage que tout le monde fait tous les jours.
//
// La logique est dans `audio/reverbes-etendues.ts`, `audio/silences.ts` et `audio/effets-montage.ts`,
// testées ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { reverberationHachee, shimmer, transposerAvecDuree } from "../audio/reverbes-etendues";
import { appliquerRognage, planRognage } from "../audio/silences";
import { fusionnerStereo } from "../audio/effets-montage";

const voie = (b: AudioBuffer, c: number) => b.getChannelData(Math.min(c, b.numberOfChannels - 1));

export const fiches: FicheAudio[] = ([
  {
    id: "reverbe-hachee", nom: "Réverbération hachée", nomEn: "Gated Reverb",
    univers: "Traitement", famille: "Effets",
    resume: "Une queue de réverbération coupée net par une porte commandée par le son sec.",
    resumeEn: "A reverb tail cut dead by a gate driven by the dry sound.",
    notice: "Le son de batterie des années quatre-vingt, et il ne s'obtient pas en posant une porte derrière une réverbération. Une porte ordinaire écoute ce qu'elle traite : placée après la queue, elle se ferme quand la queue passe sous son seuil, c'est-à-dire tard et progressivement. On entend une extinction, là où l'on voulait un couperet.\n\nIci la porte est commandée par le son sec. Elle s'ouvre à l'attaque, tient un temps fixe, puis coupe net — et c'est ce silence brutal qui fait l'effet. Tant que le sec repasse au-dessus du seuil, le compte à rebours repart : une roulade tient donc la porte ouverte, et le couperet tombe après la dernière frappe. Le catalogue a bien un nœud qui écoute un autre signal, le ducking, mais il baisse le son au lieu de le tenir ouvert : l'inverse exact de ce qu'il faut.\n\nLe nœud dit la traînée — ce que la réverbération ajoute après la fin du son sec — avant et après hachage. Trois mesures ont été essayées avant elle. L'énergie après fermeture rapportée à celle d'avant parlait de la queue non hachée, et aurait été la même sans porte. La part d'énergie jetée est juste mais muette : mesurée à onze pour cent, elle sous-entend un effet discret, alors que la queue passe en réalité de plus d'une seconde à quatre dixièmes. Une queue s'entend longtemps après qu'elle ne pèse plus rien.\n\nDonnez-lui une batterie, ou n'importe quoi de percussif : l'effet suppose des attaques nettes, puisque c'est sur elles que la porte se règle.",
    noticeEn: "The drum sound of the eighties, and it is not obtained by putting a gate after a reverb. An ordinary gate listens to what it processes: placed after the tail, it closes when the tail falls below its threshold, that is, late and gradually. One hears a decay where a cleaver was wanted.\n\nHere the gate is driven by the dry sound. It opens at the attack, holds for a fixed time, then cuts dead — and that brutal silence is the effect. As long as the dry signal comes back above the threshold the countdown restarts: a roll therefore holds the gate open, and the cleaver falls after the last hit. The catalogue does have a node that listens to another signal, ducking, but it lowers the sound instead of holding it open: the exact opposite of what is needed.\n\nThe node reports the trail — what the reverb adds after the dry sound ends — before and after gating. Three measures were tried. The energy after closing relative to before spoke of the ungated tail, and would have been the same without a gate. The share of energy discarded is correct but mute: measured at eleven per cent, it suggests a discreet effect, whereas the tail in fact goes from more than a second to four tenths. A tail is heard long after it weighs nothing.\n\nFeed it drums, or anything percussive: the effect assumes clear attacks, since it is on them that the gate is set.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Décroissance", nomEn: "Decay", type: "curseur", plage: [0.2, 4], pas: 0.1, defaut: 1.5, unite: "s",
        doc: "Longueur de la queue avant hachage. Elle décide de la densité et de la couleur de ce qu'on entend pendant le maintien, non de la durée finale — c'est le maintien qui la fixe.",
        docEn: "Length of the tail before gating. It decides the density and colour of what is heard during the hold, not the final length — the hold sets that." },
      { nom: "Maintien", nomEn: "Hold", type: "curseur", plage: [0.02, 1], pas: 0.01, defaut: 0.2, unite: "s",
        doc: "Temps pendant lequel la porte reste ouverte après la dernière attaque. C'est lui qui fixe la longueur de la queue entendue : deux dixièmes de seconde donnent la caisse claire de 1985.",
        docEn: "How long the gate stays open after the last attack. It sets the length of the tail heard: two tenths of a second give the 1985 snare." },
      { nom: "Chute", nomEn: "Release", type: "curseur", plage: [0.002, 0.3], pas: 0.002, defaut: 0.01, unite: "s",
        doc: "Temps de fermeture. Court, c'est le couperet ; au-delà d'une centaine de millisecondes, on entend un fondu et l'effet disparaît.",
        docEn: "Closing time. Short, it is the cleaver; beyond a hundred milliseconds or so one hears a fade and the effect vanishes." },
      { nom: "Seuil", nomEn: "Threshold", type: "curseur", plage: [-60, -10], pas: 1, defaut: -40, unite: "dB",
        doc: "Niveau du son sec à partir duquel la porte s'ouvre. Trop bas, elle reste ouverte sur le souffle ; trop haut, les frappes douces ne déclenchent plus rien.",
        docEn: "Dry level above which the gate opens. Too low and it stays open on hiss; too high and soft hits no longer trigger anything." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 60, unite: "%",
        doc: "Proportion de réverbération ajoutée. À 0 %, la sortie est l'entrée.",
        docEn: "Proportion of reverb added. At 0 %, the output is the input." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [1, 999999], pas: 1, defaut: 1,
        doc: "Graine de la réponse de la salle. Une même graine rejoue la même pièce.",
        docEn: "Seed of the room's response. The same seed replays the same room." },
    ],
    async executer(ctx: any) {
      const e = ctx.entree(0);
      if (!(e instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const o = {
        decroissanceSec: ctx.paramNombre("Décroissance", 1.5),
        maintienSec: ctx.paramNombre("Maintien", 0.2),
        chuteSec: ctx.paramNombre("Chute", 0.01),
        seuilDb: ctx.paramNombre("Seuil", -40),
        melange: ctx.paramNombre("Mix", 60) / 100,
        graine: Math.round(ctx.paramNombre("Graine", 1)),
        frequence: e.sampleRate,
      };
      const out = new AudioBuffer({ numberOfChannels: e.numberOfChannels, length: e.length, sampleRate: e.sampleRate });
      let premier = null as null | ReturnType<typeof reverberationHachee>;
      for (let c = 0; c < e.numberOfChannels; c++) {
        const r = reverberationHachee(e.getChannelData(c), o);
        if (!premier) premier = r;
        out.getChannelData(c).set(r.audio);
      }
      return {
        valeurs: [out],
        message: traduire("msg.hachee.resume", premier!.traineeLibreSec.toFixed(2), premier!.traineeSec.toFixed(2)),
      };
    },
  },
  {
    id: "shimmer", nom: "Shimmer", nomEn: "Shimmer",
    univers: "Traitement", famille: "Effets",
    resume: "Une réverbération dont la queue monte d'une octave à chaque tour, et s'éloigne en montant.",
    resumeEn: "A reverb whose tail rises an octave at each pass, receding as it climbs.",
    notice: "Une réverbération dont la queue monte d'une octave à chaque tour, et qui s'éloigne en montant. L'effet est associé aux nappes de Brian Eno et Daniel Lanois, et sa recette est une boucle : la queue est transposée puis réinjectée dans la réverbération, indéfiniment, chaque tour plus haut et plus faible.\n\nUn graphe acyclique ne peut pas l'exprimer — c'est une rétroaction, pas une chaîne —, et c'est pourquoi cela demande un nœud plutôt qu'un câblage. La boucle est donc déroulée en générations : la première est la réverbération du son, la deuxième celle de la première transposée, et ainsi de suite. Quatre ou cinq suffisent ; au-delà, tout est sous le plancher d'audition, et le nœud affiche le niveau de chacune pour qu'on le voie.\n\nLa première génération n'est pas transposée, et c'est ce qui rend l'effet reconnaissable : on entend d'abord la salle, puis l'octave qui monte dedans. Transposer dès le premier tour donnerait un son aigu immédiat, qui sonne comme une erreur de réglage.\n\nUn défaut trouvé en mesurant, et il aurait rendu le nœud inutilisable : la réponse de réverbération n'était pas à gain unitaire, si bien que chaque convolution ajoutait de l'énergie. La quatrième génération ressortait soixante-quatorze décibels au-dessus de la première, et le réglage de rebouclage ne commandait rien. La réponse est désormais normalisée en énergie ; le rebouclage décide seul de l'extinction.",
    noticeEn: "A reverb whose tail rises an octave at each pass, receding as it climbs. The effect is associated with Brian Eno's and Daniel Lanois's pads, and its recipe is a loop: the tail is transposed then fed back into the reverb, indefinitely, each pass higher and quieter.\n\nAn acyclic graph cannot express that — it is feedback, not a chain — which is why it takes a node rather than a patch. The loop is therefore unrolled into generations: the first is the reverb of the sound, the second the reverb of the first transposed, and so on. Four or five are enough; beyond that everything is below the hearing floor, and the node shows each one's level so it can be seen.\n\nThe first generation is not transposed, and that is what makes the effect recognisable: one hears the room first, then the octave rising inside it. Transposing from the first pass would give an immediate high sound, which sounds like a misconfiguration.\n\nOne fault found by measuring, and it would have made the node unusable: the reverb response was not unity gain, so every convolution added energy. The fourth generation came out seventy-four decibels above the first, and the feedback setting commanded nothing. The response is now normalised in energy; feedback alone decides the decay.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Décroissance", nomEn: "Decay", type: "curseur", plage: [0.2, 4], pas: 0.1, defaut: 1.2, unite: "s",
        doc: "Longueur de la queue de chaque génération. Elle se cumule : quatre générations d'une seconde s'étendent bien au-delà d'une seconde.",
        docEn: "Tail length of each generation. It accumulates: four generations of one second extend well beyond one second." },
      { nom: "Rebouclage", nomEn: "Feedback", type: "curseur", plage: [0, 95], pas: 1, defaut: 60, unite: "%",
        doc: "Ce qui repart dans la boucle à chaque tour. C'est lui, et lui seul, qui décide de la vitesse d'extinction — depuis que la réponse est normalisée en énergie.",
        docEn: "What goes back into the loop at each pass. It alone decides the decay — since the response was normalised in energy." },
      { nom: "Transposition", nomEn: "Transposition", type: "curseur", plage: [-12, 24], pas: 1, defaut: 12, unite: "demi-tons", uniteEn: "semitones",
        doc: "Ce que la boucle transpose à chaque tour. Douze donne l'octave du shimmer classique ; sept donne une quinte qui empile des accords ; les valeurs négatives font descendre, ce qui épaissit au lieu d'éclairer.",
        docEn: "What the loop transposes at each pass. Twelve gives the classic shimmer octave; seven gives a fifth that stacks chords; negative values descend, which thickens instead of brightening." },
      { nom: "Générations", nomEn: "Generations", type: "curseur", plage: [1, 8], pas: 1, defaut: 4,
        doc: "Nombre de tours déroulés. Au-delà de quatre ou cinq, tout est sous le plancher d'audition et le calcul coûte pour rien — le nœud affiche le niveau de chaque génération pour qu'on le voie.",
        docEn: "Number of passes unrolled. Beyond four or five everything is below the hearing floor and the computation costs for nothing — the node shows each generation's level so it can be seen." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Proportion ajoutée au son sec. À 0 %, la sortie est l'entrée.",
        docEn: "Proportion added to the dry sound. At 0 %, the output is the input." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [1, 999999], pas: 1, defaut: 1,
        doc: "Graine de la réponse de la salle.", docEn: "Seed of the room's response." },
    ],
    async executer(ctx: any) {
      const e = ctx.entree(0);
      if (!(e instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const o = {
        decroissanceSec: ctx.paramNombre("Décroissance", 1.2),
        rebouclage: ctx.paramNombre("Rebouclage", 60) / 100,
        demiTons: ctx.paramNombre("Transposition", 12),
        generations: Math.round(ctx.paramNombre("Générations", 4)),
        melange: ctx.paramNombre("Mix", 50) / 100,
        graine: Math.round(ctx.paramNombre("Graine", 1)),
        frequence: e.sampleRate,
        // La transposition du catalogue garde la durée, là où celle de secours raccourcit.
        transposer: transposerAvecDuree,
      };
      const out = new AudioBuffer({ numberOfChannels: e.numberOfChannels, length: e.length, sampleRate: e.sampleRate });
      let premier = null as null | ReturnType<typeof shimmer>;
      for (let c = 0; c < e.numberOfChannels; c++) {
        const r = shimmer(e.getChannelData(c), o);
        if (!premier) premier = r;
        out.getChannelData(c).set(r.audio);
      }
      return {
        valeurs: [out],
        message: traduire("msg.shimmer.resume",
          premier!.generationsDb.map((d) => d.toFixed(0)).join(" \u00b7 ")),
      };
    },
  },
  {
    id: "rogner-silences", nom: "Rogner les silences", nomEn: "Trim Silence",
    univers: "Traitement", famille: "Montage",
    resume: "Retire le silence au début et à la fin d'une prise, et au milieu si on le demande.",
    resumeEn: "Removes silence at the start and end of a take, and in the middle if asked.",
    notice: "Le geste le plus courant du montage, et il manquait. Attic savait ajouter du silence, extraire une zone, aligner une piste sur une autre — mais pas retirer le blanc au début et à la fin d'une prise, ce qu'on fait pourtant à chaque fichier qui entre dans un projet.\n\nLe seuil se compte en décibels, et c'est la seule échelle honnête. Un seuil linéaire à 0,01 paraît petit et vaut quarante décibels sous la pleine échelle, c'est-à-dire un niveau où une respiration, une queue de réverbération ou un souffle de préampli vivent encore. En décibels, on sait ce qu'on coupe.\n\nLa marge existe parce qu'un seuil seul coupe toujours trop. L'attaque d'un son monte depuis le silence : le premier échantillon au-dessus du seuil arrive déjà après le début de la montée, et rogner là donne un clic et une attaque tronquée. Quelques dizaines de millisecondes rendues de part et d'autre suffisent.\n\nCe qui est mesuré est l'enveloppe, pas l'échantillon. Une sinusoïde passe par zéro deux fois par période : au seul examen de l'échantillon, tout son contient des silences de quelques dixièmes de milliseconde, et le mode « Partout » découperait un la 440 en huit cent quatre-vingts morceaux par seconde.\n\nDeux ambitions, et le choix n'est pas anodin. Aux bords, on ne touche pas à ce qui se passe au milieu : un silence entre deux phrases fait partie du jeu, et le retirer change la musique. Partout, on retire aussi les silences intérieurs plus longs que la durée minimale — c'est un autre métier, celui du montage de parole. Les deux canaux sont toujours rognés aux mêmes endroits, faute de quoi l'image se décalerait.",
    noticeEn: "The commonest editing gesture, and it was missing. Attic could add silence, extract a zone, align one track to another — but not remove the blank at the start and end of a take, which is done to every file entering a project.\n\nThe threshold is counted in decibels, the only honest scale. A linear threshold of 0.01 looks small and is forty decibels below full scale, that is, a level where a breath, a reverb tail or a preamp hiss are still alive. In decibels, one knows what is being cut.\n\nThe margin exists because a threshold alone always cuts too much. A sound's attack rises out of silence: the first sample above the threshold already arrives after the rise began, and trimming there gives a click and a truncated attack. A few dozen milliseconds given back on either side are enough.\n\nWhat is measured is the envelope, not the sample. A sinusoid crosses zero twice per period: looking at samples alone, every sound contains silences of a few tenths of a millisecond, and the « Everywhere » mode would cut an A 440 into eight hundred and eighty pieces per second.\n\nTwo ambitions, and the choice is not innocent. At the edges, what happens in the middle is untouched: a silence between two phrases is part of the playing, and removing it changes the music. Everywhere, inner silences longer than the minimum duration are removed too — that is another craft, speech editing. Both channels are always trimmed at the same places, failing which the image would shift.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Seuil", nomEn: "Threshold", type: "curseur", plage: [-80, -20], pas: 1, defaut: -60, unite: "dB",
        doc: "En deçà de ce niveau, c'est du silence. −60 laisse passer presque tout ce qui s'entend ; −40 rogne franchement, au risque d'emporter une queue de réverbération.",
        docEn: "Below this level it is silence. -60 lets through almost everything audible; -40 trims firmly, at the risk of taking a reverb tail with it." },
      { nom: "Marge", nomEn: "Margin", type: "curseur", plage: [0, 500], pas: 5, defaut: 50, unite: "ms",
        doc: "Ce qui est rendu de part et d'autre. Sans marge, l'attaque est tronquée et l'on entend un clic : le premier échantillon au-dessus du seuil arrive déjà après le début de la montée.",
        docEn: "What is given back on either side. Without a margin the attack is truncated and a click is heard: the first sample above the threshold already arrives after the rise began." },
      { nom: "Portée", nomEn: "Scope", type: "choix",
        options: ["Bords", "Partout"], optionsEn: ["Edges", "Everywhere"],
        optionIds: ["bords", "partout"], defaut: "Bords", defautEn: "Edges",
        doc: "Aux bords, le milieu n'est pas touché : un silence entre deux phrases fait partie du jeu. Partout, les silences intérieurs assez longs sont retirés aussi — c'est le montage de parole, et cela change la musique.",
        docEn: "At the edges, the middle is untouched: a silence between two phrases is part of the playing. Everywhere, long enough inner silences are removed too — that is speech editing, and it changes the music." },
      { nom: "Durée minimale", nomEn: "Minimum length", type: "curseur", plage: [0.1, 5], pas: 0.1, defaut: 0.5, unite: "s",
        doc: "En mode Partout : longueur à partir de laquelle un silence intérieur est retiré. En deçà, il est conservé.",
        docEn: "In Everywhere mode: the length from which an inner silence is removed. Below it, it is kept." },
    ],
    async executer(ctx: any) {
      const e = ctx.entree(0);
      if (!(e instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      // LE PLAN EST CALCULÉ SUR LA SOMME DES CANAUX, et appliqué à tous : rogner chaque canal selon
      // son propre silence décalerait l'image dès qu'un côté commence avant l'autre.
      const n = e.length;
      const somme = new Float32Array(n);
      for (let c = 0; c < e.numberOfChannels; c++) {
        const d = e.getChannelData(c);
        for (let i = 0; i < n; i++) somme[i] += d[i] / e.numberOfChannels;
      }
      const plan = planRognage(somme, {
        seuilDb: ctx.paramNombre("Seuil", -60),
        margeMs: ctx.paramNombre("Marge", 50),
        frequence: e.sampleRate,
        partout: ctx.paramTexte("Portée", "bords") === "partout",
        dureeMinSec: ctx.paramNombre("Durée minimale", 0.5),
      });
      if (plan.gardes.length === 0) {
        return { valeurs: [null], message: traduire("msg.rognage.silencieux") };
      }
      const canaux = appliquerRognage(
        Array.from({ length: e.numberOfChannels }, (_, c) => e.getChannelData(c)), plan.gardes);
      const out = new AudioBuffer({ numberOfChannels: e.numberOfChannels, length: canaux[0].length, sampleRate: e.sampleRate });
      canaux.forEach((x, c) => out.getChannelData(c).set(x));
      return {
        valeurs: [out],
        message: traduire("msg.rognage.resume",
          (e.duration).toFixed(2), (out.length / e.sampleRate).toFixed(2), String(plan.gardes.length)),
      };
    },
  },
  {
    id: "fusion-stereo", nom: "Fusionner en stéréo", nomEn: "Merge to Stereo",
    univers: "Traitement", famille: "Montage",
    resume: "Réunit deux prises mono en une stéréo : la première à gauche, la seconde à droite.",
    resumeEn: "Joins two mono takes into one stereo: the first on the left, the second on the right.",
    notice: "L'inverse du séparateur de canaux, qui existait seul : on pouvait défaire une stéréo sans pouvoir en refaire une. C'est le geste de toute prise à deux micros — deux fichiers mono, deux chaînes de traitement séparées, et une stéréo à la fin.\n\nLa durée est celle du plus long, et le plus court est complété par du silence plutôt que bouclé ou étiré : deux prises de longueurs différentes ne sont pas la même prise, et faire coïncider leurs fins inventerait un alignement que personne n'a demandé. Si vous voulez cet alignement, le nœud « Aligneur de piste » le fait, et il le dit.",
    noticeEn: "The inverse of the channel splitter, which existed alone: one could take a stereo apart without being able to put one together. It is the gesture of every two-microphone take — two mono files, two separate processing chains, and a stereo at the end.\n\nThe length is that of the longer one, and the shorter is padded with silence rather than looped or stretched: two takes of different lengths are not the same take, and making their ends coincide would invent an alignment nobody asked for. If that alignment is wanted, the « Track Aligner » node does it, and says so.",
    entrees: [
      { nom: "Gauche", nomEn: "Left", type: "audio" },
      { nom: "Droite", nomEn: "Right", type: "audio" },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [],
    async executer(ctx: any) {
      const g = ctx.entree(0), d = ctx.entree(1);
      if (!(g instanceof AudioBuffer) || !(d instanceof AudioBuffer)) {
        return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      }
      const out = fusionnerStereo(g, d);
      return {
        valeurs: [out],
        message: traduire("msg.fusion.resume", g.duration.toFixed(2), d.duration.toFixed(2), out.duration.toFixed(2)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
