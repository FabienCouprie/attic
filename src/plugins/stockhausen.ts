// plugins/stockhausen.ts — Nœud « Continuum hauteur ↔ rythme » : fait traverser
// à un son la frontière où l'oreille cesse d'entendre une note pour entendre une
// pulsation. Voir audio/stockhausen.ts pour le principe.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "continuum-stockhausen", nom: "Continuum hauteur ↔ rythme", nomEn: "Pitch ↔ Rhythm Continuum",
    univers: "Traitement", famille: "Effets",
    resume: "Ralentit un son jusqu'à ce que sa hauteur devienne une pulsation.",
    resumeEn: "Slows a sound until its pitch turns into a pulse.",
    notice: "D'après la découverte que Karlheinz Stockhausen formule en composant « Kontakte » (1960) : hauteur, timbre et rythme ne sont pas trois phénomènes distincts mais UN SEUL, observé à trois échelles de temps. Une impulsion répétée 200 fois par seconde s'entend comme une note de 200 Hz ; ralentie mille fois, la même impulsion s'entend comme une pulsation toutes les cinq secondes. Rien ne change dans le signal sinon l'échelle, et pourtant l'oreille bascule d'une catégorie à l'autre, quelque part autour de 20 Hz. Ce nœud n'est donc pas un effet de plus mais une démonstration : il fait traverser cette frontière à votre son, continûment, et l'on entend l'endroit exact où la hauteur se décompose en rythme. Donnez-lui une source PÉRIODIQUE et bien marquée — un train d'impulsions, une note tenue, un motif percussif court : c'est sa périodicité qui devient le rythme. Sur un son sans périodicité franche, il ne se passe rien d'audible sinon un ralenti. Mécaniquement, il s'agit d'une lecture à vitesse variable, comme le mode « Bande » du glissando de Risset ; ce qui change tout est l'amplitude du balayage — une dizaine d'octaves, soit un facteur mille, là où un glissando en parcourt quelques-unes.",
    noticeEn: "After the discovery Karlheinz Stockhausen formulated while composing \"Kontakte\" (1960): pitch, timbre and rhythm are not three distinct phenomena but ONE, observed at three time scales. A pulse repeated 200 times a second is heard as a 200 Hz note; slowed a thousandfold, the same pulse is heard as one beat every five seconds. Nothing changes in the signal but the scale, and yet the ear flips from one category to the other somewhere around 20 Hz. This node is therefore not one more effect but a demonstration: it carries your sound across that boundary, continuously, and you hear the exact point where pitch decomposes into rhythm. Feed it a PERIODIC, clearly articulated source — a pulse train, a sustained note, a short percussive pattern: its periodicity is what becomes the rhythm. On material without clear periodicity, nothing audible happens beyond a slow-down. Mechanically this is variable-speed playback, like the \"Tape\" mode of the Risset glissando; what changes everything is the span of the sweep — some ten octaves, a factor of a thousand, where a glissando covers a few.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Sens", nomEn: "Direction", type: "choix",
        options: ["Vers le rythme", "Vers la hauteur"], optionsEn: ["Toward rhythm", "Toward pitch"],
        optionIds: ["rythme", "hauteur"],
        defaut: "rythme", defautEn: "rythme",
        doc: "« Vers le rythme » ralentit : la note se décompose en pulsation. « Vers la hauteur » accélère : la pulsation se condense en note. La première est la plus démonstrative, car on part de ce que l'oreille identifie le mieux.",
        docEn: "\"Toward rhythm\" slows down: the note decomposes into a pulse. \"Toward pitch\" speeds up: the pulse condenses into a note. The first is the more telling, since it starts from what the ear identifies best." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [2, 300], pas: 1, defaut: 30, unite: "s",
        doc: "Durée de la traversée. Longue, elle laisse le temps d'entendre la bascule ; courte, elle produit un effet de chute.",
        docEn: "Length of the crossing. Long, it gives time to hear the flip; short, it produces a falling effect." },
      { nom: "Octaves", nomEn: "Octaves", type: "nombre", plage: [2, 16], pas: 1, defaut: 10,
        doc: "Amplitude du balayage. Dix octaves valent un facteur mille : une source à 200 Hz finit à 0,2 Hz, soit une pulsation toutes les cinq secondes. En dessous de 5, on reste dans le domaine des hauteurs et la démonstration n'opère pas.",
        docEn: "Span of the sweep. Ten octaves is a factor of a thousand: a 200 Hz source ends at 0.2 Hz, one beat every five seconds. Below 5 you stay in the pitch domain and the demonstration does not work." },
      { nom: "Fondu de boucle", nomEn: "Loop crossfade", type: "nombre", plage: [0, 500], pas: 5, defaut: 20, unite: "ms",
        doc: "Fondu appliqué pour que la source boucle sans clic. Ralentie mille fois, elle ne fournirait sinon qu'une fraction de milliseconde de matériau.",
        docEn: "Crossfade so the source loops without a click. Slowed a thousandfold it would otherwise supply a fraction of a millisecond of material." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { continuumHauteurRythme } = await import("../audio/stockhausen");
      const versLaHauteur = ctx.paramTexte("Sens", "rythme") === "hauteur";
      const octaves = ctx.paramNombre("Octaves", 10);
      const out = continuumHauteurRythme(a, {
        dureeSec: ctx.paramNombre("Durée", 30),
        octaves, versLaHauteur,
        fonduBoucleSec: ctx.paramNombre("Fondu de boucle", 20) / 1000,
      });
      return {
        valeurs: [out],
        message: traduire("msg.continuum_var_0_var_1",
          octaves, Math.round(Math.pow(2, octaves))),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
