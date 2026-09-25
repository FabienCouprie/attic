// plugins/spirale-logarithmique.ts — La spirale équiangle, rendue en son.
//
// La géométrie est dans `audio/spirale-logarithmique.ts`, testée ; ce fichier fait la synthèse.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  NOMBRE_OR, ecartAutoSimilarite, partielsDeSpirale, rapportValide, type OptionsSpirale,
} from "../audio/spirale-logarithmique";

/** Les rapports qui ont un nom. « Libre » laisse le curseur décider. */
const RAPPORTS: Record<string, number | null> = {
  or: NOMBRE_OR,
  octave: 2,
  quinte: 1.5,
  e: Math.E,
  libre: null,
};

export const fiches: FicheAudio[] = ([
  {
    id: "spirale-logarithmique", nom: "Spirale logarithmique", nomEn: "Logarithmic Spiral",
    univers: "Entrées", famille: "Génération",
    resume: "Un spectre en progression géométrique qui glisse : un tour de spirale le multiplie par un rapport, et il se superpose à lui-même.",
    notice: "Synthétise un spectre dont les partiels sont en progression géométrique, et le fait glisser. Un tour de spirale multiplie toutes les fréquences par un même rapport, si bien que le spectre se superpose alors à lui-même, décalé d'un partiel.\n\nUne spirale logarithmique s'écrit r = a·e^(bθ) : avancer d'un angle fixe multiplie le rayon par un facteur fixe. C'est la seule courbe dont un agrandissement se confond avec une rotation, ce qui lui vaut le nom de spirale équiangle. Ici le rayon porte la fréquence et l'angle porte le temps : les partiels sont placés à un tour les uns des autres, à f·ρ^k.\n\nLa spirale ne se referme pour aucun rapport. On revient au même angle, jamais au même rayon, et le message donne l'écart d'auto-similarité mesuré sur la trajectoire rendue.\n\n« Rapport par tour » décide de l'intervalle entre deux partiels voisins :\n• à 2, les partiels sont des octaves et le spectre est celui d'un son de Shepard\n• au nombre d'or, à e ou à 3/2, il est inharmonique et n'appartient à aucune gamme\n• un rapport de 1 est exclu : la spirale y dégénère en cercle\n\n« Tours » dit de combien la spirale tourne sur toute la durée. Positif, le spectre monte ; négatif, il descend ; nul, il tient immobile. « Décroissance » règle le poids des partiels aigus : à zéro tous pèsent autant et le son est un sifflement, à un ils décroissent comme une série harmonique.\n\nLa phase de chaque partiel est intégrée échantillon par échantillon, et non recalculée à partir de la fréquence courante : poser sin(2π·f(t)·t) sur une fréquence qui varie donne une hauteur fausse, la dérivée de f(t)·t n'étant pas f(t). Les partiels qui dépasseraient la moitié de la fréquence d'échantillonnage sont abandonnés, et le message les compte.\n\nLa sortie « Spectre » donne, pour chaque partiel retenu, son rang, sa fréquence au départ et à l'arrivée, et son amplitude.\n\nD'après la spirale équiangle étudiée par Jacques Bernoulli, et la devise qu'il voulut sur sa tombe, « eadem mutata resurgo ».",
    resumeEn: "A geometric spectrum that glides: one turn of the spiral multiplies it by a ratio, and it maps onto itself.",
    noticeEn: "Synthesises a spectrum whose partials are in geometric progression, and makes it glide. One turn of the spiral multiplies every frequency by the same ratio, so that the spectrum then maps onto itself, shifted by one partial.\n\nA logarithmic spiral is written r = a·e^(bθ): advancing by a fixed angle multiplies the radius by a fixed factor. It is the only curve whose magnification coincides with a rotation, which earns it the name equiangular spiral. Here the radius carries frequency and the angle carries time: the partials sit one turn apart, at f·ρ^k.\n\nThe spiral closes for no ratio at all. One returns to the same angle, never to the same radius, and the message gives the self-similarity deviation measured on the rendered trajectory.\n\n« Ratio per turn » decides the interval between two neighbouring partials:\n• at 2, the partials are octaves and the spectrum is a Shepard tone's\n• at the golden ratio, at e or at 3/2, it is inharmonic and belongs to no scale\n• a ratio of 1 is excluded: the spiral degenerates into a circle there\n\n« Turns » says how far the spiral turns over the whole length. Positive, the spectrum rises; negative, it falls; zero, it holds still. « Rolloff » sets the weight of the high partials: at zero they all weigh the same and the sound is a whistle, at one they fall off like a harmonic series.\n\nEach partial's phase is integrated sample by sample rather than recomputed from the current frequency: writing sin(2π·f(t)·t) for a varying frequency gives a wrong pitch, the derivative of f(t)·t not being f(t). Partials that would pass half the sampling rate are dropped, and the message counts them.\n\nThe « Spectrum » output gives, for each partial kept, its rank, its frequency at the start and at the end, and its amplitude.\n\nAfter the equiangular spiral studied by Jacob Bernoulli, and the motto he wanted on his gravestone, « eadem mutata resurgo ».",
    entrees: [],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Spectre", nomEn: "Spectrum", type: "texte" },
    ],
    parametres: [
      { nom: "Rapport par tour", nomEn: "Ratio per turn", type: "choix",
        options: ["Nombre d'or", "Octave (2)", "Quinte (3/2)", "e", "Libre"],
        optionsEn: ["Golden ratio", "Octave (2)", "Fifth (3/2)", "e", "Free"],
        optionIds: ["or", "octave", "quinte", "e", "libre"],
        defaut: "Nombre d'or", defautEn: "Golden ratio",
        doc: "Le facteur dont le rayon est multiplié en un tour, et donc l'intervalle qui sépare deux partiels voisins. À 2, les partiels sont des octaves et le spectre est celui d'un son de Shepard. Aux autres rapports il est inharmonique, et aucun ne referme la spirale.",
        docEn: "The factor the radius is multiplied by in one turn, hence the interval between two neighbouring partials. At 2 the partials are octaves and the spectrum is a Shepard tone's. At other ratios it is inharmonic, and none closes the spiral." },
      { nom: "Rapport libre", nomEn: "Free ratio", type: "curseur", plage: [1.05, 4], pas: 0.01, defaut: 1.62,
        doc: "Le rapport employé quand « Libre » est choisi. Un est exclu : la spirale y dégénère en cercle.",
        docEn: "The ratio used when « Free » is chosen. One is excluded: the spiral degenerates into a circle there." },
      { nom: "Fondamentale", nomEn: "Fundamental", type: "curseur", plage: [20, 440], pas: 1, defaut: 55, unite: "Hz",
        doc: "Fréquence du partiel de rang zéro, au départ.",
        docEn: "Frequency of the rank-zero partial, at the start." },
      { nom: "Partiels", nomEn: "Partials", type: "curseur", plage: [1, 24], pas: 1, defaut: 9,
        doc: "Nombre de partiels placés sur la spirale, un par tour. Les partiels qui dépassent la moitié de la fréquence d'échantillonnage sont abandonnés, et le message les compte.",
        docEn: "Number of partials placed on the spiral, one per turn. Partials that pass half the sampling rate are dropped, and the message counts them." },
      { nom: "Tours", nomEn: "Turns", type: "curseur", plage: [-6, 6], pas: 0.5, defaut: 2,
        doc: "Nombre de tours parcourus sur toute la durée. Un tour multiplie tout le spectre par le rapport. Négatif pour descendre, zéro pour tenir le spectre immobile.",
        docEn: "Number of turns travelled over the whole length. One turn multiplies the whole spectrum by the ratio. Negative to descend, zero to hold the spectrum still." },
      { nom: "Durée", nomEn: "Length", type: "curseur", plage: [1, 60], pas: 1, defaut: 12, unite: "s",
        doc: "Durée du parcours.", docEn: "Length of the travel." },
      { nom: "Décroissance", nomEn: "Rolloff", type: "curseur", plage: [0, 3], pas: 0.1, defaut: 1,
        doc: "Décroissance de l'amplitude le long de la spirale, en puissance du rang. À zéro, tous les partiels pèsent autant et le son est un sifflement ; à un, ils décroissent comme une série harmonique.",
        docEn: "Amplitude rolloff along the spiral, as a power of the rank. At zero every partial weighs the same and the sound is a whistle; at one they fall off like a harmonic series." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "Niveau du rendu.", docEn: "Level of the render." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const choix = ctx.paramTexte("Rapport par tour", "or");
      const rapport = rapportValide(RAPPORTS[choix] ?? ctx.paramNombre("Rapport libre", 1.62));
      const o: OptionsSpirale = {
        fondamentale: ctx.paramNombre("Fondamentale", 55),
        rapport,
        partiels: Math.round(ctx.paramNombre("Partiels", 9)),
        tours: ctx.paramNombre("Tours", 2),
        dureeSec: ctx.paramNombre("Durée", 12),
        decroissance: ctx.paramNombre("Décroissance", 1),
      };

      const sr = 44100;
      const n = Math.max(1, Math.round(o.dureeSec * sr));
      const buffer = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
      const x = buffer.getChannelData(0);
      const partiels = partielsDeSpirale(o);

      // LA PHASE EST INTÉGRÉE, ET NON RECALCULÉE À CHAQUE ÉCHANTILLON. Poser sin(2π·f(t)·t) pour
      // une fréquence qui varie donne une hauteur fausse, la dérivée de f(t)·t n'étant pas f(t).
      let abandonnes = 0;
      const nyquist = sr / 2;
      let somme = 0;
      for (const p of partiels) {
        if (p.frequenceDebut >= nyquist || p.frequenceFin >= nyquist) { abandonnes++; continue; }
        somme += p.amplitude;
      }
      const normalisation = somme > 0 ? 1 / somme : 1;

      for (const p of partiels) {
        if (p.frequenceDebut >= nyquist || p.frequenceFin >= nyquist) continue;
        const a = p.amplitude * normalisation;
        let phase = 0;
        for (let i = 0; i < n; i++) {
          const part = n > 1 ? i / (n - 1) : 0;
          const f = p.frequenceDebut * Math.pow(rapport, o.tours * part);
          phase += (2 * Math.PI * f) / sr;
          x[i] += a * Math.sin(phase);
        }
      }

      // Un fondu de vingt millisecondes aux deux bouts : le spectre commence et finit en plein
      // milieu de son parcours, et une coupure nette y ferait un clic.
      const fondu = Math.min(Math.floor(0.02 * sr), Math.floor(n / 2));
      for (let i = 0; i < fondu; i++) {
        const g = i / fondu;
        x[i] *= g;
        x[n - 1 - i] *= g;
      }

      const volume = ctx.paramNombre("Volume", 70) / 100;
      let pic = 0;
      for (let i = 0; i < n; i++) pic = Math.max(pic, Math.abs(x[i]));
      const gain = pic > 0 ? (volume * 0.95) / pic : 1;
      for (let i = 0; i < n; i++) x[i] *= gain;

      const retenus = partiels.filter((p) => p.frequenceDebut < nyquist && p.frequenceFin < nyquist);
      const lignes = [
        `${en ? "Ratio per turn" : "Rapport par tour"} : ${rapport.toFixed(4)}`,
        `${en ? "Turns" : "Tours"} : ${o.tours}   ${en ? "total factor" : "facteur total"} : ${Math.pow(rapport, o.tours).toFixed(4)}`,
        "",
        `  ${en ? "rank" : "rang"}   ${en ? "start" : "départ"}        ${en ? "end" : "arrivée"}       ${en ? "amp" : "ampl"}`,
        ...retenus.map((p) =>
          `  ${String(p.rang).padStart(4)}   ${p.frequenceDebut.toFixed(2).padStart(9)} Hz  `
          + `${p.frequenceFin.toFixed(2).padStart(9)} Hz  ${p.amplitude.toFixed(3)}`),
      ];
      if (abandonnes > 0) {
        lignes.push("", `${en ? "Dropped above Nyquist" : "Abandonnés au-dessus de Nyquist"} : ${abandonnes}`);
      }

      const ecart = ecartAutoSimilarite(o);
      return {
        valeurs: [buffer, lignes.join("\n")],
        message: `${en ? "ratio" : "rapport"} ${rapport.toFixed(3)} · ${retenus.length} ${en ? "partials" : "partiels"}`
          + (abandonnes ? ` · ${abandonnes} ${en ? "dropped" : "abandonnés"}` : "")
          + ` · ${en ? "self-similarity" : "auto-similarité"} ${ecart.toFixed(3)} ‰`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
