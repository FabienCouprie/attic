// plugins/micromontage.ts — Un son fait de milliers de fragments posés un par un.
//
// Le calcul vit dans `audio/micromontage.ts`, éprouvé. Ce fichier n'est que la prise.
//
// POURQUOI CHAQUE GRANDEUR PORTE TROIS RÉGLAGES ET NON UN CHAMP DE TEXTE. La partition décrit une
// grandeur pour des milliers de fragments, ce qui demande deux bornes et une loi ; écrire cela dans
// un champ libre, « 0.04~0.12 », marche mais n'aide personne : rien ne dit les bornes admises, rien
// ne se règle à la souris, et la syntaxe s'apprend au lieu de se voir. Deux glissières et une liste
// disent la même chose en se laissant manier. Voir `docs/contrat-reglages.test.ts`, écrit après ce
// composant, qui tient la règle pour tout le catalogue.
//
// LA TRANSPOSITION ACCEPTE UNE COURBE, et elle seule. C'est la grandeur pour laquelle une évolution
// continue sur la durée du montage veut dire quelque chose : le nuage descend puis remonte, et l'on
// entend un geste là où le tirage ne donne qu'une texture. Les autres grandeurs sont ou bien des
// rangs, ou bien des lois de tirage, ce que `MODULABLES.md` écarte nommément de la modulation.

import type { FicheAudio } from "../audio/types-domaine";
import { estCourbe, valeursParametre } from "../audio/courbe";
import { deployer, type Champ } from "../audio/matrice-parametres";
import { FENETRES, partition, poserFragments, tirage, type Fenetre } from "../audio/micromontage";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";

/** Combien de sources on peut couper dans un même montage. */
const SOURCES = 4;

/** Le plus de fragments qu'une partition porte. */
const FRAGMENTS_MAX = 4000;

/** Les libellés des fenêtres, dans les termes de Roads. */
const FENETRES_FR = ["Gaussienne", "Trapèze", "Expodec", "Rexpodec"];
const FENETRES_EN = ["Gaussian", "Trapezoid", "Expodec", "Rexpodec"];

const LOIS_FR = ["Fixe", "Rampe", "Tirage"];
const LOIS_EN = ["Fixed", "Ramp", "Draw"];
const LOIS_ID = ["fixe", "rampe", "tirage"];

/** La phrase qui explique le trio, la même pour toutes les grandeurs. */
const TRIO_FR = "« Fixe » donne la même valeur à tous les fragments, celle de la première glissière ; « Rampe » traverse l'intervalle des deux glissières dans l'ordre ; « Tirage » le remplit sans ordre.";
const TRIO_EN = "« Fixed » gives every fragment the same value, that of the first slider; « Ramp » crosses the interval of the two sliders in order; « Draw » fills it without order.";

/** Les trois réglages d'une grandeur : sa valeur, sa seconde borne, sa loi. */
function trio(
  nom: string, nomEn: string,
  o: {
    plage: [number, number]; pas: number; de: number; a: number; loi: "fixe" | "rampe" | "tirage";
    unite?: string; doc: string; docEn: string;
  },
) {
  const commun = { type: "curseur" as const, plage: o.plage, pas: o.pas, ...(o.unite ? { unite: o.unite } : {}) };
  const rang = LOIS_ID.indexOf(o.loi);
  return [
    { nom, nomEn, ...commun, defaut: o.de, doc: o.doc, docEn: o.docEn },
    { nom: `${nom}, fin`, nomEn: `${nomEn}, end`, ...commun, defaut: o.a,
      doc: `La seconde borne, pour une rampe ou un tirage. Sans effet sur « Fixe ».`,
      docEn: `The second bound, for a ramp or a draw. No effect on « Fixed ».` },
    // LA LOI PAR DÉFAUT N'EST PAS LA MÊME POUR TOUTES LES GRANDEURS, et ce n'est pas un détail : une
    // partition dont tout serait fixe pose ses mille fragments au même instant, et ne rend qu'un
    // seul son additionné mille fois. La pose veut une rampe, la prise et les nuances un tirage.
    { nom: `${nom}, loi`, nomEn: `${nomEn}, law`, type: "choix" as const,
      options: LOIS_FR, optionsEn: LOIS_EN, optionIds: LOIS_ID,
      defaut: LOIS_FR[rang], defautEn: LOIS_EN[rang],
      doc: TRIO_FR, docEn: TRIO_EN },
  ];
}

export const fiches: FicheAudio[] = ([
  {
    id: "micromontage",
    nom: "Micromontage", nomEn: "Micromontage",
    univers: "Traitement", famille: "Montage",
    resume: "Assemble un son à partir de milliers de fragments, chacun découpé et posé à sa place.",
    resumeEn: "Assembles a sound from thousands of fragments, each cut and laid at its own place.",
    notice: `Assemble un son à partir de fragments courts découpés dans les sources reçues, chacun ayant son instant de découpe, son instant de pose, sa durée, son niveau, sa place dans l'image et son écart de hauteur.\n\nL'instant de découpe et l'instant de pose sont indépendants l'un de l'autre : c'est ce qui distingue le montage d'une lecture. D'après Curtis Roads, « Microsound », MIT Press, 2001, chapitre 6, et la pratique d'Horacio Vaggione.\n\nChaque grandeur se règle par trois commandes : sa valeur, sa seconde borne, et sa loi. ${TRIO_FR}\n\n« Fragments » donne leur nombre, jusqu'à ${FRAGMENTS_MAX}.\n\n« Source » dit dans laquelle chacun est découpé, à partir de un. Un numéro sans entrée branchée retombe sur la première.\n\n« Prise » est l'endroit de la découpe dans la source, de zéro au début à un à la fin.\n\n« Pose » est l'instant où le fragment tombe dans le résultat, en secondes. C'est cette grandeur qui fait la forme : une rampe étale le nuage, un tirage le disperse.\n\n« Durée » est celle du fragment posé, en secondes. Au-dessous de cinquante millisecondes la hauteur du fragment cesse de s'entendre et c'est le grain qui parle.\n\n« Nuance » est son niveau. « Panoramique » sa place, de moins un à gauche à un à droite, à puissance constante. « Transposition » son écart de hauteur en demi-tons : elle fait lire plus ou moins de source sans changer la durée posée.\n\nLa transposition se pilote par une courbe. Chaque fragment y lit la valeur qui correspond à son instant de pose : le nuage descend puis remonte, et l'on entend un geste là où un tirage ne donne qu'une texture. Les deux bornes de modulation disent ce que valent le zéro et le un de la courbe ; sans courbe branchée, elles ne servent pas.\n\n« Fenêtre » décide de la forme de chaque fragment. La gaussienne est la référence du livre ; le trapèze garde un plateau, donc du corps ; l'expodec décroît après une attaque brève, la rexpodec monte puis coupe. Les deux dernières donnent un sens au temps à l'intérieur du fragment.\n\n« Graine » gouverne les tirages. À graine égale, la même partition. « Niveau » règle la sortie ; la densité n'y touche pas, la somme étant ramenée à la racine du recouvrement moyen.\n\nLa sortie « Audio » porte le montage, toujours en deux voies puisque chaque fragment porte sa place. La sortie « Analyse » donne le nombre de fragments posés, ceux qui sont tombés hors de leur source, la durée, la densité en fragments par seconde et le plus grand nombre qui sonnent ensemble.`,
    noticeEn: `Assembles a sound from short fragments cut out of the received sources, each with its own instant of cutting, instant of laying, length, level, place in the image and pitch offset.\n\nThe instant of cutting and the instant of laying are independent of one another: that is what separates montage from playback. After Curtis Roads, « Microsound », MIT Press, 2001, chapter 6, and the practice of Horacio Vaggione.\n\nEach quantity is set by three controls: its value, its second bound, and its law. ${TRIO_EN}\n\n« Fragments » gives their number, up to ${FRAGMENTS_MAX}.\n\n« Source » states which one each is cut from, counting from one. A number with no connected input falls back to the first.\n\n« Cut » is the place of the cut inside the source, from zero at the start to one at the end.\n\n« Lay » is the instant at which the fragment falls in the result, in seconds. It is this quantity that makes the form: a ramp spreads the cloud, a draw scatters it.\n\n« Length » is that of the laid fragment, in seconds. Below fifty milliseconds the pitch of the fragment stops being heard and it is the grain that speaks.\n\n« Level » is its level. « Pan » its place, from minus one at the left to one at the right, at constant power. « Transposition » its pitch offset in semitones: it reads more or less source without changing the laid length.\n\nTransposition can be driven by a curve. Each fragment reads there the value matching its instant of laying: the cloud falls then rises, and a gesture is heard where a draw gives only a texture. The two modulation bounds state what the curve's zero and one mean; with no curve connected they do nothing.\n\n« Window » decides the shape of each fragment. The Gaussian is the reference of the book; the trapezoid keeps a plateau, hence body; the expodec decays after a brief attack, the rexpodec rises then cuts. The last two give a direction to time inside the fragment.\n\n« Seed » governs the draws. At equal seed, the same score. « Level out » sets the output; density does not affect it, the sum being brought back to the square root of the mean overlap.\n\nThe « Audio » output carries the montage, always in two channels since each fragment carries its place. The « Analysis » output gives the number of fragments laid, those that fell outside their source, the length, the density in fragments per second and the greatest number sounding together.`,
    entrees: [
      ...Array.from({ length: SOURCES }, (_, k) => ({
        nom: `Source ${k + 1}`, nomEn: `Source ${k + 1}`, type: "audio", requis: k === 0,
      })),
      { nom: "Modulation transposition", nomEn: "Transposition modulation", type: "courbe",
        requis: false, module: "Transposition" },
    ],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
    ],
    parametres: [
      { nom: "Fragments", nomEn: "Fragments", type: "curseur", plage: [1, FRAGMENTS_MAX], pas: 1, defaut: 400,
        doc: "Combien de fragments la partition porte.",
        docEn: "How many fragments the score carries." },
      ...trio("Source", "Source", { plage: [1, SOURCES], pas: 1, de: 1, a: SOURCES, loi: "fixe",
        doc: "Dans quelle source le fragment est découpé, à partir de un.",
        docEn: "Which source the fragment is cut from, counting from one." }),
      ...trio("Prise", "Cut", { plage: [0, 1], pas: 0.001, de: 0, a: 1, loi: "tirage",
        doc: "L'endroit de la découpe dans la source, de zéro au début à un à la fin.",
        docEn: "The place of the cut inside the source, from zero at the start to one at the end." }),
      ...trio("Pose", "Lay", { plage: [0, 120], pas: 0.01, de: 0, a: 8, unite: "s", loi: "rampe",
        doc: "L'instant où le fragment tombe dans le résultat.",
        docEn: "The instant at which the fragment falls in the result." }),
      ...trio("Durée", "Length", { plage: [0.002, 2], pas: 0.001, de: 0.04, a: 0.12, unite: "s", loi: "tirage",
        doc: "La durée du fragment posé.", docEn: "The length of the laid fragment." }),
      ...trio("Nuance", "Level", { plage: [0, 1], pas: 0.01, de: 0.3, a: 1, loi: "tirage",
        doc: "Le niveau du fragment.", docEn: "The level of the fragment." }),
      ...trio("Panoramique", "Pan", { plage: [-1, 1], pas: 0.01, de: -1, a: 1, loi: "tirage",
        doc: "La place du fragment, de moins un à gauche à un à droite.",
        docEn: "The place of the fragment, from minus one at the left to one at the right." }),
      ...trio("Transposition", "Transposition", { plage: [-24, 24], pas: 0.1, de: 0, a: 0, loi: "fixe",
        doc: "L'écart de hauteur du fragment, en demi-tons. Une courbe branchée le pilote à la place.",
        docEn: "The pitch offset of the fragment, in semitones. A connected curve drives it instead." }),
      { nom: "Transposition min", nomEn: "Transposition min", modulationDe: "Transposition",
        type: "curseur", plage: [-24, 24], pas: 0.1, defaut: -12,
        doc: "L'écart que vaut le zéro d'une courbe branchée. Sans courbe, ce réglage ne sert pas.",
        docEn: "The offset that a connected curve's zero means. With no curve, this setting does nothing." },
      { nom: "Transposition max", nomEn: "Transposition max", modulationDe: "Transposition",
        type: "curseur", plage: [-24, 24], pas: 0.1, defaut: 12,
        doc: "L'écart que vaut le un de la courbe.", docEn: "The offset that the curve's one means." },
      { nom: "Fenêtre", nomEn: "Window", type: "choix",
        options: FENETRES_FR, optionsEn: FENETRES_EN, optionIds: [...FENETRES],
        defaut: "Gaussienne", defautEn: "Gaussian",
        doc: "La forme de chaque fragment. Les deux exponentielles donnent un sens au temps à l'intérieur du fragment.",
        docEn: "The shape of each fragment. The two exponentials give a direction to time inside the fragment." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 1,
        doc: "Le numéro du tirage. À graine égale, la même partition.",
        docEn: "The number of the draw. At equal seed, the same score." },
      { nom: "Niveau", nomEn: "Level out", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Le niveau du montage. La densité n'y touche pas : la somme est déjà ramenée à la racine du recouvrement moyen.",
        docEn: "The level of the montage. Density does not affect it: the sum is already brought back to the square root of the mean overlap." },
    ],
    async executer(ctx: any) {
      const sources: Float32Array[][] = [];
      for (let i = 0; i < SOURCES; i++) {
        const v = ctx.entree(i);
        if (v instanceof AudioBuffer) {
          sources.push(Array.from({ length: v.numberOfChannels }, (_, c) => v.getChannelData(c)));
        }
      }
      if (sources.length === 0) {
        return {
          valeurs: [null, null], erreur: true,
          message: en() ? "No sound at the inputs." : "Aucun son à l'entrée.",
        };
      }
      const combien = Math.max(1, Math.min(FRAGMENTS_MAX, Math.round(ctx.paramNombre("Fragments", 400))));
      const hasard = tirage(ctx.paramNombre("Graine", 1));
      /** Le champ que décrit le trio d'une grandeur. Le repli suit le défaut de la fiche. */
      const champ = (nom: string, de: number, a: number, loiParDefaut: string): Champ => {
        const debut = ctx.paramNombre(nom, de);
        const fin = ctx.paramNombre(`${nom}, fin`, a);
        const loi = ctx.paramTexte(`${nom}, loi`, loiParDefaut);
        if (loi === "rampe") return { forme: "rampe", de: debut, a: fin };
        if (loi === "tirage") return { forme: "hasard", de: debut, a: fin };
        return { forme: "liste", valeurs: [debut] };
      };
      // LES CHAMPS SE DÉPLOIENT DANS UN ORDRE FIXE, et c'est ce qui rend la graine utile : le même
      // générateur les sert l'un après l'autre, donc deux rendus de mêmes réglages sont identiques.
      const dep = (nom: string, de: number, a: number, loi: string) =>
        deployer(champ(nom, de, a, loi), combien, hasard);
      const source = dep("Source", 1, SOURCES, "fixe").map((v) => Math.round(v) - 1);
      const prise = dep("Prise", 0, 1, "tirage");
      const pose = dep("Pose", 0, 8, "rampe");
      const duree = dep("Durée", 0.04, 0.12, "tirage");
      const nuance = dep("Nuance", 0.3, 1, "tirage");
      const pan = dep("Panoramique", -1, 1, "tirage");
      let transposition = dep("Transposition", 0, 0, "fixe");

      // LA COURBE SE LIT À L'INSTANT DE POSE DE CHAQUE FRAGMENT, et non à son rang : deux fragments
      // posés au même moment doivent recevoir la même transposition, quel que soit l'ordre dans
      // lequel la partition les a produits.
      const sr = (ctx.entree(0) as AudioBuffer).sampleRate;
      const modulation = ctx.entree(SOURCES);
      if (estCourbe(modulation)) {
        const fin = pose.reduce((m, p, i) => Math.max(m, p + duree[i]), 0);
        const n = Math.max(1, Math.ceil(fin * sr));
        const suivie = valeursParametre(modulation, n, 0, {
          min: ctx.paramNombre("Transposition min", -12),
          max: ctx.paramNombre("Transposition max", 12),
        });
        transposition = pose.map((p) => suivie[Math.min(n - 1, Math.max(0, Math.round(p * sr)))]);
      }

      const p = partition({ source, prise, pose, duree, nuance, pan, transposition }, combien);
      const forme = ctx.paramTexte("Fenêtre", "gaussienne") as Fenetre;
      const { canaux, rapport } = poserFragments(sources, p, { forme, sampleRate: sr });

      const niveau = Math.max(0, Math.min(1, ctx.paramNombre("Niveau", 80) / 100));
      const sortie = new AudioBuffer({ numberOfChannels: 2, length: canaux[0].length, sampleRate: sr });
      for (const [c, voie] of canaux.entries()) {
        const cible = sortie.getChannelData(c);
        for (let i = 0; i < voie.length; i++) cible[i] = voie[i] * niveau;
        canaux[c] = cible;
      }

      const crete = Math.max(...canaux.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
      const ecart = transposition.length > 0
        ? Math.max(...transposition) - Math.min(...transposition) : 0;
      const lignes = en() ? [
        `${rapport.poses} fragments laid, ${rapport.ignores} outside their source`,
        `${rapport.duree.toFixed(2)} s, ${rapport.densite.toFixed(1)} fragments per second`,
        `up to ${rapport.recouvrementMax} sounding together, ${rapport.recouvrementMoyen.toFixed(1)} on average`,
        `average length ${rapport.dureeMoyenneMs.toFixed(1)} ms`,
        `transposition spanning ${ecart.toFixed(1)} semitones`,
        `peak ${(20 * Math.log10(Math.max(1e-9, crete))).toFixed(1)} dB`,
      ] : [
        `${rapport.poses} fragments posés, ${rapport.ignores} hors de leur source`,
        `${rapport.duree.toFixed(2)} s, ${rapport.densite.toFixed(1)} fragments par seconde`,
        `jusqu'à ${rapport.recouvrementMax} ensemble, ${rapport.recouvrementMoyen.toFixed(1)} en moyenne`,
        `durée moyenne ${rapport.dureeMoyenneMs.toFixed(1)} ms`,
        `transposition étalée sur ${ecart.toFixed(1)} demi-tons`,
        `crête ${(20 * Math.log10(Math.max(1e-9, crete))).toFixed(1)} dB`,
      ];
      return {
        valeurs: [sortie, lignes.join("\n")],
        message: `${rapport.poses} fragments · ${rapport.densite.toFixed(0)}/s · `
          + `${rapport.duree.toFixed(2)} s · ${(20 * Math.log10(Math.max(1e-9, crete))).toFixed(1)} dB`
          + (estCourbe(modulation) ? ` · ${en() ? "curve" : "courbe"} ${ecart.toFixed(1)} ${en() ? "st" : "dt"}` : ""),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
