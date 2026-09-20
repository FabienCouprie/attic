// plugins/fdn.ts — Une réverbération dont la décroissance dépend de la fréquence.
//
// D'après Jot et Chaigne, AES 1991, et Schlecht et Habets, DAFx-17. La logique est dans
// `audio/fdn.ts`, testée ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { filtrerBande, reponseFdn, rt60Mesure, traiterFdn } from "../audio/fdn";

export const fiches: FicheAudio[] = ([
  {
    id: "reverbe-reseau", nom: "Réverbération à réseau (FDN)", nomEn: "Feedback Delay Network Reverb",
    univers: "Traitement", famille: "Effets",
    resume: "Une réverbération dont le temps de décroissance se règle séparément dans le grave et dans l'aigu — ce que fait toute vraie salle.",
    resumeEn: "A reverb whose decay time is set separately for the low and the high end — as every real room behaves.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Réponse", nomEn: "Impulse response", type: "audio", sousType: "stereo" },
    ],
    parametres: [
      { nom: "RT60 grave", nomEn: "Low RT60", type: "curseur", plage: [0.1, 12], pas: 0.1, defaut: 2, unite: "s",
        doc: "Temps que met le grave pour perdre 60 dB. C'est la durée que l'oreille appelle « la taille de la salle », et ici elle est demandée et non subie : le réseau la tient. Mesuré par l'intégrale de Schroeder sur la réponse obtenue — 1,96 s pour 2,00 demandées.",
        docEn: "Time the low end takes to lose 60 dB. This is the duration the ear calls « room size », and here it is requested rather than endured: the network holds it. Measured by the Schroeder integral on the resulting response — 1.96 s for 2.00 requested." },
      { nom: "RT60 aigu", nomEn: "High RT60", type: "curseur", plage: [0.1, 12], pas: 0.1, defaut: 0.7, unite: "s",
        doc: "Temps de décroissance à la fréquence de référence. C'EST LE RÉGLAGE QUI MANQUAIT AUX CINQ AUTRES RÉVERBÉRATIONS D'ATTIC : aucune ne décroît autrement qu'au même rythme partout, alors qu'une salle absorbe l'aigu bien plus vite que le grave — une vraie queue s'ASSOMBRIT en s'éteignant. Le mettre plus LONG que le grave donne un effet qu'aucune salle ne produit, et la stabilité borne alors sévèrement ce qu'on peut demander : le module de la boucle ne peut pas dépasser l'unité, sous peine de voir la réverbération enfler au lieu de s'éteindre. Mesuré dans l'application avec 0,5 s au grave et 2 s à l'aigu : la queue reste PLATE à 0,5 s partout, l'écart étant mangé par la borne. Autrement dit ce sens du réglage ne fait presque rien, et il vaut mieux le lire ici que de le chercher à l'oreille.",
        docEn: "Decay time at the reference frequency. THIS IS THE SETTING THE OTHER FIVE ATTIC REVERBS LACKED: none of them decays at anything but one single rate everywhere, whereas a room absorbs the high end far faster than the low — a real tail DARKENS as it dies. Setting it LONGER than the low end gives an effect no room produces, and stability then bounds severely what can be asked: the loop's magnitude cannot exceed unity, on pain of the reverb swelling instead of dying out. Measured in the application with 0.5 s at the low end and 2 s at the high: the tail stays FLAT at 0.5 s throughout, the difference being eaten by the bound. In other words this direction of the setting does almost nothing, and it is better read here than hunted for by ear." },
      { nom: "Fréquence de l'aigu", nomEn: "High reference", type: "curseur", plage: [1000, 16000], pas: 100, defaut: 8000, unite: "Hz",
        doc: "Fréquence à laquelle « RT60 aigu » est exact. Elle existe parce que la première version résolvait le filtre à Nyquist, ce qui est plus simple mais rend le réglage trompeur : on mesurait 0,73 s à 18 kHz pour 0,50 demandée, l'exactitude tombant à une fréquence que personne n'écoute. En la plaçant ici, le réglage annonce ce qu'on entend.",
        docEn: "Frequency at which « High RT60 » is exact. It exists because the first version solved the filter at Nyquist, which is simpler but makes the setting misleading: 0.73 s was measured at 18 kHz for 0.50 requested, exactness falling at a frequency nobody listens to. Placed here, the setting announces what one hears." },
      { nom: "Lignes", nomEn: "Delay lines", type: "choix",
        options: ["4", "8", "16"], optionsEn: ["4", "8", "16"], optionIds: ["4", "8", "16"],
        defaut: "8", defautEn: "8",
        doc: "Nombre de lignes à retard bouclées les unes sur les autres. Plus il y en a, plus la queue est dense et lisse ; quatre suffisent pour une petite pièce, seize donnent une grande salle. Leurs longueurs sont prises PREMIÈRES : deux retards ayant un diviseur commun feraient coïncider leurs échos périodiquement, ce qui s'entend comme une résonance métallique.",
        docEn: "Number of delay lines looped into one another. The more there are, the denser and smoother the tail; four is enough for a small room, sixteen gives a large hall. Their lengths are taken PRIME: two delays sharing a divisor would make their echoes coincide periodically, which is heard as a metallic ringing." },
      { nom: "Retard court", nomEn: "Shortest delay", type: "curseur", plage: [5, 60], pas: 1, defaut: 23, unite: "ms",
        doc: "Longueur de la plus courte ligne : c'est elle qui donne la taille apparente du lieu, avant même la durée.",
        docEn: "Length of the shortest line: this is what gives the apparent size of the place, even before the duration." },
      { nom: "Retard long", nomEn: "Longest delay", type: "curseur", plage: [20, 200], pas: 1, defaut: 79, unite: "ms",
        doc: "Longueur de la plus longue ligne. L'écart entre les deux fait la densité des premiers échos ; resserré, on entend un couloir, élargi, une cathédrale.",
        docEn: "Length of the longest line. The gap between the two makes the density of early echoes; narrow it and you hear a corridor, widen it and a cathedral." },
      { nom: "Largeur", nomEn: "Width", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Écart entre les deux voies. À zéro, la réverbération est mono ; les deux voies sont obtenues par des combinaisons de signes différentes des mêmes lignes, ce qui les décorrèle sans rien coûter.",
        docEn: "Difference between the two channels. At zero the reverb is mono; the two channels come from different sign combinations of the same lines, which decorrelates them at no cost." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 35, unite: "%",
        doc: "Proportion de réverbération. À 0 %, la sortie est le son d'entrée.",
        docEn: "Proportion of reverb. At 0 %, the output is the input." },
      { nom: "Queue", nomEn: "Tail", type: "curseur", plage: [0.2, 15], pas: 0.1, defaut: 0, unite: "s",
        doc: "Durée ajoutée après le son pour laisser la queue s'éteindre. À zéro, le nœud prend le plus long des deux RT60 — une réverbération qui s'arrêterait avec le son n'en serait pas une.",
        docEn: "Duration added after the sound to let the tail die out. At zero the node takes the longer of the two RT60s — a reverb that stopped with the sound would not be one." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!(entree instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      }
      const { numberOfChannels: canaux, length, sampleRate } = entree;
      const rt60Bas = ctx.paramNombre("RT60 grave", 2);
      const rt60Haut = ctx.paramNombre("RT60 aigu", 0.7);
      const freqRef = ctx.paramNombre("Fréquence de l'aigu", 8000);
      const queueDemandee = ctx.paramNombre("Queue", 0);
      const options = {
        sampleRate, rt60Bas, rt60Haut, freqRef,
        lignes: parseInt(ctx.paramTexte("Lignes", "8"), 10) || 8,
        retardMin: ctx.paramNombre("Retard court", 23),
        retardMax: Math.max(ctx.paramNombre("Retard court", 23) + 5, ctx.paramNombre("Retard long", 79)),
        largeur: ctx.paramNombre("Largeur", 100) / 100,
        melange: ctx.paramNombre("Mix", 35) / 100,
        queue: queueDemandee > 0.2 ? queueDemandee : Math.max(rt60Bas, rt60Haut),
      };

      // Le son est traité en passant DANS le réseau, et non par convolution : c'est la structure
      // même de l'article, et elle coûte 20 ms pour deux secondes de son à huit lignes.
      const voieG = entree.getChannelData(0);
      const voieD = canaux > 1 ? entree.getChannelData(1) : voieG;
      const a = traiterFdn(voieG, options);
      const b = canaux > 1 ? traiterFdn(voieD, options) : a;
      const n = a.gauche.length;
      const sortie = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate });
      sortie.getChannelData(0).set(a.gauche);
      sortie.getChannelData(1).set(canaux > 1 ? b.droite : a.droite);

      // La réponse impulsionnelle, comme le fait la réverbération velours : à regarder, ou à
      // brancher sur la réverbération à convolution.
      const ri = reponseFdn({ ...options, queue: options.queue });
      const reponse = new AudioBuffer({ numberOfChannels: 2, length: ri.gauche.length, sampleRate });
      reponse.getChannelData(0).set(ri.gauche);
      reponse.getChannelData(1).set(ri.droite);

      // Le nœud MESURE ce qu'il a produit, par l'intégrale de Schroeder sur sa propre réponse, dans
      // une bande grave et une bande à la fréquence de référence. C'est la seule façon de savoir si
      // la salle demandée est la salle obtenue, sans avoir à la mesurer soi-même.
      const mesureBas = rt60Mesure(filtrerBande(ri.gauche, sampleRate, 150, 8), sampleRate);
      const mesureHaut = rt60Mesure(filtrerBande(ri.gauche, sampleRate, freqRef, 8), sampleRate);
      void length;
      return {
        valeurs: [sortie, reponse],
        message: traduire("msg.fdn.mesure",
          mesureBas.toFixed(2), mesureHaut.toFixed(2), (n / sampleRate).toFixed(2)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
