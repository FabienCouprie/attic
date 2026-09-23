// plugins/spirale-spatiale.ts — Le son tourne et s'éloigne, à rapport fixe par tour.
//
// La trajectoire est dans `audio/spirale-spatiale.ts`, testée ; ce fichier applique.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  NOMBRE_OR, pointSpirale, rapportDistanceParTour, rapportValide, type OptionsSpatiale,
} from "../audio/spirale-spatiale";

const RAPPORTS: Record<string, number | null> = {
  double: 2, or: NOMBRE_OR, moitie: 1.5, quadruple: 4, libre: null,
};

export const fiches: FicheAudio[] = ([
  {
    id: "spirale-spatiale", nom: "Spirale spatiale", nomEn: "Spatial Spiral",
    univers: "Traitement", famille: "Effets",
    resume: "Fait tourner le son autour de l'auditeur en l'éloignant : l'azimut se referme à chaque tour, la distance jamais.",
    notice: "Fait tourner un son autour de l'auditeur tout en l'éloignant, azimut et distance liés : un tour multiplie la distance par un rapport fixe. L'azimut se referme à chaque tour, la distance jamais.\n\nLa distance agit de deux façons, qu'il faut tenir séparées :\n• le niveau suit la loi du carré inverse, doubler la distance coûte six décibels ; c'est une géométrie, elle ne dépend ni de l'air ni de la salle\n• l'air absorbe l'aigu et lui seul, d'autant plus que la distance est grande ; c'est la part du timbre qui dit la distance quand le niveau ment\n\n« Absorption de l'air » règle la seconde. À zéro, s'éloigner ne fait que baisser le niveau. Le filtre est un passe-bas du premier ordre dont la coupure suit la distance instant par instant, un filtre figé ne disant pas un mouvement.\n\nL'azimut suit la loi en cosinus, qui garde le niveau perçu constant au passage par le centre : un panoramique linéaire y perdrait trois décibels, et la rotation s'entendrait pomper.\n\n« Distance de départ » fixe le niveau de référence : la sortie y vaut l'entrée. « Sens » choisit le sens du rayon ; se rapprocher multiplie le niveau au lieu de le diviser. Un rapport de 1 est exclu : la trajectoire y serait un cercle.\n\nLe message donne les distances de départ et d'arrivée, le rapport par tour, la perte en décibels et la course de la coupure de l'air. L'entrée est ramenée en mono, une source placée sur une trajectoire étant un point et non une image.",
    resumeEn: "Turns the sound around the listener while moving it away: the azimuth closes on every turn, the distance never does.",
    noticeEn: "Turns a sound around the listener while moving it away, azimuth and distance linked: one turn multiplies the distance by a fixed ratio. The azimuth closes on every turn, the distance never does.\n\nDistance acts in two ways, which must be kept apart:\n• level follows the inverse square law, doubling the distance costs six decibels; that is geometry, and depends on neither the air nor the room\n• the air absorbs the high end and only the high end, the more so the greater the distance; it is timbre that tells distance when level lies\n\n« Air absorption » sets the second. At zero, receding only lowers the level. The filter is a first-order lowpass whose cutoff follows the distance instant by instant, a fixed filter not telling a movement.\n\nThe azimuth follows the cosine law, which keeps the perceived level constant through the centre: a linear pan would lose three decibels there, and the rotation would be heard pumping.\n\n« Starting distance » sets the reference level: the output equals the input there. « Direction » picks the direction of the radius; approaching multiplies the level instead of dividing it. A ratio of 1 is excluded: the trajectory would be a circle.\n\nThe message gives the starting and ending distances, the ratio per turn, the loss in decibels and the travel of the air cutoff. The input is brought down to mono, a source placed on a trajectory being a point and not an image.",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Tours", nomEn: "Turns", type: "curseur", plage: [0.5, 8], pas: 0.5, defaut: 3,
        doc: "Nombre de tours parcourus sur toute la durée du son.",
        docEn: "Number of turns travelled over the whole length of the sound." },
      { nom: "Rapport par tour", nomEn: "Ratio per turn", type: "choix",
        options: ["Double (2)", "Nombre d'or", "Une fois et demie", "Quadruple (4)", "Libre"],
        optionsEn: ["Double (2)", "Golden ratio", "One and a half", "Quadruple (4)", "Free"],
        optionIds: ["double", "or", "moitie", "quadruple", "libre"],
        defaut: "Double (2)", defautEn: "Double (2)",
        doc: "Le facteur dont la distance est multipliée en un tour. À 2, chaque tour coûte six décibels par la loi du carré inverse.",
        docEn: "The factor the distance is multiplied by in one turn. At 2, each turn costs six decibels by the inverse square law." },
      { nom: "Rapport libre", nomEn: "Free ratio", type: "curseur", plage: [1.05, 8], pas: 0.05, defaut: 2,
        doc: "Le rapport employé quand « Libre » est choisi. Un est exclu : la trajectoire y serait un cercle.",
        docEn: "The ratio used when « Free » is chosen. One is excluded: the trajectory would be a circle." },
      { nom: "Sens", nomEn: "Direction", type: "choix",
        options: ["S'éloigne", "Se rapproche"], optionsEn: ["Recedes", "Approaches"],
        optionIds: ["eloigne", "rapproche"], defaut: "S'éloigne", defautEn: "Recedes",
        doc: "Le sens du rayon. S'éloigner divise le niveau à chaque tour, se rapprocher le multiplie.",
        docEn: "The direction of the radius. Receding divides the level at each turn, approaching multiplies it." },
      { nom: "Distance de départ", nomEn: "Starting distance", type: "curseur",
        plage: [0.5, 20], pas: 0.5, defaut: 1, unite: "m",
        doc: "Distance au départ du parcours. Elle fixe le niveau de référence : la sortie y vaut l'entrée.",
        docEn: "Distance at the start of the travel. It sets the reference level: the output equals the input there." },
      { nom: "Absorption de l'air", nomEn: "Air absorption", type: "curseur",
        plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "De combien l'air ferme l'aigu avec la distance. À zéro, s'éloigner ne fait que baisser le niveau, ce qu'un simple gain ferait aussi ; c'est le timbre qui dit la distance quand le niveau ment.",
        docEn: "How far the air closes the high end with distance. At zero, receding only lowers the level, which a plain gain would do too; it is timbre that tells distance when level lies." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const entree = ctx.entree(0);
      if (!(entree instanceof AudioBuffer)) {
        return { valeurs: [null], message: en ? "Connect a sound." : "Branchez un son." };
      }

      const choix = ctx.paramTexte("Rapport par tour", "double");
      const o: OptionsSpatiale = {
        tours: ctx.paramNombre("Tours", 3),
        rapport: rapportValide(RAPPORTS[choix] ?? ctx.paramNombre("Rapport libre", 2)),
        eloigne: ctx.paramTexte("Sens", "eloigne") !== "rapproche",
        distanceDebut: ctx.paramNombre("Distance de départ", 1),
        absorption: ctx.paramNombre("Absorption de l'air", 50) / 100,
      };

      const sr = entree.sampleRate;
      const n = entree.length;
      const sortie = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
      const g = sortie.getChannelData(0);
      const d = sortie.getChannelData(1);
      const src = entree.getChannelData(0);
      const src2 = entree.numberOfChannels > 1 ? entree.getChannelData(1) : src;

      // Le passe-bas de l'air est du premier ordre, un pôle, et son coefficient suit la coupure
      // instant par instant : un filtre figé ne dirait pas l'éloignement, qui est un mouvement.
      let etatG = 0;
      let etatD = 0;
      let coupureMin = Infinity;
      let coupureMax = 0;
      for (let i = 0; i < n; i++) {
        const p = pointSpirale(o, n > 1 ? i / (n - 1) : 0);
        coupureMin = Math.min(coupureMin, p.coupureHz);
        coupureMax = Math.max(coupureMax, p.coupureHz);
        const k = Math.exp((-2 * Math.PI * p.coupureHz) / sr);
        const mono = 0.5 * (src[i] + src2[i]);
        etatG = (1 - k) * mono + k * etatG;
        etatD = (1 - k) * mono + k * etatD;
        g[i] = etatG * p.gain * p.gaucheGain * Math.SQRT2;
        d[i] = etatD * p.gain * p.droiteGain * Math.SQRT2;
      }

      const fin = pointSpirale(o, 1);
      const parTour = rapportDistanceParTour(o);
      return {
        valeurs: [sortie],
        message: [
          `${o.tours} ${en ? "turns" : "tours"}`,
          `${en ? "distance" : "distance"} ${o.distanceDebut.toFixed(1)} → ${fin.distance.toFixed(1)} m`,
          `${en ? "per turn" : "par tour"} ×${parTour.toFixed(2)}`,
          `${(20 * Math.log10(fin.gain)).toFixed(1)} dB`,
          `${en ? "air" : "air"} ${Math.round(coupureMax)} → ${Math.round(coupureMin)} Hz`,
        ].join(" · "),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
