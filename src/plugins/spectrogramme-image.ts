// plugins/spectrogramme-image.ts — Les quatre passages entre un son, un spectrogramme et une image.
//
// POURQUOI QUATRE ET NON DEUX. La paire son ⇄ image faisait l'aller-retour d'un seul tenant, et le
// spectrogramme n'existait qu'à l'intérieur : on ne pouvait rien en faire. Le voilà porté par un
// type de flux, donc par un câble, et la chaîne se coupe en quatre morceaux dont chacun fait une
// seule chose. Le PNG de Riffusion devient un terminus parmi d'autres plutôt que le seul passage.
//
// LE PARAMÉTRAGE DE L'ÉCHELLE N'EST DÉCLARÉ QU'À L'ANALYSE. Il voyage ensuite avec la matrice, si
// bien que la synthèse et l'écriture d'image n'ont plus à le répéter : c'était sept réglages à
// accorder à la main d'un bout à l'autre, et une seule valeur fausse déplaçait toutes les hauteurs.
// Seule « Image → spectrogramme » les redemande, une image ne portant pas les siens.
//
// Les calculs, leurs références et la raison de leurs choix sont dans `audio/mel.ts`,
// `audio/spectrogramme-mel.ts` et `audio/spectrogramme-pixels.ts`.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { imageDataDepuisFichier, mixdownMono } from "../audio";
import { hasardDuNoeud } from "../core/hasard";
import { PARAMETRES_RIFFUSION, bancMel, bandesVides, tailleTransformee, type ParametresMel } from "../audio/mel";
import {
  analyserVoie, aplatirCanal, bandesDe, colonnesDe, deplierCanal, synthetiserVoie,
  type Analyse, type OptionsAnalyse, type OptionsSynthese, type SpectrogrammeMel, type Synthese,
} from "../audio/spectrogramme-mel";
import { parCanal } from "./hors-fil";
import { imageDepuisMel, melDepuisImage } from "../audio/spectrogramme-pixels";

const en = () => langueCourante() === "en";
const nb = (v: number, d = 2) => (en() ? v.toFixed(d) : v.toFixed(d).replace(".", ","));

/** Les réglages de l'échelle, déclarés là où on les pose : à l'analyse, et à la lecture d'image. */
const REGLAGES_ECHELLE = [
  { nom: "Bandes", nomEn: "Bands", type: "curseur", plage: [64, 1024], pas: 1, defaut: 512, unite: "",
    doc: "Le nombre de bandes de mels, donc la hauteur du spectrogramme. Cinq cent douze suit la référence.",
    docEn: "The number of mel bands, and so the height of the spectrogram. Five hundred and twelve follows the reference." },
  { nom: "Pas", nomEn: "Step", type: "curseur", plage: [1, 50], pas: 1, defaut: 10, unite: "ms",
    doc: "L'avance d'une colonne à la suivante. Dix millisecondes donnent cent colonnes par seconde.",
    docEn: "The advance from one column to the next. Ten milliseconds give a hundred columns per second." },
  { nom: "Fenêtre", nomEn: "Window", type: "curseur", plage: [10, 500], pas: 1, defaut: 100, unite: "ms",
    doc: "La durée analysée par colonne. Longue, elle sépare les hauteurs voisines et étale les attaques ; courte, elle fait l'inverse.",
    docEn: "The duration analysed per column. Long, it separates neighbouring pitches and smears attacks; short, it does the opposite." },
  { nom: "Bourrage", nomEn: "Padding", type: "curseur", plage: [20, 1000], pas: 10, defaut: 400, unite: "ms",
    doc: "La durée de la trame une fois complétée de zéros. Elle n'ajoute pas de résolution, elle affine la grille sur laquelle le spectre est lu, et elle fixe le coût du calcul.",
    docEn: "The frame duration once padded with zeros. It adds no resolution, it refines the grid the spectrum is read on, and it sets the cost of the computation." },
  { nom: "Fréquence min", nomEn: "Min frequency", type: "curseur", plage: [0, 2000], pas: 10, defaut: 0, unite: "Hz",
    doc: "La fréquence de la bande du bas. Zéro suit la référence et consacre le bas du spectrogramme à quelques hertz.",
    docEn: "The frequency of the bottom band. Zero follows the reference and devotes the bottom of the spectrogram to a few hertz." },
  { nom: "Fréquence max", nomEn: "Max frequency", type: "curseur", plage: [1000, 22050], pas: 100, defaut: 10000, unite: "Hz",
    doc: "La fréquence de la bande du haut. Ce qui est au-dessus n'entre pas dans le spectrogramme et ne revient pas au retour.",
    docEn: "The frequency of the top band. Anything above does not enter the spectrogram and does not come back on the return trip." },
] as const;

const PUISSANCE = {
  nom: "Puissance", nomEn: "Power", type: "curseur", plage: [0.05, 1], pas: 0.05, defaut: 0.25,
  doc: "L'exposant appliqué au module avant l'écriture sur 256 niveaux. Un quart suit la référence et rend visible le bas de la dynamique ; un vaut l'écriture linéaire, où l'image est presque entièrement blanche.",
  docEn: "The exponent applied to the magnitude before writing to 256 levels. A quarter follows the reference and makes the bottom of the dynamic range visible; one is linear writing, where the image is almost entirely white.",
} as const;

const CANAUX = {
  nom: "Canaux", nomEn: "Channels", type: "choix", options: ["Mono", "Stéréo"], optionsEn: ["Mono", "Stereo"],
  optionIds: ["mono", "stereo"], defaut: "Mono", defautEn: "Mono",
  doc: "Mono analyse un seul canal. Stéréo en garde deux, qui se suivent jusqu'au bout de la chaîne.",
  docEn: "Mono analyses a single channel. Stereo keeps two, which follow each other to the end of the chain.",
} as const;

/** Les réglages de l'échelle lus sur le nœud, le nombre de bandes compris. */
function echelleLue(ctx: any, echantillonnage: number, bandes?: number): ParametresMel {
  return {
    echantillonnage,
    bandes: bandes ?? Math.round(ctx.paramNombre("Bandes", PARAMETRES_RIFFUSION.bandes)),
    pasMs: ctx.paramNombre("Pas", PARAMETRES_RIFFUSION.pasMs),
    fenetreMs: ctx.paramNombre("Fenêtre", PARAMETRES_RIFFUSION.fenetreMs),
    bourrageMs: ctx.paramNombre("Bourrage", PARAMETRES_RIFFUSION.bourrageMs),
    fMin: ctx.paramNombre("Fréquence min", PARAMETRES_RIFFUSION.fMin),
    fMax: ctx.paramNombre("Fréquence max", PARAMETRES_RIFFUSION.fMax),
  };
}

const estStereo = (ctx: any) => ctx.paramTexte("Canaux", "mono") === "stereo";
const estSpectrogramme = (v: unknown): v is SpectrogrammeMel =>
  !!v && typeof v === "object" && Array.isArray((v as SpectrogrammeMel).canaux)
  && !!(v as SpectrogrammeMel).parametres;
const sansSpectrogramme = () => (en() ? "No spectrogram input" : "Aucune entrée spectrogramme");

/** Les octets d'une image, rendus en fichier par le canevas. */
function fichierDepuisPixels(rgba: Uint8ClampedArray, largeur: number, hauteur: number, nom: string): Promise<File> {
  return new Promise((resoudre, rejeter) => {
    const canevas = document.createElement("canvas");
    canevas.width = largeur;
    canevas.height = hauteur;
    const dessin = canevas.getContext("2d");
    if (!dessin) { rejeter(new Error("Contexte 2D indisponible")); return; }
    // `Uint8ClampedArray.from` et non le tableau tel quel : `ImageData` veut un tampon qui ne soit
    // pas partagé, et le type du tableau ne le promet pas. C'est ce que fait déjà `texte-image`.
    dessin.putImageData(new ImageData(Uint8ClampedArray.from(rgba), largeur, hauteur), 0, 0);
    canevas.toBlob((blob) => {
      if (!blob) { rejeter(new Error("Canvas.toBlob a rendu null")); return; }
      resoudre(new File([blob], nom, { type: "image/png" }));
    }, "image/png");
  });
}

export const fiches: FicheAudio[] = ([
  {
    id: "son-spectrogramme", nom: "Son → spectrogramme", nomEn: "Sound to spectrogram",
    univers: "Traitement", famille: "Mels",
    resume: "Analyse un son en spectrogramme de mels, au paramétrage de Riffusion.",
    resumeEn: "Analyses a sound into a mel spectrogram, with Riffusion's parameters.",
    notice: "Ce composant analyse un son et rend son spectrogramme en mels. Chaque colonne est une tranche de temps, chaque ligne une bande de l'échelle des mels, et la valeur est le module du spectre. D'après le paramétrage de Riffusion, publié par Seth Forsgren et Hayk Martiros en 2022 sous licence MIT.\n\nL'échelle des mels resserre les aigus et étire les graves, de sorte qu'un spectrogramme donne à peu près autant de place aux octaves basses qu'aux hautes. L'échelle employée est celle de HTK, soit 2595 fois le logarithme décimal de un plus la fréquence divisée par sept cents, et non celle de Slaney, qui est une droite sous mille hertz. La différence se voit au grave : deux intervalles de deux cents hertz pris sous mille occupent ici des hauteurs dans un rapport de 1,40, quand l'échelle de Slaney leur donnerait la même. Le nom de Slaney désigne aussi une normalisation des filtres par leur aire, qui n'est pas appliquée non plus : le sommet de chaque triangle vaut un, quelle que soit sa largeur.\n\n« Bandes » est le nombre de lignes du spectrogramme.\n\n« Pas » est l'avance d'une colonne à la suivante, et fixe donc leur nombre.\n\n« Fenêtre » est la durée analysée par colonne. Longue, elle sépare les hauteurs voisines et étale les attaques.\n\n« Bourrage » est la durée de la trame une fois complétée de zéros. Elle n'ajoute pas de résolution : elle affine la grille sur laquelle le spectre est lu, et elle fixe le coût du calcul.\n\n« Fréquence min » et « Fréquence max » bornent l'échelle. Ce qui est au-dessus n'entre pas.\n\n« Canaux » analyse un seul canal ou deux.\n\nLa sortie « Spectrogramme » porte la matrice et le paramétrage qui permet de la relire : les composants qui la reçoivent n'ont donc pas à répéter ces réglages. Le message donne la taille du spectrogramme et la durée couverte.",
    noticeEn: "This node analyses a sound and returns its mel spectrogram. Each column is a slice of time, each row a band of the mel scale, and the value is the magnitude of the spectrum. After the parameters of Riffusion, published by Seth Forsgren and Hayk Martiros in 2022 under the MIT licence.\n\nThe mel scale packs the highs and stretches the lows, so that a spectrogram gives roughly as much room to the bottom octaves as to the top ones. The scale in use is the HTK one, 2595 times the base ten logarithm of one plus the frequency divided by seven hundred, and not the Slaney one, which is a straight line below a thousand hertz. The difference shows in the low end: two intervals of two hundred hertz taken below a thousand occupy heights in a ratio of 1.40 here, where the Slaney scale would give them the same. Slaney's name also stands for a normalisation of the filters by their area, which is not applied either: the peak of each triangle is one whatever its width.\n\n« Bands » is the number of rows of the spectrogram.\n\n« Step » is the advance from one column to the next, and so sets how many there are.\n\n« Window » is the duration analysed per column. Long, it separates neighbouring pitches and smears attacks.\n\n« Padding » is the frame duration once padded with zeros. It adds no resolution: it refines the grid the spectrum is read on, and it sets the cost of the computation.\n\n« Min frequency » and « Max frequency » bound the scale. Anything above does not enter.\n\n« Channels » analyses a single channel or two.\n\nThe « Spectrogram » output carries the matrix and the parameters needed to read it back: the nodes that receive it therefore have no need to repeat those settings. The message gives the size of the spectrogram and the duration covered.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Spectrogramme", nomEn: "Spectrogram", type: "spectrogramme" }],
    parametres: [...REGLAGES_ECHELLE, CANAUX],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: en() ? "No audio input" : "Aucune entrée audio" };
      const stereo = estStereo(ctx) && a.numberOfChannels > 1;
      const p = echelleLue(ctx, a.sampleRate);
      const voies = stereo ? [a.getChannelData(0), a.getChannelData(1)] : [mixdownMono(a)];
      // L'ANALYSE SORT DU FIL ELLE AUSSI : mesurée à 873 millisecondes pour cinq secondes de son,
      // c'était tout le gel qui restait une fois la synthèse sortie.
      const analyses = await parCanal<OptionsAnalyse, Analyse>(
        voies, { parametres: p },
        {
          creerWorker: () => new Worker(new URL("../workers/spectrogramme-analyse-worker.ts", import.meta.url), { type: "module" }),
          calcul: analyserVoie,
          surProgres: (c, n) => ctx.onProgress?.(en() ? `analysis, channel ${c}/${n}` : `analyse, canal ${c}/${n}`),
        },
      );
      const spectre: SpectrogrammeMel = {
        canaux: analyses.map((r) => deplierCanal(r.plat, r.bandes)),
        parametres: p,
      };
      const vides = bandesVides(bancMel(p, tailleTransformee(p)));
      const alerte = vides > 0 ? (en() ? ` · ${vides} empty bands` : ` · ${vides} bandes vides`) : "";
      return {
        valeurs: [spectre],
        message: `${colonnesDe(spectre)} × ${bandesDe(spectre)} · ${nb(a.duration)} s${alerte}`,
      };
    },
  },
  {
    id: "spectrogramme-son", nom: "Spectrogramme → son", nomEn: "Spectrogram to sound",
    univers: "Traitement", famille: "Mels",
    resume: "Rend le son que porte un spectrogramme de mels, la phase estimée par Griffin-Lim.",
    resumeEn: "Returns the sound a mel spectrogram carries, with the phase estimated by Griffin-Lim.",
    notice: "Ce composant rend le son que porte un spectrogramme en mels. Pour la phase, d'après Daniel Griffin et Jae Lim, « Signal estimation from modified short-time Fourier transform », IEEE Transactions on Acoustics, Speech and Signal Processing 32(2), 1984.\n\nDeux choses manquent dans un spectrogramme et doivent être retrouvées. Les bandes de mels d'abord : chacune rend son niveau aux fréquences que son triangle couvrait, ce qui est une moyenne et non la forme exacte qu'il y avait. La phase ensuite, qui n'est pas écrite du tout : on part d'une phase tirée au sort, on synthétise, on réanalyse ce qu'on a obtenu, on garde la phase trouvée et on y remet les niveaux voulus. Chaque tour rapproche.\n\n« Tours » est le nombre de ces allers-retours. Zéro rend le bruit coloré par le spectrogramme, et s'entend comme tel. Sur cinq secondes de son, relevé sur le paramétrage par défaut : quatre tours amènent l'écart spectral à onze décibels sous le signal en quatre secondes de calcul, huit tours à douze décibels en sept secondes, trente-deux tours, le nombre de la référence, à quinze décibels en vingt-cinq secondes.\n\n« Graine » fixe le tirage de la phase de départ. La même graine rend le même son.\n\nLes réglages de l'échelle ne sont pas repris ici : ils voyagent avec le spectrogramme, et c'est ce qui garantit que les hauteurs retrouvent leur place.\n\nLa sortie « Audio » rend le son, normalisé, le niveau absolu ne se gardant pas. Le message donne la durée, le nombre de tours et la graine retenue.",
    noticeEn: "This node returns the sound a mel spectrogram carries. For the phase, after Daniel Griffin and Jae Lim, « Signal estimation from modified short-time Fourier transform », IEEE Transactions on Acoustics, Speech and Signal Processing 32(2), 1984.\n\nTwo things are missing from a spectrogram and have to be found again. The mel bands first: each one gives its level back to the frequencies its triangle covered, which is an average and not the exact shape that was there. Then the phase, which is not written at all: the starting phase is drawn at random, the sound is synthesised, what came out is analysed again, the phase found is kept and the wanted levels are put back into it. Each round brings it closer.\n\n« Rounds » is the number of these trips. Zero returns the noise coloured by the spectrogram, and sounds like it. On five seconds of sound, measured with the default settings: four rounds bring the spectral error to eleven decibels below the signal in four seconds of computation, eight rounds to twelve decibels in seven seconds, thirty-two rounds, the number of the reference, to fifteen decibels in twenty-five seconds.\n\n« Seed » sets the draw of the starting phase. The same seed returns the same sound.\n\nThe scale settings are not repeated here: they travel with the spectrogram, and that is what makes sure the pitches find their place again.\n\nThe « Audio » output returns the sound, normalised, since the absolute level is not kept. The message gives the duration, the number of rounds and the seed retained.",
    entrees: [{ nom: "Spectrogramme", nomEn: "Spectrogram", type: "spectrogramme" }],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Tours", nomEn: "Rounds", type: "curseur", plage: [0, 64], pas: 1, defaut: 8, unite: "",
        doc: "Le nombre d'allers-retours de Griffin-Lim. Zéro rend le bruit coloré par le spectrogramme. Sur cinq secondes de son, quatre tours coûtent quatre secondes de calcul et trente-deux en coûtent vingt-cinq.",
        docEn: "The number of Griffin-Lim trips. Zero returns the noise coloured by the spectrogram. On five seconds of sound, four rounds cost four seconds of computation and thirty-two cost twenty-five." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [-1, 999999], pas: 1, defaut: -1,
        doc: "La graine du tirage de la phase de départ. La même graine rend le même son.",
        docEn: "The seed of the draw for the starting phase. The same seed returns the same sound." },
    ],
    async executer(ctx: any) {
      const s = ctx.entree(0);
      if (!estSpectrogramme(s)) return { valeurs: [null], message: sansSpectrogramme() };
      const tours = Math.round(ctx.paramNombre("Tours", 8));
      // LA GRAINE EST RÉSOLUE ICI ET PASSÉE AU CALCUL, et non le générateur lui-même : un worker ne
      // reçoit que ce qui se sérialise, et une fonction ne se sérialise pas.
      const { graine } = hasardDuNoeud(ctx.paramNombre("Graine", -1));
      const p = s.parametres;
      const sr = p.echantillonnage;
      const longueur = Math.max(1, Math.round((colonnesDe(s) - 1) * (p.pasMs / 1000) * sr));

      // LE CALCUL SORT DU FIL DE L'INTERFACE, et c'est ici qu'il le faut le plus : trente-deux
      // tours sur cinq secondes de son coûtent vingt-cinq secondes, pendant lesquelles rien ne
      // répondait. Le repli dans le fil reste pour les tests, où il n'y a pas de worker.
      const voies = (await parCanal<OptionsSynthese, Synthese>(
        s.canaux.map(aplatirCanal),
        { parametres: p, bandes: bandesDe(s), longueur, iterations: tours, graine },
        {
          creerWorker: () => new Worker(new URL("../workers/spectrogramme-synthese-worker.ts", import.meta.url), { type: "module" }),
          calcul: synthetiserVoie,
          surProgres: (c, n) => ctx.onProgress?.(en() ? `phase, channel ${c}/${n}` : `phase, canal ${c}/${n}`),
        },
      )).map((r) => r.signal);
      // Le niveau absolu n'est pas dans le spectrogramme : on normalise plutôt que de rendre une
      // échelle arbitraire, et c'est ce que la notice annonce.
      let pic = 0;
      for (const v of voies) for (let i = 0; i < v.length; i++) pic = Math.max(pic, Math.abs(v[i]));
      const gain = pic > 1e-9 ? 0.95 / pic : 1;
      const sortie = new AudioBuffer({ numberOfChannels: voies.length, length: longueur, sampleRate: sr });
      for (const [i, v] of voies.entries()) {
        const canal = new Float32Array(longueur);
        for (let k = 0; k < longueur; k++) canal[k] = v[k] * gain;
        sortie.copyToChannel(canal, i);
      }
      return {
        valeurs: [sortie],
        message: en()
          ? `${nb(longueur / sr)} s · ${tours} rounds · seed ${graine}`
          : `${nb(longueur / sr)} s · ${tours} tours · graine ${graine}`,
      };
    },
  },
  {
    id: "spectrogramme-image", nom: "Spectrogramme → image", nomEn: "Spectrogram to image",
    univers: "Traitement", famille: "Mels",
    resume: "Écrit un spectrogramme de mels en image, à la convention de Riffusion.",
    resumeEn: "Writes a mel spectrogram as an image, with Riffusion's convention.",
    notice: "Ce composant écrit un spectrogramme en mels sous forme d'image. Le grave est en bas, le fort est sombre, et le niveau de gris porte le module. D'après la convention de Riffusion, publiée par Seth Forsgren et Hayk Martiros en 2022 sous licence MIT.\n\nLe module n'est pas écrit tel quel mais élevé à une puissance, parce qu'un spectrogramme a une dynamique telle qu'écrit linéairement il serait blanc presque partout. Un spectrogramme à deux canaux écrit le gauche dans le vert et le droit dans le bleu, le rouge restant à zéro.\n\n« Puissance » est l'exposant de l'écriture. Un quart suit la référence.\n\nLa sortie « Image » rend un PNG. Le niveau absolu n'y est pas inscrit, ni le paramétrage de l'échelle : une image relue demande donc qu'on redonne ce paramétrage. Le message donne la taille de l'image.",
    noticeEn: "This node writes a mel spectrogram as an image. Low frequencies are at the bottom, loud is dark, and the grey level carries the magnitude. After the convention of Riffusion, published by Seth Forsgren and Hayk Martiros in 2022 under the MIT licence.\n\nThe magnitude is not written as it stands but raised to a power, because a spectrogram has such a dynamic range that written linearly it would be white almost everywhere. A two-channel spectrogram writes the left one into green and the right one into blue, with red left at zero.\n\n« Power » is the exponent of the writing. A quarter follows the reference.\n\nThe « Image » output returns a PNG. The absolute level is not recorded in it, nor the scale settings: an image read back therefore needs those settings given again. The message gives the size of the image.",
    entrees: [{ nom: "Spectrogramme", nomEn: "Spectrogram", type: "spectrogramme" }],
    sorties: [{ nom: "Image", nomEn: "Image", type: "image" }],
    parametres: [PUISSANCE],
    async executer(ctx: any) {
      const s = ctx.entree(0);
      if (!estSpectrogramme(s)) return { valeurs: [null], message: sansSpectrogramme() };
      const puissance = ctx.paramNombre("Puissance", 0.25);
      const image = imageDepuisMel(s.canaux, puissance);
      const fichier = await fichierDepuisPixels(image.rgba, image.largeur, image.hauteur, "spectrogramme.png");
      return {
        valeurs: [fichier],
        message: `${image.largeur} × ${image.hauteur} · ${(fichier.size / 1024).toFixed(0)} ko`,
      };
    },
  },
  {
    id: "image-spectrogramme", nom: "Image → spectrogramme", nomEn: "Image to spectrogram",
    univers: "Traitement", famille: "Mels",
    resume: "Relit une image comme un spectrogramme de mels, à la convention de Riffusion.",
    resumeEn: "Reads an image back as a mel spectrogram, with Riffusion's convention.",
    notice: "Ce composant relit une image comme un spectrogramme en mels. Il attend la convention d'écriture du composant qui fait l'aller : le grave en bas, le fort en sombre, et le module élevé à une puissance.\n\nUne image ne porte pas le paramétrage de son échelle, et c'est pourquoi tous ces réglages sont ici. Ils doivent valoir ce qu'ils valaient quand l'image a été écrite ; sinon les lignes se retrouvent à d'autres hauteurs, ce qui s'entend tout de suite. La hauteur de l'image donne le nombre de bandes, qui n'a donc pas à être réglé.\n\nL'échelle des mels est celle de HTK, soit 2595 fois le logarithme décimal de un plus la fréquence divisée par sept cents, et non celle de Slaney, qui est une droite sous mille hertz ; les filtres triangulaires ne sont pas normalisés par leur aire.\n\n« Échantillonnage » est la fréquence du son que le spectrogramme décrira. Une image ne la porte pas, et c'est elle qui décide à quelle hauteur chaque ligne se retrouve.\n\n« Puissance » doit valoir ce qu'elle valait à l'écriture.\n\n« Canaux » lit un gris, ou le vert et le bleu d'une image stéréo. C'est un réglage déclaré plutôt qu'une devinette : une image dont le rouge est nul se lirait comme stéréo, mais une image peinte à la main peut l'être sans l'être.\n\n« Pas », « Fenêtre », « Bourrage », « Fréquence min » et « Fréquence max » décrivent l'échelle et le découpage du temps.\n\nLa sortie « Spectrogramme » porte la matrice et ce paramétrage.",
    noticeEn: "This node reads an image back as a mel spectrogram. It expects the writing convention of the node that makes the outward trip: low frequencies at the bottom, loud in dark, and the magnitude raised to a power.\n\nAn image does not carry its scale settings, which is why they are all here. They must hold what they held when the image was written; otherwise the rows end up at other pitches, which is heard at once. The height of the image gives the number of bands, which therefore needs no setting.\n\nThe mel scale is the HTK one, 2595 times the base ten logarithm of one plus the frequency divided by seven hundred, and not the Slaney one, which is a straight line below a thousand hertz; the triangular filters are not normalised by their area.\n\n« Sample rate » is the rate of the sound the spectrogram will describe. An image does not carry it, and it decides what pitch each row ends up at.\n\n« Power » must hold what it held at writing time.\n\n« Channels » reads a grey, or the green and blue of a stereo image. It is a declared setting rather than a guess: an image whose red is zero would read as stereo, but an image painted by hand may be one without being one.\n\n« Step », « Window », « Padding », « Min frequency » and « Max frequency » describe the scale and the division of time.\n\nThe « Spectrogram » output carries the matrix and those settings.",
    entrees: [{ nom: "Image", nomEn: "Image", type: "image" }],
    sorties: [{ nom: "Spectrogramme", nomEn: "Spectrogram", type: "spectrogramme" }],
    parametres: [
      { nom: "Échantillonnage", nomEn: "Sample rate", type: "choix",
        options: ["22050", "32000", "44100", "48000"], defaut: "44100", defautEn: "44100",
        doc: "La fréquence d'échantillonnage du son que le spectrogramme décrira. Une image ne la porte pas, et c'est elle qui décide à quelle hauteur chaque ligne se retrouve.",
        docEn: "The sample rate of the sound the spectrogram will describe. An image does not carry it, and it decides what pitch each row ends up at." },
      PUISSANCE, CANAUX,
      ...REGLAGES_ECHELLE.filter((r) => r.nom !== "Bandes"),
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null], message: en() ? "No image input" : "Aucune entrée image" };
      const puissance = ctx.paramNombre("Puissance", 0.25);
      const stereo = estStereo(ctx);
      const echantillonnage = Number(ctx.paramTexte("Échantillonnage", "44100")) || 44100;
      ctx.onProgress(en() ? "reading the image" : "lecture de l'image");
      const pixels = await imageDataDepuisFichier(fichier);
      const p = echelleLue(ctx, echantillonnage, pixels.height);
      const spectre: SpectrogrammeMel = { canaux: melDepuisImage(pixels, puissance, stereo), parametres: p };
      const duree = (colonnesDe(spectre) * p.pasMs) / 1000;
      return {
        valeurs: [spectre],
        message: `${colonnesDe(spectre)} × ${bandesDe(spectre)} · ${nb(duree)} s`,
      };
    },
  },
] as unknown as FicheAudio[]).map(avecDoc);
