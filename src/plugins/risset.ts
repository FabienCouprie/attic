// plugins/risset.ts — Les deux illusions de Risset, réunies parce que c'est le
// même phénomène sur deux axes : « Glissando » fait descendre (ou monter) la
// hauteur sans fin, « Rythme » fait accélérer (ou ralentir) la pulsation sans
// fin. Voir audio/risset.ts pour le principe et la dualité qui les relie.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "glissando-risset", nom: "Glissando de Risset", nomEn: "Risset Glissando",
    univers: "Traitement", famille: "Effets",
    resume: "Transforme un son en hauteur qui descend (ou monte) sans fin.",
    resumeEn: "Turns a sound into a pitch that falls (or rises) endlessly.",
    notice: "Illusion auditive décrite par Jean-Claude Risset, version continue du son étagé de Shepard — l'équivalent sonore de l'escalier sans fin d'Escher. Le nœud superpose plusieurs copies du son fourni, espacées d'une octave, qui glissent toutes ensemble ; une copie qui atteint le haut de l'étendue s'est déjà éteinte, et celle qui réapparaît en bas est encore inaudible, si bien que le saut ne s'entend jamais. Chaque copie est relue à vitesse variable, comme une bande magnétique : la hauteur et le débit changent ensemble, et le son est bouclé pour alimenter le glissando aussi longtemps que demandé. Fonctionne d'autant mieux que la source est riche et peu rythmée — une nappe, une voix tenue, un bruit coloré ; sur une boucle très marquée, on entend surtout la boucle.",
    noticeEn: "Auditory illusion described by Jean-Claude Risset, the continuous version of Shepard's stepped tone — the sonic equivalent of Escher's endless staircase. The node layers several copies of the input, spaced one octave apart, all gliding together; a copy reaching the top of the range has already faded out, and the one reappearing at the bottom is still inaudible, so the jump is never heard. Each copy is replayed at a varying speed, like tape: pitch and tempo change together, and the sound is looped to feed the glissando for as long as requested. Works best on rich, loosely rhythmic material — a pad, a sustained voice, coloured noise; on a strongly patterned loop you mostly hear the loop.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Sens", nomEn: "Direction", type: "choix",
        options: ["Descendant", "Ascendant"], optionsEn: ["Falling", "Rising"],
        optionIds: ["descendant", "ascendant"],
        defaut: "descendant", defautEn: "descendant",
        doc: "Sens du mouvement perçu. « Descendant » est la version classique : la hauteur semble tomber indéfiniment.",
        docEn: "Perceived direction of motion. \"Falling\" is the classic version: the pitch seems to drop forever." },
      { nom: "Mode", nomEn: "Mode", type: "choix",
        options: ["Bande (hauteur + tempo)", "Hauteur seule (tempo conservé)"],
        optionsEn: ["Tape (pitch + tempo)", "Pitch only (tempo kept)"],
        optionIds: ["bande", "hauteur"],
        defaut: "bande", defautEn: "bande",
        doc: "« Bande » relit le son plus ou moins vite, comme une bande magnétique : la hauteur et le débit glissent ensemble. C'est la version historique, et la plus propre — aucun artefact, puisqu'on ne fait que lire. « Hauteur seule » transpose par grains superposés en laissant le tempo intact : indispensable sur une source rythmée, au prix des artefacts granulaires, d'autant plus audibles que la transposition est ample.",
        docEn: "\"Tape\" replays the sound faster or slower, like tape: pitch and tempo glide together. This is the historical version, and the cleanest — no artefacts, since it only reads. \"Pitch only\" transposes with overlapping grains while leaving the tempo intact: essential on rhythmic material, at the cost of granular artefacts, the more audible the wider the transposition." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [1, 300], pas: 1, defaut: 20, unite: "s",
        doc: "Durée du son produit. Le glissando étant sans fin, elle ne dépend pas de la source : c'est vous qui décidez quand couper.",
        docEn: "Length of the produced sound. The glissando being endless, it does not depend on the source: you decide when to cut." },
      { nom: "Cycle", nomEn: "Cycle", type: "nombre", plage: [0.5, 60], pas: 0.5, defaut: 8, unite: "s",
        doc: "Temps que met une voix pour parcourir une octave. Court = glissando rapide et vertigineux ; long = dérive lente, illusion plus trompeuse.",
        docEn: "Time for one voice to travel one octave. Short = fast, dizzying glissando; long = slow drift, more convincing illusion." },
      { nom: "Octaves", nomEn: "Octaves", type: "nombre", plage: [3, 10], pas: 1, defaut: 6,
        doc: "Étendue du glissando, et donc nombre de copies superposées (une par octave). Peu d'octaves = son plus maigre mais illusion plus serrée ; beaucoup = nappe dense, plus lourde à calculer.",
        docEn: "Range of the glissando, hence the number of layered copies (one per octave). Few octaves = thinner sound but tighter illusion; many = dense pad, heavier to compute." },
      { nom: "Taille de grain", nomEn: "Grain size", type: "nombre", plage: [10, 200], pas: 5, defaut: 60, unite: "ms",
        doc: "Sans effet en mode « Bande ». En mode « Hauteur seule », longueur des grains de transposition : court = réaction plus vive mais son plus haché, long = son plus lisse mais qui traîne et brouille les attaques.",
        docEn: "No effect in \"Tape\" mode. In \"Pitch only\" mode, length of the transposition grains: short = snappier but choppier, long = smoother but smeary, blurring attacks." },
      { nom: "Fondu de boucle", nomEn: "Loop crossfade", type: "nombre", plage: [0, 500], pas: 5, defaut: 50, unite: "ms",
        doc: "Fondu enchaîné appliqué pour rendre la source bouclable sans clic. À monter si la source a des bouts francs, à baisser si elle est très courte.",
        docEn: "Crossfade applied to make the source loop without a click. Raise it if the source has abrupt ends, lower it if the source is very short." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { glissandoRisset } = await import("../audio/risset");
      const sens = ctx.paramTexte("Sens", "descendant");
      const dureeSec = ctx.paramNombre("Durée", 20);
      const cycleSec = ctx.paramNombre("Cycle", 8);
      const octaves = ctx.paramNombre("Octaves", 6);
      const mode = ctx.paramTexte("Mode", "bande") === "hauteur" ? "hauteur" : "bande";
      const out = glissandoRisset(a, {
        dureeSec, cycleSec, octaves,
        montant: sens === "ascendant",
        mode,
        grainSec: ctx.paramNombre("Taille de grain", 60) / 1000,
        fonduBoucleSec: ctx.paramNombre("Fondu de boucle", 50) / 1000,
      });
      return {
        valeurs: [out],
        message: traduire("msg.risset_var_0_var_1_var_2_var_3",
          traduire(sens === "ascendant" ? "risset.ascendant" : "risset.descendant"),
          cycleSec, octaves,
          traduire(mode === "hauteur" ? "risset.mode.hauteur" : "risset.mode.bande")),
      };
    },
  },
  {
    id: "rythme-risset", nom: "Rythme de Risset", nomEn: "Risset Rhythm",
    univers: "Traitement", famille: "Effets",
    resume: "Transforme une boucle en pulsation qui accélère (ou ralentit) sans fin.",
    resumeEn: "Turns a loop into a pulse that speeds up (or slows down) endlessly.",
    notice: "Le jumeau rythmique du « Glissando de Risset » : exactement la même illusion, transposée de l'axe des hauteurs à celui du temps. Le nœud superpose plusieurs copies du son dont les tempos sont dans un rapport de 2, toutes en train d'accélérer ; une couche devenue trop rapide s'est déjà tue, celle qui réapparaît lente est encore inaudible, si bien que le saut ne s'entend jamais et que l'accélération paraît sans fin. La HAUTEUR, elle, ne bouge pas d'un iota — c'est ce qui distingue cet effet du glissando : la transposition se fait par grains dont seule l'ancre accélère, la lecture à l'intérieur restant à vitesse normale. Donnez-lui une boucle rythmique nette (batterie, motif percussif, arpège) : c'est sur une pulsation identifiable que l'illusion opère. Sur une nappe continue, il ne se passe pour ainsi dire rien.",
    noticeEn: "The rhythmic twin of \"Risset Glissando\": the very same illusion, moved from the pitch axis to the time axis. The node layers several copies of the sound whose tempos are in a 2:1 ratio, all speeding up; a layer that has become too fast has already faded out, the one reappearing slow is still inaudible, so the jump is never heard and the acceleration seems endless. PITCH, however, does not move at all — that is what separates this from the glissando: grains are used whose anchor alone accelerates, while reading inside each grain stays at normal speed. Feed it a clear rhythmic loop (drums, a percussive pattern, an arpeggio): the illusion needs an identifiable pulse. On a continuous pad, next to nothing happens.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Sens", nomEn: "Direction", type: "choix",
        options: ["Accélérant", "Ralentissant"], optionsEn: ["Speeding up", "Slowing down"],
        optionIds: ["accelerant", "ralentissant"],
        defaut: "accelerant", defautEn: "accelerant",
        doc: "Sens du mouvement perçu. « Accélérant » est la version la plus saisissante : la pulsation semble se précipiter indéfiniment.",
        docEn: "Perceived direction. \"Speeding up\" is the more striking version: the pulse seems to rush forward forever." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [1, 300], pas: 1, defaut: 20, unite: "s",
        doc: "Durée du son produit. L'accélération étant sans fin, c'est vous qui décidez quand couper.",
        docEn: "Length of the produced sound. The acceleration being endless, you decide when to cut." },
      { nom: "Cycle", nomEn: "Cycle", type: "nombre", plage: [1, 60], pas: 0.5, defaut: 10, unite: "s",
        doc: "Temps que met une couche pour DOUBLER de tempo. Court = emballement vertigineux ; long = dérive lente, illusion plus trompeuse.",
        docEn: "Time for one layer to DOUBLE its tempo. Short = dizzying rush; long = slow drift, more convincing illusion." },
      { nom: "Couches", nomEn: "Layers", type: "nombre", plage: [3, 8], pas: 1, defaut: 5,
        doc: "Nombre de copies superposées, et donc étendue des tempos (chaque couche va deux fois plus vite que la précédente). Peu de couches = rythme plus lisible ; beaucoup = texture dense, plus lourde à calculer.",
        docEn: "Number of layered copies, hence the tempo range (each layer runs twice as fast as the previous one). Few layers = clearer rhythm; many = dense texture, heavier to compute." },
      { nom: "Taille de grain", nomEn: "Grain size", type: "nombre", plage: [10, 200], pas: 5, defaut: 60, unite: "ms",
        doc: "Longueur des grains. Court = attaques mieux préservées mais son plus haché ; long = son plus lisse mais attaques brouillées — à surveiller sur une source percussive.",
        docEn: "Grain length. Short = attacks better preserved but choppier; long = smoother but attacks get smeared — worth watching on percussive material." },
      { nom: "Fondu de boucle", nomEn: "Loop crossfade", type: "nombre", plage: [0, 500], pas: 5, defaut: 50, unite: "ms",
        doc: "Fondu enchaîné appliqué pour rendre la source bouclable sans clic. À monter si la source a des bouts francs.",
        docEn: "Crossfade applied to make the source loop without a click. Raise it if the source has abrupt ends." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { rythmeRisset } = await import("../audio/risset");
      const sens = ctx.paramTexte("Sens", "accelerant");
      const cycleSec = ctx.paramNombre("Cycle", 10);
      const couches = ctx.paramNombre("Couches", 5);
      const out = rythmeRisset(a, {
        dureeSec: ctx.paramNombre("Durée", 20),
        cycleSec,
        octaves: couches,
        montant: sens !== "ralentissant",
        grainSec: ctx.paramNombre("Taille de grain", 60) / 1000,
        fonduBoucleSec: ctx.paramNombre("Fondu de boucle", 50) / 1000,
      });
      return {
        valeurs: [out],
        message: traduire("msg.rythme_risset_var_0_var_1_var_2",
          traduire(sens === "ralentissant" ? "risset.ralentissant" : "risset.accelerant"),
          cycleSec, couches),
      };
    },
  },
  {
    id: "cloche-risset", nom: "Cloche de Risset", nomEn: "Risset Bell",
    // « Entrées » et non « Traitement » : ce nœud n'a aucune entrée, il produit
    // un son de toutes pièces. Sa place est parmi les sources, avec les autres
    // générateurs.
    univers: "Entrées", famille: "Génération",
    resume: "Synthétise une cloche par addition de partiels inharmoniques.",
    resumeEn: "Synthesises a bell by adding inharmonic partials.",
    notice: "Le timbre du « Introductory Catalogue of Computer Synthesized Sounds » de Jean-Claude Risset (Bell Labs, 1969), qui a fait école pour une raison précise : il a montré qu'un timbre n'est pas un spectre figé mais une ÉVOLUTION. Une cloche ne sonne pas cloche parce qu'elle contient telles fréquences, mais parce que ses onze partiels s'éteignent à des vitesses DIFFÉRENTES — les aigus en un dixième du temps que mettent les graves. Second enseignement, que le paramètre « Inharmonicité » permet d'entendre : aucun partiel n'est un multiple entier de la fréquence de base, ce qui explique qu'une cloche n'ait pas de hauteur franche. Ramenez ce réglage à 0 % et les mêmes partiels, rangés sur les harmoniques, cessent instantanément de sonner comme une cloche. Enfin, deux partiels sont doublés à 1 Hz et 1,7 Hz d'écart : ce désaccord minuscule les fait battre lentement, et c'est ce battement qui donne à la cloche sa vie — le paramètre « Battement » permet de le couper pour l'entendre disparaître. La fréquence indiquée n'est PAS la hauteur perçue, puisque aucun partiel ne s'y trouve.",
    noticeEn: "The timbre from Jean-Claude Risset's \"Introductory Catalogue of Computer Synthesized Sounds\" (Bell Labs, 1969), influential for a precise reason: it showed that timbre is not a fixed spectrum but an EVOLUTION. A bell sounds like a bell not because it contains particular frequencies, but because its eleven partials die away at DIFFERENT rates — the highest in a tenth of the time the lowest take. A second lesson, which the \"Inharmonicity\" parameter lets you hear: no partial is an integer multiple of the base frequency, which is why a bell has no definite pitch. Set it to 0% and the same partials, snapped onto the harmonics, instantly stop sounding like a bell. Finally, two partials are doubled 1 Hz and 1.7 Hz apart: that tiny detuning makes them beat slowly, and this beating is what gives the bell its life — the \"Beating\" parameter lets you switch it off and hear it vanish. The stated frequency is NOT the perceived pitch, since no partial sits on it.",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Fréquence", nomEn: "Frequency", type: "nombre", plage: [40, 2000], pas: 1, defaut: 400, unite: "Hz",
        doc: "Fréquence de référence dont les onze partiels sont déduits. Ce n'est pas la hauteur perçue : aucun partiel ne tombe dessus.",
        docEn: "Reference frequency from which the eleven partials are derived. Not the perceived pitch: no partial sits on it." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [0.2, 30], pas: 0.1, defaut: 8, unite: "s",
        doc: "Durée de la note, c'est-à-dire du partiel qui tient le plus longtemps. Les autres s'éteignent avant, en proportion fixe.",
        docEn: "Length of the note, i.e. of the longest-lasting partial. The others fade sooner, in fixed proportion." },
      { nom: "Partiels", nomEn: "Partials", type: "nombre", plage: [1, 11], pas: 1, defaut: 11,
        doc: "Nombre de partiels retenus, du plus grave au plus aigu. Réduire appauvrit le timbre — utile pour entendre ce que chacun apporte.",
        docEn: "Number of partials kept, from lowest to highest. Reducing thins the timbre — useful to hear what each one contributes." },
      { nom: "Inharmonicité", nomEn: "Inharmonicity", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "100 % = les rapports de Risset, inharmoniques. 0 % = chaque partiel ramené sur l'harmonique entier le plus proche : la cloche disparaît et laisse un son d'orgue. C'est la démonstration la plus directe de ce qui fait une cloche.",
        docEn: "100% = Risset's inharmonic ratios. 0% = each partial snapped onto the nearest integer harmonic: the bell vanishes, leaving an organ-like tone. The most direct demonstration of what makes a bell." },
      { nom: "Battement", nomEn: "Beating", type: "curseur", plage: [0, 400], pas: 5, defaut: 100, unite: "%",
        doc: "Échelle des désaccords de 1 Hz et 1,7 Hz appliqués aux partiels doublés. 0 % = plus aucun battement, son figé ; au-delà de 100 %, le battement s'accélère jusqu'à devenir une rugosité.",
        docEn: "Scale of the 1 Hz and 1.7 Hz detunings applied to the doubled partials. 0% = no beating, a static tone; above 100% the beating speeds up until it turns into roughness." },
    ],
    async executer(ctx: any) {
      const { clocheRisset } = await import("../audio/cloche-risset");
      const frequenceHz = ctx.paramNombre("Fréquence", 400);
      const dureeSec = ctx.paramNombre("Durée", 8);
      const partiels = ctx.paramNombre("Partiels", 11);
      const inharmonicite = ctx.paramNombre("Inharmonicité", 100) / 100;
      // `ctx.runtime` est l'AudioContext du graphe : on génère à SA fréquence
      // d'échantillonnage, comme le fait déjà le nœud de batterie. Une première
      // version lisait `ctx.sampleRate`, qui n'existe pas sur ce contexte :
      // elle retombait toujours sur 44 100 en donnant l'illusion de lire une
      // valeur réelle. Le son n'en était pas désaccordé pour autant — un buffer
      // est rééchantillonné à la lecture, pas joué plus vite — mais cela
      // imposait une conversion inutile sur une carte à 48 kHz.
      const sampleRate = ctx.runtime?.sampleRate ?? 44100;
      const out = clocheRisset({
        frequenceHz, dureeSec, sampleRate, partiels, inharmonicite,
        battement: ctx.paramNombre("Battement", 100) / 100,
      });
      return {
        valeurs: [out],
        message: traduire("msg.cloche_risset_var_0_var_1_var_2", frequenceHz, partiels, Math.round(inharmonicite * 100)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
