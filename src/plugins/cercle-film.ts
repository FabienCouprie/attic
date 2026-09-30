// plugins/cercle-film.ts — Le cercle pulsant, rendu en film.
//
// Le dessin vit dans `audio/cercle-film.ts` et l'encodage dans `audio/video-rendu.ts`, tous deux
// éprouvés ; ce fichier n'est que la prise.
//
// AUCUN PORT, NI D'ENTRÉE NI DE SORTIE, décidé avec Fabien : le composant est purement illustratif,
// il ne sert qu'à l'export. Six composants du catalogue sont déjà dans ce cas, dont « Carte
// sonore », rangé comme celui-ci dans « Collections › Export ». Il se suffit à lui-même : il
// invente sa musique, la dessine, et rend un fichier qu'un bouton enregistre.
//
// IL NE SE MET PAS EN CACHE. Vingt secondes de film pèsent une quinzaine de mégaoctets, et les
// retenir d'une exécution à l'autre coûterait plus que de les refaire.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { Respiration } from "../core/respirer";
import {
  pulsations, type OptionsPulsations,
} from "../audio/cercle-pulsant";
import { dessinerImage, etatALInstant, OPTIONS_FILM, type OptionsFilm } from "../audio/cercle-film";
import { FIGURES, NOMS_FIGURES, NOMS_FIGURES_EN } from "../audio/superforme";
import { NOMS_STYLES } from "../audio/styles-film";
import { mulberry32, paletteDepuisPrompt } from "./pochette-palettes";
import { encoderFilm, nombreDImages } from "../audio/video-rendu";

const en = () => langueCourante() === "en";

/** Les définitions offertes, et leur hauteur. Le seizième-neuvième, partout. */
const DEFINITIONS: Record<string, { l: number; h: number }> = {
  "960 × 540": { l: 960, h: 540 },
  "1280 × 720": { l: 1280, h: 720 },
  "1920 × 1080": { l: 1920, h: 1080 },
};

export const fiches: FicheAudio[] = ([
  {
    id: "cercle-film",
    nom: "Générateur vidéo", nomEn: "Video Generator",
    univers: "Collections", famille: "Export",
    resume: "Dessine une figure animée image par image, avec rémanence, particules et halo, et rend un film MP4 muet.",
    resumeEn: "Draws an animated figure frame by frame, with trails, particles and glow, and returns a silent MP4 film.",
    notice: "Fabrique un film muet : une suite de pulsations commande une image animée, rendue en MP4.\n\nLe dessin se fait image par image sur un canevas, ce qui donne des effets qu'une animation déclarative ne rend pas. La rémanence couvre l'image précédente d'un fond translucide au lieu de l'effacer, et les formes laissent une traînée. Les figures se composent en mode additif : deux formes qui se croisent s'éclaircissent au lieu de se masquer, ce qui fait briller un amas de particules.\n\nQuatre figures se superposent. Le noyau bat au centre, attaque brève et retombée exponentielle. Un anneau naît à chaque frappe, s'ouvre et s'éteint. Des particules partent de chaque frappe en rayons, et s'effacent. Un polygone tourne autour du noyau, et son nombre de sommets suit la case Camelot de la couleur : la figure change de forme quand la teinte change de case.\n\n« Durée », « Pulsation initiale », « Pulsation finale », « Teinte », « Parcours de teinte », « Saturation », « Clarté », « Respiration » et « Graine » règlent la suite de pulsations, donc le rythme et la couleur de l'image.\n\n« Figure » et « Figure d'arrivée » nomment les deux formes entre lesquelles le film se déforme, et « Morphing » dit quelle part du trajet est parcourue sur la durée : à zéro, la figure de départ tient tout le film. « Style » choisit la main qui trace les contours, ce qui fait varier la largeur du trait, le nombre de fois qu'il est repassé, son décalage, sa continuité et son remplissage. « Prompt » donne quelques mots dont se déduit la palette, et laissé vide, la couleur suit la teinte des pulsations.\n\n« Définition » et « Cadence » fixent le nombre d'images à calculer, qui est ce que le film coûte : la durée multipliée par la cadence. « Débit » fixe le poids du fichier, en mégabits par seconde. « Rémanence » règle la longueur des traînées : haute, l'image s'efface vite ; basse, tout traîne. « Particules » donne leur nombre par frappe, et zéro les supprime. « Vie d'un anneau » donne le temps qu'il met à s'ouvrir et disparaître.\n\nLa sortie « Vidéo » rend le film. Il se regarde aussi dans le composant et s'enregistre par son bouton ; tant qu'il n'est pas enregistré, le fichier n'existe qu'en mémoire. Le message donne le nombre d'images, le poids et le temps de calcul.",
    noticeEn: "Builds a silent film: a series of pulses drives a moving image, rendered as MP4.\n\nThe drawing is made frame by frame on a canvas, which gives effects a declarative animation does not. Trailing covers the previous frame with a translucent background instead of erasing it, and the shapes leave a trail. The figures compose in additive mode: two shapes that cross brighten instead of masking each other, which makes a cluster of particles glow.\n\nFour figures overlay. The core beats at the centre, brief attack and exponential fall. A ring is born at each strike, opens and dies out. Particles leave each strike along rays, and fade. A polygon turns around the core, and its number of vertices follows the colour's Camelot slot: the figure changes shape when the hue changes slot.\n\n« Duration », « Initial rate », « Final rate », « Hue », « Hue journey », « Saturation », « Lightness », « Breathing » and « Seed » set the series of pulses, hence the rhythm and the colour of the image.\n\n« Shape » and « Target shape » name the two forms the film morphs between, and « Morphing » says how much of the journey is travelled over the duration: at zero, the starting shape holds the whole film. « Style » chooses the hand that draws the outlines, which varies the stroke width, how many times it is gone over, its offset, its continuity and its fill. « Prompt » gives a few words from which the palette is deduced, and left empty, the colour follows the pulses' hue.\n\n« Definition » and « Frame rate » set the number of frames to compute, which is what the film costs: the duration times the frame rate. « Bitrate » sets the file's weight, in megabits per second. « Trailing » sets how long the trails last: high, the image clears fast; low, everything trails. « Particles » gives their number per strike, and zero removes them. « Ring life » gives the time a ring takes to open and vanish.\n\nThe « Video » output returns the film. It is also watched inside the node and saved by its button; until it is saved, the file exists only in memory. The message gives the number of frames, the weight and the computing time.",
    // AUCUNE ENTRÉE : le composant invente sa musique et son image, il ne reçoit rien. UNE SORTIE
    // « Vidéo », en revanche, décidée avec Fabien : le film se branche alors là où un film s'attend,
    // et l'export ne dépend plus du seul bouton de la vue.
    entrees: [],
    sorties: [{ nom: "Vidéo", nomEn: "Video", type: "video" }],
    // Un film de quinze mégaoctets ne se garde pas d'une exécution à l'autre, et le nœud pilote
    // lui-même son affichage depuis ses données.
    // SANS `affichageAutonome` : ce drapeau écarte le nœud de la phase des résultats, et son
    // message avec lui. Le film vit dans les données du nœud et sa vue l'y trouve ; le message,
    // lui, doit passer par le chemin ordinaire pour s'afficher.
    jamaisCache: true,
    parametres: [
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [2, 120], pas: 1, defaut: 20, unite: "s",
        doc: "Durée du film, et de la musique qu'il porte. Elle multiplie la cadence pour donner le nombre d'images à calculer, qui est ce que le rendu coûte.",
        docEn: "Length of the film, and of the music it carries. It multiplies the frame rate to give the number of frames to compute, which is what the render costs." },
      { nom: "Pulsation initiale", nomEn: "Initial rate", type: "curseur", plage: [0.2, 12], pas: 0.1, defaut: 1.6, unite: "/s",
        doc: "Frappes par seconde au début.", docEn: "Strikes per second at the start." },
      { nom: "Pulsation finale", nomEn: "Final rate", type: "curseur", plage: [0.2, 12], pas: 0.1, defaut: 3.2, unite: "/s",
        doc: "Frappes par seconde à la fin. Différente de l'initiale, le rythme s'accélère ou ralentit tout du long.",
        docEn: "Strikes per second at the end. Different from the initial one, the rhythm speeds up or slows down throughout." },
      { nom: "Teinte", nomEn: "Hue", type: "curseur", plage: [0, 359], pas: 1, defaut: 210, unite: "°",
        doc: "Couleur de départ. Elle donne aussi la tonalité, par la case Camelot du secteur où elle tombe.",
        docEn: "Starting colour. It also gives the key, through the Camelot slot of the sector it falls in." },
      { nom: "Parcours de teinte", nomEn: "Hue journey", type: "curseur", plage: [-720, 720], pas: 15, defaut: 150, unite: "°",
        doc: "De combien la couleur tourne sur toute la durée. La musique module avec elle, et le polygone change de nombre de sommets à chaque case traversée.",
        docEn: "How far the colour turns over the whole duration. The music modulates with it, and the polygon changes its number of vertices at each slot crossed." },
      { nom: "Saturation", nomEn: "Saturation", type: "curseur", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "Saturation des couleurs. Au-dessus de la moitié, les cases Camelot sont majeures ; en dessous, mineures.",
        docEn: "Colour saturation. Above half, the Camelot slots are major; below, minor." },
      { nom: "Clarté", nomEn: "Lightness", type: "curseur", plage: [0, 100], pas: 1, defaut: 55, unite: "%",
        doc: "Clarté des couleurs.", docEn: "Colour lightness." },
      { nom: "Respiration", nomEn: "Breathing", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Amplitude de la variation du rayon d'une frappe à l'autre.",
        docEn: "How much the radius varies from one strike to the next." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 7,
        doc: "Graine du tirage. Même graine, même film.", docEn: "Seed of the draw. Same seed, same film." },
      { nom: "Définition", nomEn: "Definition", type: "choix",
        options: Object.keys(DEFINITIONS), optionsEn: Object.keys(DEFINITIONS),
        optionIds: Object.keys(DEFINITIONS), defaut: "1280 × 720", defautEn: "1280 × 720",
        doc: "Taille de l'image. Elle pèse sur le temps d'encodage, qui est la part principale du calcul.",
        docEn: "Picture size. It weighs on the encoding time, which is the main part of the computation." },
      { nom: "Cadence", nomEn: "Frame rate", type: "curseur", plage: [12, 60], pas: 1, defaut: 30, unite: "/s",
        doc: "Images par seconde. Le nombre d'images à calculer est la durée multipliée par cette cadence, et c'est lui qui fixe le temps de rendu.",
        docEn: "Frames per second. The number of frames to compute is the duration times this rate, and that is what sets the render time." },
      { nom: "Débit", nomEn: "Bitrate", type: "curseur", plage: [1, 20], pas: 1, defaut: 6, unite: "Mb/s",
        doc: "Débit de l'image. Il fixe le poids du fichier : la durée multipliée par le débit.",
        docEn: "Picture bitrate. It sets the file's weight: the duration times the bitrate." },
      { nom: "Rémanence", nomEn: "Trailing", type: "curseur", plage: [2, 100], pas: 1, defaut: 24, unite: "%",
        doc: "Part du fond reposée à chaque image. Haute, l'image précédente s'efface vite ; basse, tout laisse une traînée.",
        docEn: "Share of background laid down at each frame. High, the previous frame clears fast; low, everything leaves a trail." },
      { nom: "Particules", nomEn: "Particles", type: "curseur", plage: [0, 40], pas: 1, defaut: 14,
        doc: "Nombre de particules lancées par chaque frappe. À zéro, il n'y en a aucune.",
        docEn: "Number of particles thrown by each strike. At zero there are none." },
      { nom: "Vie d'un anneau", nomEn: "Ring life", type: "curseur", plage: [0.2, 6], pas: 0.1, defaut: 1.6, unite: "s",
        doc: "Temps qu'un anneau met à s'ouvrir et à disparaître. Long, les anneaux se superposent.",
        docEn: "Time a ring takes to open and vanish. Long, the rings overlap." },
      { nom: "Figure", nomEn: "Shape", type: "choix",
        options: NOMS_FIGURES, optionsEn: NOMS_FIGURES_EN, optionIds: NOMS_FIGURES,
        defaut: "Cercle", defautEn: "Circle",
        doc: "La figure de départ. Toutes sont des réglages d'une même équation, la superformule de Gielis, ce qui permet de passer de l'une à l'autre sans rupture.",
        docEn: "The starting shape. All are settings of one same equation, the Gielis superformula, which allows passing from one to another without a break." },
      { nom: "Figure d'arrivée", nomEn: "Target shape", type: "choix",
        options: NOMS_FIGURES, optionsEn: NOMS_FIGURES_EN, optionIds: NOMS_FIGURES,
        defaut: "Étoile", defautEn: "Star",
        doc: "La figure vers laquelle le film se déforme au fil de la durée.",
        docEn: "The shape the film deforms towards over the duration." },
      { nom: "Style", nomEn: "Style", type: "choix",
        options: NOMS_STYLES, optionsEn: NOMS_STYLES, optionIds: NOMS_STYLES,
        defaut: "Style 5", defautEn: "Style 5",
        doc: "La main qui trace. La figure ne change pas, sa façon d'être posée change. 1 : un trait fin, seul. 2 : le contour et les cordes qui joignent ses points opposés. 3 : le rayon ondulé par une sinusoïde, quatorze vagues sur le tour. 4 : des points semés sur le contour, écartés au hasard. 5 : cinq contours emboîtés, du plein au tiers. 6 : le contour rempli d'un aplat, plus un demi-disque. 7 : le contour en pochoir, rempli de rayures. 8 : le contour brisé en tesselles séparées de vide. 9 : une croix à chaque sommet. 10 : un trait trois fois plus épais, doublé d'une ombre décalée. 11 : trois copies décalées en cyan, magenta et blanc. 12 : trois traits larges et transparents superposés.",
        docEn: "The hand that draws. The shape does not change, the way it is laid down does. 1: a thin stroke, alone. 2: the outline and the chords joining its opposite points. 3: the radius rippled by a sine, fourteen waves around the turn. 4: dots sown along the outline, spaced at random. 5: five nested outlines, from full to a third. 6: the outline filled flat, plus a half disc. 7: the outline as a stencil, filled with stripes. 8: the outline broken into tesserae parted by gaps. 9: a cross at each vertex. 10: a stroke three times thicker, doubled by an offset shadow. 11: three copies offset in cyan, magenta and white. 12: three wide translucent strokes laid over each other." },
      { nom: "Prompt", nomEn: "Prompt", type: "texte", defaut: "", defautEn: "",
        doc: "Quelques mots dont se déduit la palette : feu, océan, forêt, nuit, néon, pastel, synthwave, sépia et une dizaine d'autres mondes. Laissé vide, la couleur suit la teinte des pulsations.",
        docEn: "A few words from which the palette is deduced: fire, ocean, forest, night, neon, pastel, synthwave, sepia and a dozen other worlds. Left empty, the colour follows the pulses' hue." },
      { nom: "Morphing", nomEn: "Morphing", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Quelle part du trajet vers la figure d'arrivée est parcourue sur la durée. À zéro, la figure de départ tient tout le film ; à cent, il finit exactement sur la figure d'arrivée.",
        docEn: "How much of the journey towards the target shape is travelled over the duration. At zero the starting shape holds the whole film; at a hundred it ends exactly on the target shape." },
    ],
    async executer(ctx: any) {
      // LE TYPE DIT CE QUE CE FILM EMPLOIE, et c'est `OptionsPulsations` et non `OptionsCercle` :
      // un seuil de silence ne règle que ce qui sonne, or ce film est muet. Le curseur existait
      // pourtant, visible et documenté, et ne pouvait rien changer.
      const o: OptionsPulsations = {
        dureeSec: ctx.paramNombre("Durée", 20),
        pulsationDebut: ctx.paramNombre("Pulsation initiale", 1.6),
        pulsationFin: ctx.paramNombre("Pulsation finale", 3.2),
        teinteDebut: ctx.paramNombre("Teinte", 210),
        teinteParcours: ctx.paramNombre("Parcours de teinte", 150),
        saturation: ctx.paramNombre("Saturation", 70) / 100,
        clarte: ctx.paramNombre("Clarté", 55) / 100,
        respiration: ctx.paramNombre("Respiration", 80) / 100,
        graine: Math.round(ctx.paramNombre("Graine", 7)),
      };
      const invite = ctx.paramTexte("Prompt", "").trim();
      const p = pulsations(o);

      const film: OptionsFilm = {
        ...OPTIONS_FILM,
        dureeSec: o.dureeSec,
        particules: Math.round(ctx.paramNombre("Particules", 14)),
        vieAnneau: ctx.paramNombre("Vie d'un anneau", 1.6),
        figureA: FIGURES[ctx.paramTexte("Figure", "Cercle")] ?? FIGURES.Cercle,
        figureB: FIGURES[ctx.paramTexte("Figure d'arrivée", "Étoile")] ?? FIGURES.Étoile,
        morphing: ctx.paramNombre("Morphing", 100) / 100,
        style: ctx.paramTexte("Style", "Style 5"),
        // LA PALETTE VIENT DU GÉNÉRATEUR DE POCHETTE, reprise telle quelle : quelques mots suffisent
        // à changer de monde, et le vocabulaire existe déjà dans l'application.
        palette: invite ? paletteDepuisPrompt(invite, mulberry32(o.graine || 1)) : [],
      };
      const def = DEFINITIONS[ctx.paramTexte("Définition", "1280 × 720")] ?? DEFINITIONS["1280 × 720"];
      const cadence = Math.round(ctx.paramNombre("Cadence", 30));
      const remanence = ctx.paramNombre("Rémanence", 24) / 100;

      // LE FILM EST MUET, demandé par Fabien. La suite de pulsations reste ce qui commande l'image,
      // mais rien n'est rendu en son : le fichier n'a donc pas de piste audio, et la musique se pose
      // ailleurs, sur un montage, avec ce qu'on veut. Cela retire aussi la synthèse du chemin, qui
      // était le second poste du calcul après l'encodeur.
      const images = nombreDImages(o.dureeSec, cadence);
      ctx.onProgress?.(en() ? `${images} frames to encode…` : `${images} images à encoder…`);

      const rendu = await encoderFilm({
        largeur: def.l, hauteur: def.h, cadence, dureeSec: o.dureeSec,
        debit: Math.round(ctx.paramNombre("Débit", 6)) * 1_000_000,
        // LE SOUFFLE N'EST PAS FACULTATIF : six cents images sans rendre la main figeraient la
        // fenêtre plusieurs secondes, ce qui est le défaut que nous venons de corriger ailleurs.
        souffle: new Respiration(),
        signal: ctx.signal,
        dessiner: (cx, t) => dessinerImage(cx, etatALInstant(p, t, film), def.l, def.h, remanence, film.style, film.palette),
        avancement: (part) => ctx.onProgress?.(
          en() ? `encoding ${Math.round(part * 100)} %` : `encodage ${Math.round(part * 100)} %`),
      });

      // LE FILM SORT PAR DEUX CHEMINS, ET C'EST VOULU. Le port « Vidéo » le rend composable : il se
      // branche là où un film s'attend. Et une URL posée dans les données du nœud le donne à sa vue,
      // qui le joue et l'enregistre, exactement comme le fait l'extraction vidéo.
      //
      // LE SOUFFLET N'EST PAS RETENU DANS LES DONNÉES, seulement son URL et son poids : un blob de
      // quinze mégaoctets accroché au nœud ne serait libéré par rien. Le préfixe `_` écarte ces
      // champs de la sérialisation, comme ailleurs.
      const donnees = ctx.noeud.data as Record<string, unknown>;
      if (typeof donnees._filmUrl === "string") URL.revokeObjectURL(donnees._filmUrl as string);
      const nomFilm = `cercle-${o.graine}-${Math.round(o.dureeSec)}s.mp4`;
      donnees._filmUrl = URL.createObjectURL(rendu.blob);
      donnees._filmNom = nomFilm;
      donnees._filmOctets = rendu.blob.size;

      const mo = (rendu.blob.size / 1048576).toFixed(1);
      return {
        valeurs: [new File([rendu.blob], nomFilm, { type: "video/mp4" })],
        message: en()
          ? `${rendu.images} frames · ${def.l}×${def.h} · ${mo} MB · ${(rendu.msTotal / 1000).toFixed(1)} s`
          : `${rendu.images} images · ${def.l}×${def.h} · ${mo} Mo · ${(rendu.msTotal / 1000).toFixed(1)} s`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
