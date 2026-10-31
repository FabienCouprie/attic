// plugins/sous-titres-incrustes.ts — Nœud « Incruster les sous-titres » : le texte entre dans l'image.
//
// POURQUOI CE NŒUD EXISTE À CÔTÉ DU SRT. Un fichier de sous-titres se lit par un lecteur ou par une
// plateforme, et il reste corrigible ; mais il ne voyage pas avec le film, et il ne se voit nulle
// part quand on envoie le MP4 seul. Graver le texte dans l'image est la seule façon qu'il suive le
// film partout, au prix d'un réencodage et de l'impossibilité de le corriger ensuite.
//
// LE FILM EST DÉCODÉ, ET C'EST NOUVEAU DANS CE DÉPÔT. Jusqu'ici une piste d'images se recopiait
// paquet par paquet sans jamais être décodée, et le seul encodage d'images partait d'un dessin
// calculé. Ici les deux se rencontrent : `CanvasSink` rend chaque image sur un canevas, le texte
// se pose dessus, et l'encodeur existant reprend la suite.
//
// LES INSTANTS SONT DEMANDÉS DANS L'ORDRE, par `canvasesAtTimestamps`, qui ne décode alors chaque
// paquet qu'une fois. Demander image par image par `getCanvas` ferait un accès au hasard, et une
// recherche par image sur un film entier.
import { CanvasSink } from "mediabunny";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { Respiration } from "../core/respirer";
import { analyserSrt, sousTitreA } from "../audio/sous-titres";
import { dessinerSousTitre, type StyleSousTitre } from "../audio/sous-titres-image";
import { ouvrirVideo, sonDuFilm } from "../audio/video-sortie";
import { encoderFilm, nombreDImages } from "../audio/video-rendu";


import { enMo } from "../core/octets";
export const fiches = ([
  {
    id: "sous-titres-incrustes", nom: "Incruster les sous-titres", nomEn: "Burn In Subtitles",
    univers: "Autres", famille: "Vidéo",
    resume: "Grave des sous-titres SRT dans l'image d'un film, et rend le film gravé en MP4.",
    resumeEn: "Burns SRT subtitles into a film's picture, and returns the burnt film as MP4.",
    notice: "Ce composant reçoit un film et un texte au format SRT, et rend un film dont chaque image porte le "
      + "sous-titre de son instant. Le son du film d'origine est reporté tel quel.\n\n"
      + "« Corps » et « Marge » se disent en part de la hauteur de l'image, et non en pixels : le même réglage tient "
      + "sur une image de 480 lignes comme sur une de 2160.\n\n"
      + "« Position » pose le texte en bas ou en haut. Le bloc est ancré par son bord : un sous-titre de deux lignes "
      + "finit à la même hauteur qu'un sous-titre d'une ligne, de sorte que le texte ne saute pas d'une réplique à "
      + "l'autre.\n\n"
      + "« Fond » décide de ce qui détache le texte de l'image. « Contour » cerne chaque lettre de noir, « Bandeau » "
      + "pose un rectangle sombre derrière le bloc, « Aucun » laisse le texte nu, lisible seulement sur une image "
      + "sombre et calme.\n\n"
      + "« Débit » fixe le débit de l'image réencodée, donc le poids du fichier. La taille, la cadence et la durée "
      + "sont celles du film reçu.\n\n"
      + "Le texte gravé ne se corrige plus : le fichier SRT, lui, reste modifiable, et une seconde exécution refait "
      + "le film.",
    noticeEn: "This component receives a film and a text in the SRT format, and returns a film whose every frame "
      + "carries the subtitle of its instant. The original film's sound is carried over as is.\n\n"
      + "« Size » and « Margin » are given as a share of the picture height, not in pixels: the same setting holds on "
      + "a 480-line picture as on a 2160-line one.\n\n"
      + "« Position » puts the text at the bottom or at the top. The block is anchored by its edge: a two-line "
      + "subtitle ends at the same height as a one-line subtitle, so that the text does not jump from one line to "
      + "the next.\n\n"
      + "« Background » decides what detaches the text from the picture. « Outline » rings each letter in black, "
      + "« Band » lays a dark rectangle behind the block, « None » leaves the text bare, readable only on a dark and "
      + "quiet picture.\n\n"
      + "« Bitrate » sets the re-encoded picture's bitrate, hence the file's weight. The size, frame rate and length "
      + "are those of the received film.\n\n"
      + "The burnt text can no longer be corrected: the SRT file stays editable, and a second run makes the film "
      + "again.",
    entrees: [
      { nom: "Vidéo", nomEn: "Video", type: "video" },
      { nom: "SRT", nomEn: "SRT", type: "texte" },
    ],
    sorties: [{ nom: "Vidéo", nomEn: "Video", type: "video" }],
    parametres: [
      { nom: "Corps", nomEn: "Size", type: "curseur", plage: [2, 12], pas: 0.5, defaut: 5, unite: "% de hauteur", uniteEn: "% of height",
        doc: "Corps du texte, en part de la hauteur de l'image. À cinq pour cent, une image de 720 lignes porte un texte de 36 pixels.",
        docEn: "Text size, as a share of the picture height. At five per cent, a 720-line picture carries a 36-pixel text." },
      { nom: "Marge", nomEn: "Margin", type: "curseur", plage: [0, 25], pas: 0.5, defaut: 6, unite: "% de hauteur", uniteEn: "% of height",
        doc: "Distance entre le bloc de texte et le bord de l'image, en part de la hauteur.",
        docEn: "Distance between the text block and the picture edge, as a share of the height." },
      { nom: "Position", nomEn: "Position", type: "choix",
        options: ["Bas", "Haut"], optionsEn: ["Bottom", "Top"],
        optionIds: ["bas", "haut"], defaut: "Bas", defautEn: "Bottom",
        doc: "Le bord contre lequel le bloc de texte est posé.",
        docEn: "The edge the text block is laid against." },
      { nom: "Fond", nomEn: "Background", type: "choix",
        options: ["Contour", "Bandeau", "Aucun"], optionsEn: ["Outline", "Band", "None"],
        optionIds: ["contour", "bandeau", "aucun"], defaut: "Contour", defautEn: "Outline",
        doc: "Ce qui détache le texte de l'image. Un texte blanc sans contour ni bandeau disparaît sur une image claire.",
        docEn: "What detaches the text from the picture. A white text without outline or band disappears on a light picture." },
      { nom: "Débit", nomEn: "Bitrate", type: "curseur", plage: [1, 20], pas: 1, defaut: 6, unite: "Mb/s",
        doc: "Débit de l'image réencodée. Il fixe le poids du fichier : la durée multipliée par le débit.",
        docEn: "Bitrate of the re-encoded picture. It sets the file's weight: the length times the bitrate." },
    ],
    async executer(ctx) {
      const film = ctx.entree(0);
      if (!(film instanceof File)) {
        return { valeurs: [null], erreur: true, message: traduire("msg.incrustation.aucunFilm") };
      }
      const srt = ctx.entree(1);
      const sous = analyserSrt(typeof srt === "string" ? srt : "");
      if (sous.length === 0) {
        // RIEN À GRAVER, DONC RIEN À RÉENCODER : le film reçu ressort tel quel. Réencoder pour
        // n'ajouter aucun texte coûterait une passe entière et abîmerait l'image pour rien.
        return { valeurs: [film], message: traduire("msg.incrustation.aucunSousTitre") };
      }

      const video = await ouvrirVideo(await film.arrayBuffer());
      if (!video.pisteVideo || video.largeur < 2 || video.hauteur < 2) {
        return { valeurs: [null], erreur: true, message: traduire("msg.incrustation.sansImage") };
      }
      const style: StyleSousTitre = {
        corpsPourCent: ctx.paramNombre("Corps", 5),
        margePourCent: ctx.paramNombre("Marge", 6),
        position: ctx.paramTexte("Position", "bas") === "haut" ? "haut" : "bas",
        fond: ((f) => (f === "bandeau" || f === "aucun" ? f : "contour"))(ctx.paramTexte("Fond", "contour")),
      };
      const souffle = new Respiration();
      const audio = await sonDuFilm(video, () => souffle.tour().then(() => undefined));
      const images = nombreDImages(video.dureeSec, video.cadence);
      ctx.onProgress?.(traduire("progress.incrustation.images", String(images), String(sous.length)));

      const sink = new CanvasSink(video.pisteVideo);
      const suite = sink.canvasesAtTimestamps(
        (function* () { for (let i = 0; i < images; i++) yield i / video.cadence; })(),
      );

      const rendu = await encoderFilm({
        largeur: video.largeur, hauteur: video.hauteur,
        cadence: video.cadence, dureeSec: video.dureeSec,
        debit: Math.round(ctx.paramNombre("Débit", 6)) * 1_000_000,
        audio: audio ?? undefined,
        souffle, signal: ctx.signal,
        avancement: (part: number) => ctx.onProgress?.(
          traduire("progress.incrustation.part", String(Math.round(part * 100)))),
        dessiner: async (cx, t) => {
          const image = (await suite.next()).value;
          if (image) cx.drawImage(image.canvas as unknown as CanvasImageSource, 0, 0, video.largeur, video.hauteur);
          const courant = sousTitreA(sous, t);
          if (courant) dessinerSousTitre(cx, video.largeur, video.hauteur, courant.lignes, style);
        },
      });

      const nom = film.name.replace(/\.[^.]+$/, "") + "-sous-titre.mp4";
      const fichier = new File([rendu.blob], nom, { type: "video/mp4" });
      return {
        valeurs: [fichier],
        affichage: { url: URL.createObjectURL(rendu.blob), nom, octets: rendu.blob.size },
        message: traduire("msg.incrustation.resume",
          String(sous.length), String(rendu.images), enMo(rendu.blob.size).toFixed(1),
          (rendu.msTotal / 1000).toFixed(1)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
