// plugins/spectral-cdp.ts — Étirement du spectre, arpège spectral, mélange des fenêtres, crible
// harmonique, filtrage par un spectre, peignes accordés.
//
// Le calcul est dans `audio/spectral-cdp.ts` (vocodeur de phase en amplitude et fréquence) et
// `audio/peigne.ts`. Les notices sont des descriptifs fonctionnels : ce que fait le nœud et comment
// s'en servir, sans le situer par rapport à un autre.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { creerAleatoire } from "../core/hasard";
import { estCourbe, progressionPour, valeursParametre } from "../audio/courbe";
import {
  SAUT, TAILLE, analyserPV, arpegerSpectre, cribler, etirerSpectre, filtrerParSpectre, melangerFenetres, parCanal,
  type Rangs,
} from "../audio/spectral-cdp";
import { peignes } from "../audio/peigne";
import { lireIntervalles } from "./concret";

const en = () => langueCourante() === "en";
const aucuneEntree = () => (en() ? "No audio input." : "Aucune entrée audio.");

/** Une courbe lue trame par trame : la valeur de la courbe à l'instant de la trame t. */
function parTrame(courbe: unknown, a: AudioBuffer, defaut: number, forme: Parameters<typeof valeursParametre>[3]): (t: number) => number {
  if (!estCourbe(courbe)) return () => defaut;
  const nTrames = Math.ceil(a.length / SAUT) + TAILLE / SAUT;
  const v = valeursParametre(courbe, nTrames, defaut, forme);
  return (t) => v[Math.min(v.length - 1, Math.max(0, t))];
}

export const fiches: FicheAudio[] = ([
  {
    id: "etirement-spectre", nom: "Étirement du spectre", nomEn: "Spectrum Stretch",
    univers: "Traitement", famille: "Effets",
    resume: "Écarte ou resserre les partiels au-dessus d'une fréquence pivot : un son harmonique devient inharmonique, progressivement s'il le faut.",
    resumeEn: "Spreads or squeezes the partials above a pivot frequency: a harmonic sound becomes inharmonic, gradually if need be.",
    notice: "Au-dessus de la fréquence pivot, chaque composante f est portée à pivot × (f / pivot)^k, où k est l'étirement. À 1, rien ne bouge. Au-dessus de 1, les partiels s'écartent, d'autant plus qu'ils sont aigus : avec un pivot à 200 Hz et k = 1,5, les harmoniques 400, 600 et 800 Hz arrivent à 566, 1 039 et 1 600 Hz. Au-dessous de 1, ils se resserrent. Ce qui est sous le pivot ne bouge pas : placé sur la fondamentale, il garde la hauteur du son et ne change que son timbre.\n\nUn son harmonique étiré sonne métallique, puis cloché, puis se défait en composantes séparées. Une courbe branchée sur l'entrée Modulation étirement fait varier k au fil du son : c'est ainsi qu'on rend un son progressivement inharmonique, ou qu'on le ramène à l'harmonie.\n\nLe traitement passe par une analyse en amplitude et fréquence de chaque case du spectre, puis une resynthèse qui reconstruit les phases à partir des fréquences déplacées ; la durée du son ne change pas.\n\nD'après le programme « stretch spectrum » du Composers' Desktop Project, et Trevor Wishart, « Audible Design », 1994.",
    noticeEn: "Above the pivot frequency, each component f is moved to pivot × (f / pivot)^k, where k is the stretch. At 1, nothing moves. Above 1, the partials spread apart, the more so the higher they are: with a pivot at 200 Hz and k = 1.5, the harmonics at 400, 600 and 800 Hz land at 566, 1039 and 1600 Hz. Below 1, they squeeze together. What lies under the pivot does not move: set on the fundamental, it keeps the pitch of the sound and changes only its timbre.\n\nA stretched harmonic sound turns metallic, then bell-like, then comes apart into separate components. A curve connected to the Stretch modulation input varies k over the sound: that is how a sound is made gradually inharmonic, or brought back to harmony.\n\nProcessing goes through an amplitude and frequency analysis of each bin of the spectrum, then a resynthesis that rebuilds the phases from the moved frequencies; the duration of the sound does not change.\n\nAfter the « stretch spectrum » program of the Composers' Desktop Project, and Trevor Wishart, « Audible Design », 1994.",
    entrees: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Modulation étirement", nomEn: "Stretch modulation", type: "courbe", requis: false, module: "Étirement" },
    ],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Étirement", nomEn: "Stretch", type: "curseur", plage: [0.5, 2], pas: 0.01, defaut: 1.3,
        doc: "L'exposant k. 1 : aucun changement ; au-dessus, les partiels s'écartent ; au-dessous, ils se resserrent.",
        docEn: "The exponent k. 1: no change; above, the partials spread; below, they squeeze together." },
      { nom: "Pivot", nomEn: "Pivot", type: "curseur", plage: [20, 4000], pas: 1, defaut: 200, unite: "Hz",
        doc: "Fréquence sous laquelle rien ne bouge. Réglée sur la fondamentale du son, elle en garde la hauteur.",
        docEn: "Frequency below which nothing moves. Set on the fundamental of the sound, it keeps its pitch." },
      { nom: "Étirement min", nomEn: "Stretch min", modulationDe: "Étirement", type: "curseur", plage: [0.5, 2], pas: 0.01, defaut: 1,
        doc: "Étirement que vaut le zéro d'une courbe branchée. Sans courbe, ce réglage ne sert pas.",
        docEn: "Stretch that a connected curve's zero means. With no curve, this setting does nothing." },
      { nom: "Étirement max", nomEn: "Stretch max", modulationDe: "Étirement", type: "curseur", plage: [0.5, 2], pas: 0.01, defaut: 1.6,
        doc: "Étirement que vaut le un de la courbe.", docEn: "Stretch that the curve's one means." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: aucuneEntree() };
      const k = parTrame(ctx.entree(1), a, ctx.paramNombre("Étirement", 1.3),
        { min: ctx.paramNombre("Étirement min", 1), max: ctx.paramNombre("Étirement max", 1.6) });
      const pivot = ctx.paramNombre("Pivot", 200);
      return { valeurs: [parCanal(a, (an) => etirerSpectre(an, pivot, k))] };
    },
  },
  {
    id: "arpege-spectral", nom: "Arpège spectral", nomEn: "Spectral Arpeggio",
    univers: "Traitement", famille: "Effets",
    resume: "Une bande étroite parcourt le spectre et ne laisse sonner que les partiels qu'elle touche : un son tenu s'égrène partiel par partiel.",
    resumeEn: "A narrow band sweeps the spectrum and lets only the partials it touches sound: a held sound is picked out partial by partial.",
    notice: "Une bande de fréquences, large de quelques dixièmes d'octave, balaie le spectre entre deux bornes, vers l'aigu, vers le grave ou dans les deux sens. Seules les composantes qu'elle recouvre sonnent. Sur un son tenu riche en partiels — un accord, une voix, un bourdon —, on entend ses partiels l'un après l'autre, comme un arpège que le son contenait.\n\nLa vitesse dit combien de balayages par seconde ; la largeur, combien de partiels sonnent à la fois. Le parcours se fait en octaves, si bien que la bande passe autant de temps dans chaque octave.\n\nLa rémanence laisse sonner un partiel après le passage de la bande : il décroît alors de 60 dB dans le temps donné. À zéro, seul ce que la bande touche sonne ; longue, les partiels s'accumulent et l'arpège devient un accord qui se construit.\n\nD'après le programme « spec arpeg » du Composers' Desktop Project.",
    noticeEn: "A frequency band a few tenths of an octave wide sweeps the spectrum between two bounds, upwards, downwards or both ways. Only the components it covers sound. On a held sound rich in partials - a chord, a voice, a drone - one hears its partials one after another, like an arpeggio the sound contained.\n\nThe speed says how many sweeps per second; the width, how many partials sound at once. The sweep moves in octaves, so the band spends as long in each octave.\n\nThe persistence lets a partial ring on after the band has passed: it then decays by 60 dB over the given time. At zero, only what the band touches sounds; long, the partials pile up and the arpeggio becomes a chord building itself.\n\nAfter the « spec arpeg » program of the Composers' Desktop Project.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Vitesse", nomEn: "Speed", type: "curseur", plage: [0.05, 20], pas: 0.05, defaut: 1, unite: "Hz",
        doc: "Nombre de balayages par seconde.", docEn: "Number of sweeps per second." },
      { nom: "Largeur", nomEn: "Width", type: "curseur", plage: [0.05, 3], pas: 0.05, defaut: 0.5, unite: "oct",
        doc: "Largeur de la bande qui laisse passer, en octaves. Étroite, un partiel à la fois ; large, un groupe.",
        docEn: "Width of the band that lets through, in octaves. Narrow, one partial at a time; wide, a group." },
      { nom: "Bas", nomEn: "Low", type: "curseur", plage: [20, 10000], pas: 1, defaut: 100, unite: "Hz",
        doc: "Bas du parcours.", docEn: "Bottom of the sweep." },
      { nom: "Haut", nomEn: "High", type: "curseur", plage: [40, 20000], pas: 1, defaut: 5000, unite: "Hz",
        doc: "Haut du parcours.", docEn: "Top of the sweep." },
      { nom: "Sens", nomEn: "Direction", type: "choix", options: ["Montant", "Descendant", "Aller-retour"], optionsEn: ["Up", "Down", "Up and down"],
        optionIds: ["montant", "descendant", "aller-retour"], defaut: "Montant", defautEn: "Up",
        doc: "Vers l'aigu, vers le grave, ou dans les deux sens.", docEn: "Upwards, downwards, or both ways." },
      { nom: "Rémanence", nomEn: "Persistence", type: "curseur", plage: [0, 10], pas: 0.05, defaut: 0, unite: "s",
        doc: "Temps qu'un partiel met à perdre 60 dB après le passage de la bande. 0 : il se tait dès qu'elle s'éloigne.",
        docEn: "Time a partial takes to lose 60 dB after the band has passed. 0: it falls silent as soon as the band moves on." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: aucuneEntree() };
      const o = {
        vitesse: ctx.paramNombre("Vitesse", 1), largeur: ctx.paramNombre("Largeur", 0.5),
        bas: ctx.paramNombre("Bas", 100), haut: ctx.paramNombre("Haut", 5000),
        sens: String(ctx.paramTexte("Sens", "montant")) as "montant" | "descendant" | "aller-retour",
        remanence: ctx.paramNombre("Rémanence", 0),
      };
      return { valeurs: [parCanal(a, (an) => arpegerSpectre(an, o))] };
    },
  },
  {
    id: "melange-fenetres", nom: "Mélange des fenêtres", nomEn: "Window Shuffle",
    univers: "Traitement", famille: "Effets",
    resume: "Découpe le son en blocs très brefs et les déplace dans le temps : le son devient un nuage de ses propres instants.",
    resumeEn: "Cuts the sound into very short blocks and moves them in time: the sound becomes a cloud of its own instants.",
    notice: "Le son est découpé en blocs de quelques dizaines de millisecondes, et chaque bloc est déplacé dans le temps, d'au plus la portée. À portée nulle, rien ne bouge. Courte, le son se brouille sur place : une phrase reste reconnaissable mais frémit. Longue, les instants se mêlent sur toute la durée, et le son devient une texture qui garde son timbre et perd son déroulement.\n\nLa durée des blocs règle le grain : brefs, ils se fondent en une matière continue ; longs, on reconnaît des fragments qui s'échangent. Chaque bloc est resynthétisé avec des phases qui conviennent à sa nouvelle place, si bien que les raccords ne claquent pas.\n\nLe son garde sa durée, et rien n'est perdu ni répété : chaque instant du son est entendu une fois, ailleurs. À graine égale, le même mélange.\n\nD'après le programme « blur shuffle » du Composers' Desktop Project.",
    noticeEn: "The sound is cut into blocks a few tens of milliseconds long, and each block is moved in time, by at most the range. At zero range, nothing moves. Short, the sound blurs in place: a phrase stays recognisable but shivers. Long, the instants mix over the whole duration, and the sound becomes a texture that keeps its timbre and loses its unfolding.\n\nThe block length sets the grain: short, they melt into a continuous matter; long, one recognises fragments trading places. Each block is resynthesised with phases suited to its new place, so the joins do not click.\n\nThe sound keeps its duration, and nothing is lost or repeated: every instant of the sound is heard once, elsewhere. Same seed, same shuffle.\n\nAfter the « blur shuffle » program of the Composers' Desktop Project.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Durée des blocs", nomEn: "Block length", type: "curseur", plage: [12, 2000], pas: 1, defaut: 50, unite: "ms",
        doc: "Longueur d'un bloc déplacé. Brefs, une matière continue ; longs, des fragments reconnaissables.",
        docEn: "Length of a moved block. Short, a continuous matter; long, recognisable fragments." },
      { nom: "Portée", nomEn: "Range", type: "curseur", plage: [0, 60], pas: 0.05, defaut: 1, unite: "s",
        doc: "De combien un bloc peut s'éloigner de sa place. 0 : aucun déplacement.",
        docEn: "How far a block can move from its place. 0: no movement." },
      { nom: "Graine", nomEn: "Seed", plage: [1, 999999], pas: 1, defaut: 42,
        doc: "À graine égale, le même mélange.", docEn: "Same seed, same shuffle." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: aucuneEntree() };
      const tramesParBloc = Math.max(1, Math.round((ctx.paramNombre("Durée des blocs", 50) / 1000) * a.sampleRate / SAUT));
      const porteeBlocs = (ctx.paramNombre("Portée", 1) * a.sampleRate / SAUT) / tramesParBloc;
      const graine = ctx.paramNombre("Graine", 42);
      // Chaque canal reçoit le même mélange : sans quoi l'image stéréo se déchirerait.
      return { valeurs: [parCanal(a, (an) => melangerFenetres(an, tramesParBloc, porteeBlocs, creerAleatoire(graine)))] };
    },
  },
  {
    id: "crible-harmonique", nom: "Crible harmonique", nomEn: "Harmonic Sieve",
    univers: "Traitement", famille: "Effets",
    resume: "Ne garde — ou retire — que les composantes proches de certaines harmoniques d'une fondamentale : un bruit devient un accord, un son perd ses pairs.",
    resumeEn: "Keeps - or removes - only the components near chosen harmonics of a fundamental: a noise becomes a chord, a sound loses its even partials.",
    notice: "Le crible est une série harmonique : la fondamentale et ses multiples, dont on choisit les rangs — tous, les impairs, les pairs, les premiers, ou une liste écrite. Chaque composante du son proche d'un rang retenu passe ; les autres sont supprimées. En mode retirer, c'est l'inverse.\n\nSur un bruit, le crible découpe un accord : le souffle prend la hauteur de la fondamentale et le timbre des rangs choisis — les impairs donnent un son creux, de clarinette ; les premiers, un son étrange, clairsemé vers l'aigu. Sur un son harmonique de même fondamentale, on en retire des partiels, ou on n'en garde que certains. Sur un son d'une autre hauteur, seules survivent les rencontres.\n\nLa tolérance, en cents, dit à quelle distance d'une harmonique une composante passe encore : étroite, le résultat est pur et sifflant ; large, il garde de la matière autour de chaque partiel. La fondamentale peut suivre une courbe : le crible glisse alors, et l'accord découpé avec lui.\n\nD'après le programme « spec pick » du Composers' Desktop Project.",
    noticeEn: "The sieve is a harmonic series: the fundamental and its multiples, whose ranks one chooses - all, odd, even, primes, or a written list. Each component of the sound near a kept rank passes; the others are removed. In remove mode, the reverse.\n\nOn a noise, the sieve cuts out a chord: the breath takes on the pitch of the fundamental and the timbre of the chosen ranks - odd ones give a hollow, clarinet-like sound; primes, a strange sound, sparse towards the top. On a harmonic sound with the same fundamental, partials are removed, or only some kept. On a sound of another pitch, only the meeting points survive.\n\nThe tolerance, in cents, says how far from a harmonic a component still passes: narrow, the result is pure and whistling; wide, it keeps some matter around each partial. The fundamental can follow a curve: the sieve then glides, and the chord it cuts glides with it.\n\nAfter the « spec pick » program of the Composers' Desktop Project.",
    entrees: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Modulation fondamentale", nomEn: "Fundamental modulation", type: "courbe", requis: false, module: "Fondamentale" },
    ],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Fondamentale", nomEn: "Fundamental", type: "curseur", plage: [20, 2000], pas: 0.5, defaut: 110, unite: "Hz",
        doc: "Fondamentale de la série harmonique qui forme le crible.", docEn: "Fundamental of the harmonic series that forms the sieve." },
      { nom: "Rangs", nomEn: "Ranks", type: "choix", options: ["Tous", "Impairs", "Pairs", "Premiers", "Liste"],
        optionsEn: ["All", "Odd", "Even", "Primes", "List"], optionIds: ["tous", "impairs", "pairs", "premiers", "liste"], defaut: "Tous", defautEn: "All",
        doc: "Les harmoniques retenues. Premiers : 1, 2, 3, 5, 7, 11… Liste : les rangs écrits ci-dessous.",
        docEn: "The harmonics kept. Primes: 1, 2, 3, 5, 7, 11... List: the ranks written below." },
      { nom: "Liste des rangs", nomEn: "Rank list", type: "texte", defaut: "1 2 3 5 8 13", placeholder: "1 3 5 7", placeholderEn: "1 3 5 7",
        doc: "Pour « Liste » : les rangs retenus, séparés par des espaces ou des virgules.",
        docEn: "For « List »: the ranks kept, separated by spaces or commas." },
      { nom: "Tolérance", nomEn: "Tolerance", type: "curseur", plage: [2, 200], pas: 1, defaut: 30, unite: "cents",
        doc: "Distance à une harmonique en deçà de laquelle une composante passe.", docEn: "Distance from a harmonic within which a component passes." },
      { nom: "Mode", nomEn: "Mode", type: "choix", options: ["Garder", "Retirer"], optionsEn: ["Keep", "Remove"], optionIds: ["garder", "retirer"],
        defaut: "Garder", defautEn: "Keep",
        doc: "Garder : seules les harmoniques retenues passent. Retirer : elles seules sont ôtées.",
        docEn: "Keep: only the kept harmonics pass. Remove: only they are taken out." },
      { nom: "Fondamentale min", nomEn: "Fundamental min", modulationDe: "Fondamentale", type: "curseur", plage: [20, 2000], pas: 0.5, defaut: 55, unite: "Hz",
        doc: "Fondamentale que vaut le zéro d'une courbe branchée ; la course se parcourt en multipliant. Sans courbe, ce réglage ne sert pas.",
        docEn: "Fundamental that a connected curve's zero means; the travel is multiplicative. With no curve, this setting does nothing." },
      { nom: "Fondamentale max", nomEn: "Fundamental max", modulationDe: "Fondamentale", type: "curseur", plage: [20, 2000], pas: 0.5, defaut: 220, unite: "Hz",
        doc: "Fondamentale que vaut le un de la courbe.", docEn: "Fundamental that the curve's one means." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: aucuneEntree() };
      const f0 = parTrame(ctx.entree(1), a, ctx.paramNombre("Fondamentale", 110), {
        min: ctx.paramNombre("Fondamentale min", 55), max: ctx.paramNombre("Fondamentale max", 220), ...progressionPour({ unite: "Hz" }),
      });
      const choix = String(ctx.paramTexte("Rangs", "tous"));
      const rangs: Rangs = choix === "liste"
        ? lireIntervalles(ctx.paramTexte("Liste des rangs", "1 2 3 5 8 13")).map(Math.round).filter((r) => r >= 1)
        : (choix as Rangs);
      const inverse = String(ctx.paramTexte("Mode", "garder")) === "retirer";
      const tol = ctx.paramNombre("Tolérance", 30);
      return { valeurs: [parCanal(a, (an) => cribler(an, f0, rangs, tol, inverse))] };
    },
  },
  {
    id: "filtrage-spectre", nom: "Filtrage par un spectre", nomEn: "Filter by Spectrum",
    univers: "Traitement", famille: "Effets",
    resume: "Filtre un son par le spectre d'un autre, instant par instant : les partiels du second découpent le premier, ou sa couleur s'y imprime.",
    resumeEn: "Filters one sound by another's spectrum, moment by moment: the partials of the second carve the first, or its colour is printed on it.",
    notice: "À chaque instant, chaque composante du premier son est multipliée par l'importance de la même fréquence dans le second. Ce qui est fort dans le second passe ; ce qui y est absent est retiré du premier. Le premier son garde son déroulement et sa matière ; le second lui impose ses hauteurs ou sa couleur.\n\nSans lissage, ce sont les partiels du second qui découpent le premier : un bruit filtré par une note prend la hauteur et le timbre de cette note, un bruit de pas filtré par un accord se met à sonner l'accord. Avec lissage, le second n'impose plus que son enveloppe spectrale — ses formants, sa brillance — et le premier son garde ses propres hauteurs : une matière qui prend la couleur d'une voix.\n\nLa profondeur dose l'effet, de 0 (le premier son intact) à 100 %. Si le second son est plus court, il est lu en boucle. La durée de sortie est celle du premier son.\n\nD'après les opérations de combinaison de spectres du Composers' Desktop Project (« combine »), et Trevor Wishart, « Audible Design », 1994.",
    noticeEn: "At each moment, each component of the first sound is multiplied by the weight of the same frequency in the second. What is strong in the second passes; what is absent from it is removed from the first. The first sound keeps its unfolding and its matter; the second imposes its pitches or its colour on it.\n\nWithout smoothing, the partials of the second carve the first: a noise filtered by a note takes on that note's pitch and timbre, footsteps filtered by a chord start sounding the chord. With smoothing, the second imposes only its spectral envelope - its formants, its brightness - and the first sound keeps its own pitches: a matter taking on the colour of a voice.\n\nThe depth doses the effect, from 0 (the first sound untouched) to 100%. If the second sound is shorter, it is read in a loop. The output lasts as long as the first sound.\n\nAfter the spectrum combination operations of the Composers' Desktop Project (« combine »), and Trevor Wishart, « Audible Design », 1994.",
    entrees: [
      { nom: "Son", nomEn: "Sound", type: "audio" },
      { nom: "Filtre", nomEn: "Filter", type: "audio" },
    ],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Part du filtrage. 0 : le son intact ; 100 % : entièrement filtré.", docEn: "Share of the filtering. 0: the sound untouched; 100%: fully filtered." },
      { nom: "Lissage", nomEn: "Smoothing", type: "curseur", plage: [0, 1000], pas: 10, defaut: 0, unite: "Hz",
        doc: "Largeur sur laquelle le spectre du filtre est moyenné. 0 : ses partiels découpent le son ; quelques centaines de hertz : seule son enveloppe, sa couleur, s'imprime.",
        docEn: "Width over which the filter's spectrum is averaged. 0: its partials carve the sound; a few hundred hertz: only its envelope, its colour, is printed." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0), b = ctx.entree(1);
      if (!(a instanceof AudioBuffer) || !(b instanceof AudioBuffer)) {
        return { valeurs: [null], message: en() ? "A sound and a filter are needed." : "Il faut un son et un filtre." };
      }
      const profondeur = ctx.paramNombre("Profondeur", 100) / 100;
      const cases = Math.round(ctx.paramNombre("Lissage", 0) / (a.sampleRate / TAILLE));
      const filtres = Array.from({ length: b.numberOfChannels }, (_, c) => analyserPV(b.getChannelData(c), a.sampleRate));
      return { valeurs: [parCanal(a, (an, c) => filtrerParSpectre(an, filtres[Math.min(c, filtres.length - 1)], profondeur, cases))] };
    },
  },
  {
    id: "peignes-accordes", nom: "Peignes accordés", nomEn: "Tuned Combs",
    univers: "Traitement", famille: "Effets",
    memoire: "flux", // lignes à retard bornées par la note la plus grave
    resume: "Des filtres en peigne accordés sur une note ou un accord : le son d'entrée résonne comme une corde, à la note et à toutes ses harmoniques.",
    resumeEn: "Comb filters tuned to a note or a chord: the input sound rings like a string, at the note and all its harmonics.",
    notice: "Un filtre en peigne renvoie le son dans une boucle dont la durée est la période d'une note : ce qui revient en phase se renforce, et le filtre résonne à cette note et à toutes ses harmoniques, comme une corde. Chaque note de l'accord est un peigne ; le son d'entrée les fait vibrer. Un bruit devient une corde frottée, une percussion une corde frappée, une voix un chœur de cordes sympathiques.\n\nLa résonance se règle en secondes : le temps qu'il faut à un peigne pour perdre 60 dB, le même pour une note grave et pour une aiguë. L'amortissement éteint les harmoniques aiguës avant la fondamentale, comme sur une vraie corde : à zéro, le son reste brillant et métallique ; élevé, il s'arrondit. Les peignes restent accordés quel que soit l'amortissement.\n\nL'accord s'écrit en demi-tons au-dessus de la fondamentale : « 0 » pour une seule note, « 0 7 » pour une quinte, « 0 4 7 » pour un accord parfait. La fondamentale peut suivre une courbe : l'accord entier glisse alors, et les cordes avec lui. Une queue de la durée de la résonance laisse les peignes s'éteindre ; le niveau de sortie est ramené à celui de l'entrée.\n\nD'après Julius O. Smith III, « Physical Audio Signal Processing », 2010, et l'accord des cordes de Karplus et Strong par David Jaffe et Julius O. Smith, Computer Music Journal 7(2), 1983.",
    noticeEn: "A comb filter sends the sound round a loop whose length is the period of a note: what comes back in phase is reinforced, and the filter rings at that note and all its harmonics, like a string. Each note of the chord is a comb; the input sound sets them vibrating. A noise becomes a bowed string, a percussion a struck string, a voice a choir of sympathetic strings.\n\nResonance is set in seconds: the time a comb takes to lose 60 dB, the same for a low note and a high one. Damping dies away the high harmonics before the fundamental, as on a real string: at zero, the sound stays bright and metallic; high, it rounds off. The combs stay in tune whatever the damping.\n\nThe chord is written in semitones above the fundamental: « 0 » for a single note, « 0 7 » for a fifth, « 0 4 7 » for a major triad. The fundamental can follow a curve: the whole chord then glides, and the strings with it. A tail as long as the resonance lets the combs die away; the output level is brought back to that of the input.\n\nAfter Julius O. Smith III, « Physical Audio Signal Processing », 2010, and the tuning of Karplus-Strong strings by David Jaffe and Julius O. Smith, Computer Music Journal 7(2), 1983.",
    entrees: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Modulation fondamentale", nomEn: "Fundamental modulation", type: "courbe", requis: false, module: "Fondamentale" },
    ],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Fondamentale", nomEn: "Fundamental", type: "curseur", plage: [20, 2000], pas: 0.5, defaut: 110, unite: "Hz",
        doc: "Note du premier peigne ; les autres s'en déduisent par l'accord.", docEn: "Note of the first comb; the others follow from it through the chord." },
      { nom: "Accord", nomEn: "Chord", type: "texte", defaut: "0 7 12", placeholder: "0 4 7", placeholderEn: "0 4 7",
        doc: "Les notes, en demi-tons au-dessus de la fondamentale, séparées par des espaces ou des virgules. « 0 » : une seule note.",
        docEn: "The notes, in semitones above the fundamental, separated by spaces or commas. « 0 »: a single note." },
      { nom: "Résonance", nomEn: "Resonance", type: "curseur", plage: [0.05, 20], pas: 0.05, defaut: 3, unite: "s",
        doc: "Temps qu'il faut à un peigne pour perdre 60 dB.", docEn: "Time a comb takes to lose 60 dB." },
      { nom: "Amortissement", nomEn: "Damping", type: "curseur", plage: [0, 95], pas: 1, defaut: 20, unite: "%",
        doc: "Perte des aigus à chaque tour de boucle. 0 : brillant, métallique ; élevé : rond, étouffé.",
        docEn: "Loss of highs on each trip round the loop. 0: bright, metallic; high: round, muffled." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Part du son résonné. À 0 %, l'entrée seule.", docEn: "Share of the resonated sound. At 0%, the input alone." },
      { nom: "Fondamentale min", nomEn: "Fundamental min", modulationDe: "Fondamentale", type: "curseur", plage: [20, 2000], pas: 0.5, defaut: 55, unite: "Hz",
        doc: "Fondamentale que vaut le zéro d'une courbe branchée ; la course se parcourt en multipliant. Sans courbe, ce réglage ne sert pas.",
        docEn: "Fundamental that a connected curve's zero means; the travel is multiplicative. With no curve, this setting does nothing." },
      { nom: "Fondamentale max", nomEn: "Fundamental max", modulationDe: "Fondamentale", type: "curseur", plage: [20, 2000], pas: 0.5, defaut: 220, unite: "Hz",
        doc: "Fondamentale que vaut le un de la courbe.", docEn: "Fundamental that the curve's one means." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: aucuneEntree() };
      const f0 = ctx.paramNombre("Fondamentale", 110);
      const t60 = ctx.paramNombre("Résonance", 3);
      const notes = lireIntervalles(ctx.paramTexte("Accord", "0 7 12"));
      const frequences = (notes.length ? notes : [0]).map((st) => f0 * Math.pow(2, st / 12));
      const courbe = ctx.entree(1);
      const n = a.length + Math.round(Math.min(20, Math.max(0.01, t60)) * a.sampleRate);
      const transpositions = estCourbe(courbe)
        ? Float32Array.from(valeursParametre(courbe, n, f0, {
            min: ctx.paramNombre("Fondamentale min", 55), max: ctx.paramNombre("Fondamentale max", 220), ...progressionPour({ unite: "Hz" }),
          }), (f) => f / f0)
        : null;
      const y = peignes(a, { frequences, t60, amortissement: ctx.paramNombre("Amortissement", 20), mix: ctx.paramNombre("Mix", 100), transpositions });
      return { valeurs: [y], message: `${frequences.length} ${en() ? (frequences.length > 1 ? "combs" : "comb") : (frequences.length > 1 ? "peignes" : "peigne")}` };
    },
  },
] as FicheAudio[]).map(avecDoc);
