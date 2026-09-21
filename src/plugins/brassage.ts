// plugins/brassage.ts — Le moteur de segments de Wishart, et le transfert de contour.
//
// D'après « Audible Design » (1994) et les familles `brassage` et `envel` du Composers Desktop
// Project. La logique est dans `audio/brassage.ts` et `audio/enveloppe-transfert.ts`, testées ;
// ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { brasser } from "../audio/brassage";
import { transfererEnveloppe } from "../audio/enveloppe-transfert";

const sansEntree = () => ({ valeurs: [null], message: traduire("msg.aucune_entr_e") });

/** Applique une transformation canal par canal, la longueur de sortie étant décidée par elle. */
function parCanal(entree: AudioBuffer, f: (x: Float32Array) => Float32Array): AudioBuffer {
  const voies: Float32Array[] = [];
  for (let c = 0; c < entree.numberOfChannels; c++) voies.push(f(entree.getChannelData(c)));
  const n = Math.max(1, ...voies.map((v) => v.length));
  const out = new AudioBuffer({ numberOfChannels: entree.numberOfChannels, length: n, sampleRate: entree.sampleRate });
  for (let c = 0; c < entree.numberOfChannels; c++) out.getChannelData(c).set(voies[c].subarray(0, n));
  return out;
}

export const fiches: FicheAudio[] = ([
  {
    id: "brassage", nom: "Brassage", nomEn: "Brassage",
    univers: "Traitement", famille: "Effets",
    resume: "Un seul moteur de segments : étirement, transposition, granulation et brouillage sont quatre réglages du même geste.",
    resumeEn: "A single segment engine: stretching, transposition, granulation and scrambling are four settings of the same gesture.",
    notice: "D'après Trevor Wishart, « Audible Design » (1994), et la famille `brassage` du Composers Desktop Project. Wishart a gardé le mot français tel quel.\n\nCe n'est pas un granulateur de plus. Attic sait déjà découper en grains — le gel granulaire boucle un grain, la découpe aléatoire brouille des tranches, le mosaïquage remplace chaque grain par celui d'un autre son. Chacun fait une chose. Le brassage est l'inverse : un seul mécanisme, lire des segments et les recoller, dont quatre réglages donnent quatre transformations qu'on croit distinctes.\n\nLa vitesse seule étire ou comprime, sans toucher à la hauteur. La transposition seule change la hauteur, sans toucher à la durée. La densité et la taille des segments font passer du nuage clairsemé au mur continu. Une forte dispersion de position brouille la source, et l'ordre des choses se perd.\n\nLe rendre en un nœud plutôt qu'en quatre n'est pas une économie de code : c'est ce qui rend visible qu'ils sont le même geste. On passe de l'un à l'autre en bougeant un curseur, et l'on entend le chemin entre les deux — ce qu'aucune suite de quatre nœuds séparés ne montre.",
    noticeEn: "After Trevor Wishart, « Audible Design » (1994), and the Composers Desktop Project's `brassage` family. Wishart kept the French word as it stands.\n\nThis is not one more granulator. Attic already cuts into grains — granular freeze loops a grain, random slice shuffles slices, mosaicing replaces each grain with another sound's. Each does one thing. Brassage is the opposite: a single mechanism, reading segments and gluing them back, whose four settings give four transformations one takes to be distinct.\n\nSpeed alone stretches or compresses, without touching pitch. Transposition alone changes pitch, without touching duration. Density and segment size move from a sparse cloud to a continuous wall. Strong position scatter shuffles the source, and the order of things is lost.\n\nMaking it one node rather than four is not a saving in code: it is what makes visible that they are the same gesture. One moves from one to the other by dragging a slider, and hears the path between them — which no chain of four separate nodes shows.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Segment", nomEn: "Segment", type: "curseur", plage: [0.002, 0.5], pas: 0.002, defaut: 0.05, unite: "s",
        doc: "Longueur d'un segment. Court, on entend des grains ; long, on entend des bouts de son reconnaissables. Le passage se fait vers 50 millisecondes, là où l'oreille cesse de distinguer les événements et commence à entendre une matière.",
        docEn: "Length of one segment. Short, one hears grains; long, one hears recognisable pieces of sound. The turn comes around 50 milliseconds, where the ear stops telling events apart and starts hearing a material." },
      { nom: "Densité", nomEn: "Density", type: "curseur", plage: [1, 400], pas: 1, defaut: 40, unite: "/s",
        doc: "Segments démarrés par seconde. Au-delà de l'inverse de la longueur d'un segment, ils se recouvrent et le son devient continu ; en dessous, il reste des trous et l'on entend un nuage.",
        docEn: "Segments started per second. Beyond the inverse of the segment length they overlap and the sound becomes continuous; below it there are gaps, and one hears a cloud." },
      { nom: "Vitesse", nomEn: "Speed", type: "curseur", plage: [0.01, 4], pas: 0.01, defaut: 1, unite: "x",
        doc: "Rapport entre le temps de la sortie et celui de la source. À 1, la source est parcourue à son rythme. À 0,5, il faut deux secondes de sortie pour parcourir une seconde de source : c'est l'étirement, et la hauteur n'en est pas affectée. Bornée à un centième, sans quoi la sortie demanderait des dizaines de gigaoctets.",
        docEn: "Ratio between the output's time and the source's. At 1, the source is traversed at its own pace. At 0.5, two seconds of output are needed to cover one second of source: this is the stretch, and pitch is not affected. Bounded at one hundredth, without which the output would demand tens of gigabytes." },
      { nom: "Transposition", nomEn: "Transposition", type: "curseur", plage: [-24, 24], pas: 1, defaut: 0, unite: "demi-tons", uniteEn: "semitones",
        doc: "Hauteur des segments. Elle ne touche pas à la position de lecture : elle change la cadence à laquelle chaque segment est relu. C'est ce qui la rend indépendante de la vitesse — ce qu'un lecteur de bande ne sait pas faire.",
        docEn: "Pitch of the segments. It does not touch the read position: it changes the rate at which each segment is replayed. That is what makes it independent of speed — which a tape player cannot do." },
      { nom: "Dispersion", nomEn: "Scatter", type: "curseur", plage: [0, 2], pas: 0.01, defaut: 0, unite: "s",
        doc: "Écart maximal tiré au sort sur la position de lecture. À zéro, les segments se suivent dans l'ordre. Fort, ils viennent de n'importe où dans la source, et l'ordre des choses se perd. Pour que du son remonte d'un endroit éloigné, il faut que la dispersion dépasse la distance à couvrir.",
        docEn: "Largest random offset on the read position. At zero the segments follow one another in order. High, they come from anywhere in the source, and the order of things is lost. For sound to travel from a distant place, the scatter must exceed the distance to cover." },
      { nom: "Dispersion hauteur", nomEn: "Pitch scatter", type: "curseur", plage: [0, 24], pas: 0.5, defaut: 0, unite: "demi-tons", uniteEn: "semitones",
        doc: "Écart maximal tiré au sort sur la transposition de chaque segment. Quelques demi-tons donnent un chatoiement ; une octave donne un nuage sans hauteur.",
        docEn: "Largest random offset on each segment's transposition. A few semitones give a shimmer; an octave gives a cloud with no pitch." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 1,
        doc: "Graine du tirage. Une même graine rejoue exactement le même brassage — utile pour retrouver un résultat qu'on a aimé. Sans dispersion, elle ne sert à rien : rien n'est tiré au sort.",
        docEn: "Seed of the draw. The same seed replays exactly the same brassage — useful to find again a result one liked. With no scatter it does nothing: nothing is drawn at random." },
    ],
    async executer(ctx: any) {
      const e = ctx.entree(0);
      if (!(e instanceof AudioBuffer)) return sansEntree();
      const o = {
        grainSec: ctx.paramNombre("Segment", 0.05),
        densite: ctx.paramNombre("Densité", 40),
        vitesse: ctx.paramNombre("Vitesse", 1),
        transposition: ctx.paramNombre("Transposition", 0),
        dispersionSec: ctx.paramNombre("Dispersion", 0),
        dispersionDemiTons: ctx.paramNombre("Dispersion hauteur", 0),
        graine: Math.round(ctx.paramNombre("Graine", 1)),
      };
      const out = parCanal(e, (x) => brasser(x, e.sampleRate, o));
      return {
        valeurs: [out],
        message: traduire("msg.brassage.rendu",
          (out.length / e.sampleRate).toFixed(2),
          String(Math.round((out.length / e.sampleRate) * o.densite))),
      };
    },
  },
  {
    id: "transfert-enveloppe", nom: "Transfert d'enveloppe", nomEn: "Envelope Transfer",
    univers: "Traitement", famille: "Effets",
    resume: "Prend le contour d'amplitude d'un son et le pose sur un autre : le rythme de l'un, la matière de l'autre.",
    resumeEn: "Takes one sound's amplitude contour and lays it on another: one's rhythm, the other's material.",
    notice: "D'après Trevor Wishart, « Audible Design » (1994), et les programmes `envel extract` et `envel impose` du Composers Desktop Project.\n\nAttic savait fabriquer une enveloppe — l'enveloppe ADSR en dessine une, le fondu en applique une aux bords. Aucun nœud ne savait prendre celle d'un son pour la poser sur un autre. C'est pourtant l'opération qui fait parler une nappe : le rythme d'une phrase parlée, la respiration d'une batterie, l'attaque d'une percussion, transférés sur un son qui n'en a aucun.\n\nPourquoi il faut aplatir la cible d'abord, et c'est le point qu'on rate en le faisant à la main. Multiplier simplement la cible par l'enveloppe du modèle ne donne pas le contour du modèle : il donne le produit des deux. Si la cible a déjà une attaque, elle survit sous celle qu'on impose, et le résultat n'a le rythme ni de l'une ni de l'autre. Aplatir d'abord ramène la cible à une amplitude constante, et ce qu'on entend ensuite est bien le contour du modèle.\n\nLes deux sons n'ont pas à faire la même longueur : l'enveloppe du modèle est étirée pour couvrir la cible.",
    noticeEn: "After Trevor Wishart, « Audible Design » (1994), and the Composers Desktop Project's `envel extract` and `envel impose`.\n\nAttic could build an envelope — the ADSR envelope draws one, the fade applies one at the edges. No node could take one sound's and lay it on another. Yet this is the operation that makes a pad speak: the rhythm of a spoken phrase, the breathing of a drum kit, the attack of a percussion, transferred onto a sound that has none.\n\nWhy the target must be flattened first, and this is the point one misses doing it by hand. Simply multiplying the target by the model's envelope does not give the model's contour: it gives the product of the two. If the target already has an attack, it survives beneath the one being imposed, and the result has neither one's rhythm. Flattening first brings the target back to a constant amplitude, and what one then hears is indeed the model's contour.\n\nThe two sounds need not be the same length: the model's envelope is stretched to cover the target.",
    entrees: [
      { nom: "Cible", nomEn: "Target", type: "audio" },
      { nom: "Modèle", nomEn: "Model", type: "audio" },
    ],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Résolution", nomEn: "Resolution", type: "curseur", plage: [1, 300], pas: 1, defaut: 10, unite: "ms",
        doc: "Finesse du contour suivi. C'est le seul réglage qui change vraiment la nature du résultat : à 5 millisecondes on transfère presque la forme d'onde, et le grain du modèle passe avec ; à 200, on ne garde que ses grandes respirations et la phrase seulement.",
        docEn: "How finely the contour is followed. It is the only setting that really changes the nature of the result: at 5 milliseconds one transfers almost the waveform, and the model's grain comes with it; at 200, only its large breaths remain, the phrase alone." },
      { nom: "Aplatir", nomEn: "Flatten", type: "choix", options: ["Oui", "Non"], optionsEn: ["Yes", "No"],
        optionIds: ["oui", "non"], defaut: "Oui", defautEn: "Yes",
        doc: "Effacer le contour propre de la cible avant d'imposer celui du modèle. À « Non », on obtient le produit des deux contours, ce qui est parfois voulu mais n'est pas un transfert.",
        docEn: "Erase the target's own contour before imposing the model's. At « No » one gets the product of the two contours, which is sometimes wanted but is not a transfer." },
      { nom: "Plancher", nomEn: "Floor", type: "curseur", plage: [-80, -20], pas: 1, defaut: -60, unite: "dB",
        doc: "Niveau sous lequel la cible n'est pas aplatie. Aplatir est une division, et diviser du silence n'amplifierait que du bruit de fond : sous ce seuil, le silence de la cible est tenu pour du silence et non pour un creux à corriger.",
        docEn: "Level below which the target is not flattened. Flattening is a division, and dividing silence would only amplify background noise: below this threshold the target's silence is taken as silence and not as a dip to correct." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Proportion de contour imposé. À 0 %, la sortie est la cible, inchangée.",
        docEn: "Proportion of imposed contour. At 0 %, the output is the target, unchanged." },
    ],
    async executer(ctx: any) {
      const cible = ctx.entree(0);
      const modele = ctx.entree(1);
      if (!(cible instanceof AudioBuffer) || !(modele instanceof AudioBuffer)) return sansEntree();
      const o = {
        fenetre: Math.max(1, Math.round((ctx.paramNombre("Résolution", 10) / 1000) * cible.sampleRate)),
        aplatir: ctx.paramTexte("Aplatir", "oui") !== "non",
        plancher: Math.pow(10, ctx.paramNombre("Plancher", -60) / 20),
        melange: ctx.paramNombre("Mix", 100) / 100,
      };
      const out = new AudioBuffer({
        numberOfChannels: cible.numberOfChannels, length: cible.length, sampleRate: cible.sampleRate,
      });
      for (let c = 0; c < cible.numberOfChannels; c++) {
        const m = modele.getChannelData(Math.min(c, modele.numberOfChannels - 1));
        out.getChannelData(c).set(transfererEnveloppe(cible.getChannelData(c), m, o));
      }
      return {
        valeurs: [out],
        message: traduire("msg.transfertEnveloppe.rendu",
          (modele.length / modele.sampleRate).toFixed(2), (cible.length / cible.sampleRate).toFixed(2)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
