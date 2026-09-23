// plugins/stereo-morphing.ts — Deux nœuds que le catalogue n'avait pas : réunir le grave, et passer
// d'un son à un autre par le spectre. La logique est dans `audio/mono-grave.ts` et
// `audio/morphing-spectral.ts`, testées ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { monoGrave } from "../audio/mono-grave";
import { centroide, morphingSpectral } from "../audio/morphing-spectral";
import { valeursParametre } from "../audio/courbe";

const voie = (b: AudioBuffer, c: number) => b.getChannelData(Math.min(c, b.numberOfChannels - 1));

export const fiches: FicheAudio[] = ([
  {
    id: "mono-grave", nom: "Grave en mono", nomEn: "Bass Mono",
    univers: "Traitement", famille: "Effets",
    resume: "Réunit le grave des deux canaux sous une coupure, et laisse l'aigu intact.",
    resumeEn: "Collapses the bass of both channels below a crossover, and leaves the treble untouched.",
    notice: "Trois raisons de réunir le grave, et aucune n'est une superstition de studio. La gravure d'abord : un sillon de disque porte la somme des canaux sur un axe et leur différence sur l'autre, si bien qu'un grave décorrélé fait sauter le burin hors du sillon — l'atelier refuse le disque ou en baisse le niveau. La salle ensuite : sous une centaine de hertz, la longueur d'onde dépasse trois mètres, l'oreille n'y localise plus rien, et deux graves différents ne produisent qu'un flottement d'énergie selon l'endroit où l'on se tient. On ne perd donc aucune information en les réunissant. La somme mono enfin : c'est dans le grave que les annulations coûtent le plus cher, parce que c'est là qu'est l'énergie.\n\nLe traitement est un passe-haut sur le côté, et rien d'autre. C'est la formulation qui rend l'opération exacte, et un premier jet ne l'avait pas trouvée : il séparait chaque canal en deux bandes et réunissait la bande grave. Deux défauts, l'un et l'autre mesurés. La bande aiguë obtenue par soustraction gardait énormément de grave — à 50 Hz sous une coupure à 120, la moitié de l'amplitude restait, parce qu'un filtre déphase et qu'une soustraction ne fait pas disparaître ce qui est déphasé. Et la mesure rendue regardait les bandes internes au lieu de la sortie : elle annonçait une corrélation parfaite pour un travail à moitié fait.\n\nÉcrit sur le côté, tout devient exact. Le milieu n'est jamais filtré, si bien que la somme mono ressort au bit près quel que soit le réglage — c'est la propriété qu'on veut le plus ici, et elle est gratuite. À quantité nulle, l'entrée ressort telle quelle, sans même un déphasage.\n\nLe nœud dit ce qu'il a fait : de combien le côté grave a baissé, et ce que devient la corrélation des deux canaux sous la coupure. Le premier chiffre dépend de la distance à la coupure, comme tout filtre — mesuré sous 120 Hz : −22,7 dB pour un côté à 50 et 70 Hz, −40,9 dB à 30 et 40 Hz.",
    noticeEn: "Three reasons to collapse the bass, and none is a studio superstition. Cutting first: a record groove carries the sum of the channels on one axis and their difference on the other, so a decorrelated bass throws the cutting stylus out of the groove — the plant refuses the record or lowers its level. The room next: below a hundred hertz or so, the wavelength exceeds three metres, the ear localises nothing there, and two different basses only produce an energy flutter depending on where one stands. Nothing is lost by joining them. The mono sum last: it is in the bass that cancellations cost the most, because that is where the energy is.\n\nThe processing is a high-pass on the side, and nothing else. That is the formulation that makes the operation exact, and a first attempt had not found it: it split each channel into two bands and joined the low one. Two faults, both measured by the tests. The high band obtained by subtraction kept a great deal of bass — at 50 Hz under a 120 Hz crossover, half the amplitude remained, because a filter shifts phase and a subtraction does not remove what has been phase-shifted. And the measure returned looked at the internal bands rather than the output: it announced a perfect correlation for a job half done.\n\nWritten on the side, everything becomes exact. The mid is never filtered, so the mono sum comes out bit for bit whatever the setting — the property one wants most here, and it is free. At zero amount the input comes out as it went in, without even a phase shift.\n\nThe node says what it did: by how much the low side fell, and what the correlation of the two channels below the crossover becomes. The first figure depends on the distance to the crossover, as with any filter — measured under 120 Hz: -22.7 dB for a side at 50 and 70 Hz, -40.9 dB at 30 and 40 Hz.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Coupure", nomEn: "Crossover", type: "curseur", plage: [40, 400], pas: 5, defaut: 120, unite: "Hz",
        doc: "Fréquence sous laquelle le côté disparaît. Cent vingt hertz est l'usage courant ; une gravure demande souvent plus haut, une écoute au casque se contente de moins.",
        docEn: "Frequency below which the side vanishes. A hundred and twenty hertz is common practice; a record cut often asks for higher, headphone listening needs less." },
      { nom: "Quantité", nomEn: "Amount", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "À 100 %, le côté grave disparaît entièrement ; à 50 %, il en garde la moitié. Le réglage sert, parce qu'un grave entièrement mono resserre parfois une réverbération qu'on avait voulue large.",
        docEn: "At 100 % the low side vanishes entirely; at 50 % half of it remains. The setting is useful, because a fully mono bass sometimes tightens a reverberation one had wanted wide." },
    ],
    async executer(ctx: any) {
      const e = ctx.entree(0);
      if (!(e instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const r = monoGrave(voie(e, 0), voie(e, 1), ctx.paramNombre("Coupure", 120), e.sampleRate,
        ctx.paramNombre("Quantité", 100) / 100);
      const out = new AudioBuffer({ numberOfChannels: 2, length: e.length, sampleRate: e.sampleRate });
      out.getChannelData(0).set(r.gauche.subarray(0, e.length));
      out.getChannelData(1).set(r.droite.subarray(0, e.length));
      return {
        valeurs: [out],
        message: traduire("msg.monograve.resume",
          r.coteRetireDb.toFixed(1), r.correlationAvant.toFixed(2), r.correlationApres.toFixed(2)),
      };
    },
  },
  {
    id: "morphing-spectral", nom: "Morphing spectral", nomEn: "Spectral Morphing",
    univers: "Traitement", famille: "Effets",
    resume: "Passe d'un son à un autre par le spectre : au milieu, un timbre qui n'existait pas.",
    resumeEn: "Travels from one sound to another through the spectrum: in the middle, a timbre that did not exist.",
    notice: "Ce n'est pas un fondu enchaîné, et c'est la première chose à dire. Un fondu fait entendre deux sons, l'un qui s'en va et l'autre qui arrive ; au milieu, on entend les deux. Un morphing n'en fait entendre qu'un, dont le timbre se déplace.\n\nCe n'est pas non plus le vocodeur du catalogue, qui fait de la synthèse croisée : celui-là prend l'enveloppe de l'un et l'applique à l'autre, opération asymétrique où il y a un modulateur et une porteuse, et où la porteuse fournit la matière. Ici les deux sons ont le même rôle, et le réglage traverse continûment de l'un à l'autre.\n\nL'interpolation se fait sur les logarithmes des amplitudes, et ce détail est tout le sujet. Interpoler linéairement ferait dominer le plus fort des deux : à mi-chemin entre un partiel à 1 et un partiel à 0,01, la moyenne vaut 0,505, soit le son fort à un demi-décibel près. En logarithme, le même milieu donne 0,1, c'est-à-dire à mi-chemin en décibels — la seule façon d'être au milieu pour l'oreille.\n\nLa phase vient du son dominant, celui vers lequel on penche, et non d'une interpolation : deux phases moyennées ne donnent pas une phase intermédiaire mais une interférence, et le résultat s'amincit au lieu de se déplacer. Ce sont les amplitudes qui portent le timbre ; la phase porte le grain.\n\nCe que la méthode ne fait pas, et il faut l'écrire : elle interpole les amplitudes case par case, elle n'apparie pas les partiels pour les faire glisser de l'un à l'autre. Entre un sinus à 200 Hz et un sinus à 3000, le milieu ne contient donc pas un sinus à 775 Hz : il contient les deux, à la moyenne géométrique de leurs amplitudes. Sur des sons riches, cela s'entend comme un timbre intermédiaire et le centroïde le confirme — mesuré, il passe de 200 à 2640 puis à 3000 Hz à mesure qu'on traverse. Sur deux sinus isolés, la limite se voit.\n\nUne courbe branchée sur l'entrée Modulation fait traverser au fil du son : une rampe part du premier et arrive au second, un sinus fait l'aller-retour.",
    noticeEn: "This is not a crossfade, and that is the first thing to say. A crossfade makes two sounds heard, one leaving and one arriving; in the middle one hears both. A morph makes only one heard, whose timbre moves.\n\nNor is it the catalogue's vocoder, which does cross-synthesis: that one takes the envelope of one and applies it to the other, an asymmetric operation where there is a modulator and a carrier, and where the carrier provides the matter. Here both sounds have the same role, and the setting travels continuously from one to the other.\n\nThe interpolation is done on the logarithms of the amplitudes, and that detail is the whole subject. Interpolating linearly would let the louder of the two dominate: halfway between a partial at 1 and a partial at 0.01, the mean is 0.505, that is the loud sound to within half a decibel. In logarithm the same midpoint gives 0.1, that is halfway in decibels — the only way to be in the middle for the ear.\n\nThe phase comes from the dominant sound, the one being leaned towards, rather than from an interpolation: two averaged phases do not make an intermediate phase but an interference, and the result thins out instead of moving. Amplitudes carry the timbre; phase carries the grain.\n\nWhat the method does not do, and it must be written: it interpolates amplitudes bin by bin, it does not pair partials to glide them from one to the other. Between a 200 Hz sine and a 3000 Hz sine the midpoint therefore does not hold a 775 Hz sine: it holds both, at the geometric mean of their amplitudes. On rich sounds this is heard as an intermediate timbre and the centroid confirms it — measured, it goes from 200 to 2640 then to 3000 Hz as one travels. On two isolated sines, the limit shows.\n\nA curve connected to the Modulation input travels along the sound: a ramp starts at the first and arrives at the second, a sine goes there and back.",
    entrees: [
      { nom: "Son A", nomEn: "Sound A", type: "audio" },
      { nom: "Son B", nomEn: "Sound B", type: "audio" },
      { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false, module: "Mélange" },
    ],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Mesures", nomEn: "Measurements", type: "texte" },
    ],
    parametres: [
      { nom: "Mélange", nomEn: "Morph", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "À 0 %, le son A ; à 100 %, le son B ; au milieu, un timbre intermédiaire. Une courbe branchée sur l'entrée Modulation prend la place de ce réglage.",
        docEn: "At 0 % sound A; at 100 % sound B; in between, an intermediate timbre. A curve connected to the Modulation input takes this setting's place." },
      { nom: "Modulation min", nomEn: "Modulation min", modulationDe: "Mélange", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Mélange que vaut le zéro d'une courbe branchée. Sans courbe, ce réglage ne sert pas.",
        docEn: "Morph that a connected curve's zero means. With no curve, this setting does nothing." },
      { nom: "Modulation max", nomEn: "Modulation max", modulationDe: "Mélange", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Mélange que vaut le un de la courbe. Une rampe de zéro à cent traverse entièrement d'un son à l'autre.",
        docEn: "Morph that the curve's one means. A ramp from zero to a hundred travels all the way from one sound to the other." },
      { nom: "Fenêtre", nomEn: "Window", type: "choix",
        options: ["1024", "2048", "4096"], optionsEn: ["1024", "2048", "4096"],
        optionIds: ["1024", "2048", "4096"], defaut: "2048", defautEn: "2048",
        doc: "Taille de l'analyse. Longue, elle sépare mieux les partiels et brouille les attaques ; courte, l'inverse. Deux mille quarante-huit points font quarante-six millisecondes à 44,1 kHz.",
        docEn: "Analysis size. Long, it separates partials better and blurs attacks; short, the reverse. Two thousand and forty-eight points are forty-six milliseconds at 44.1 kHz." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0), b = ctx.entree(1);
      if (!(a instanceof AudioBuffer) || !(b instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      }
      const taille = Math.round(Number(ctx.paramTexte("Fenêtre", "2048"))) || 2048;
      const melange = ctx.paramNombre("Mélange", 50) / 100;
      const n = Math.max(a.length, b.length);
      const canaux = Math.max(a.numberOfChannels, b.numberOfChannels);
      const courbe = valeursParametre(ctx.entree(2), n, melange, {
        min: ctx.paramNombre("Modulation min", 0) / 100,
        max: ctx.paramNombre("Modulation max", 100) / 100,
      });
      const out = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: a.sampleRate });
      for (let c = 0; c < canaux; c++) {
        out.getChannelData(c).set(morphingSpectral(voie(a, c), voie(b, c), { melange, melangeCourbe: courbe, taille }));
      }
      // LE CENTROÏDE DIT OÙ L'ON EN EST, et c'est la seule façon de vérifier qu'un morphing à
      // mi-chemin est vraiment à mi-chemin : une grandeur qui traverse d'un son à l'autre.
      const cA = centroide(voie(a, 0), a.sampleRate, taille);
      const cB = centroide(voie(b, 0), b.sampleRate, taille);
      const cOut = centroide(out.getChannelData(0), a.sampleRate, taille);
      const rapport = [
        `A ${cA.toFixed(0)} Hz \u2192 ${cOut.toFixed(0)} Hz \u2190 B ${cB.toFixed(0)} Hz`,
        `${traduire("msg.morphing.centroideLigne")}`,
      ].join("\n");
      return {
        valeurs: [out, rapport],
        message: traduire("msg.morphing.resume", cA.toFixed(0), cOut.toFixed(0), cB.toFixed(0)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
