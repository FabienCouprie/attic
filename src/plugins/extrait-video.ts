// plugins/extrait-video.ts — Garder une portion d'un film, et rien d'autre.
//
// LA PRISE, ET RIEN QUE LA PRISE. Le calcul des bornes vit dans `audio/video-extrait.ts`, la lecture
// du fichier et l'écriture du MP4 dans `audio/video-sortie.ts`.
//
// LE SON DU FILM PART AVEC L'IMAGE, recopié lui aussi et jamais ré-encodé. Ce composant ne mélange
// aucun son, il n'en ajoute ni n'en retire : il coupe, et ce qui est dans la portion y reste.
//
// LE FILM N'EST PAS CHARGÉ EN MÉMOIRE : il est lu par plages, et l'image est recopiée sans être
// ré-encodée. Un extrait de onze minutes coûte donc le temps d'une copie, non celui d'un encodage.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { EXTENSIONS_VIDEO, extensionLisible } from "../audio/video-montage";
import { ecrireExtrait, ouvrirFilmParPlages, ouvrirVideo } from "../audio/video-sortie";
import { formatDuree, plageExtrait } from "../audio/video-extrait";

const en = () => langueCourante() === "en";
const MEGA = 1024 * 1024;

export const fiches: FicheAudio[] = ([
  {
    id: "extrait-video", nom: "Extrait vidéo", nomEn: "Video Excerpt",
    univers: "Autres", famille: "Vidéo",
    resume: "Garde une portion d'un film, entre deux images, avec son son, et la rend en MP4.",
    resumeEn: "Keeps a portion of a film, between two frames, with its sound, and returns it as MP4.",
    notice: "Ce composant garde une portion d'un film et rend cette portion en MP4.\n\nLe film se regarde dans le composant, et la portion gardée est dessinée sous lui sur son axe du temps. Une tête de lecture traverse l'axe à l'instant que l'image montre. Un clic sur l'axe déplace le film à cet instant ; les deux bords de la portion se déplacent à la souris. Les boutons « Début ici » et « Fin ici » posent une borne à l'instant où le film est arrêté. Le composant se redimensionne par ses bords.\n\n« Chemin » désigne le fichier du film. Le bouton « … » ouvre le sélecteur du système, et le champ accepte aussi un chemin saisi. Les conteneurs lus sont MP4, MOV, WebM, MKV et M4V. Un fichier WMV n'est pas lu : son conteneur et ses codecs n'ont de décodeur ni dans le moteur de l'application ni dans sa bibliothèque média, et le composant le dit au lieu d'échouer.\n\n« Image de début » et « Image de fin » bornent la portion, à la cadence que le film déclare. Une fin qui ne dépasse pas le début désigne la fin du film : les deux bornes à zéro gardent donc le film entier.\n\nL'image est recopiée telle quelle, sans être ré-encodée : la définition, la cadence et la qualité sont celles de l'original. Une image intermédiaire ne se décodant pas sans celles dont elle dépend, le fichier porte en plus les images qui vont de l'image clé précédente jusqu'au début demandé ; elles portent des instants négatifs, et la lecture commence à l'image demandée. Le fichier est donc un peu plus lourd que la portion seule. Le message du composant donne la durée produite à côté de la durée demandée.\n\nLe son du film est gardé sur la portion, recopié lui aussi, sans être ré-encodé. Un son qu'un fichier MP4 n'accepte pas tel quel est écarté plutôt que ré-encodé, et le message du composant le dit avec sa raison. La sortie est un fichier MP4. Le bouton « Enregistrer l'extrait », sous l'axe, l'écrit sur le disque ; tant qu'il n'est pas enregistré, le fichier n'existe qu'en mémoire.",
    noticeEn: "This node keeps a portion of a film and returns that portion as MP4.\n\nThe film is watched inside the node, and the kept portion is drawn under it on its time axis. A playhead crosses the axis at the instant the picture shows. A click on the axis moves the film to that instant; both edges of the portion are dragged with the mouse. The « Start here » and « End here » buttons set a bound at the instant where the film is stopped. The node is resized by its edges.\n\n« Path » names the film's file. The « … » button opens the system selector, and the field also accepts a typed path. The containers read are MP4, MOV, WebM, MKV and M4V. A WMV file is not read: neither its container nor its codecs have a decoder in the application's engine or in its media library, and the node says so rather than failing.\n\n« Start frame » and « End frame » bound the portion, at the frame rate the film declares. An end that does not exceed the start means the end of the film: both bounds at zero therefore keep the whole film.\n\nThe picture is copied as it is, without being re-encoded: the definition, the frame rate and the quality are those of the original. An intermediate frame cannot be decoded without the frames it depends on, so the file also carries the frames from the preceding key frame up to the requested start; they hold negative timestamps, and playback starts at the requested frame. The file is therefore a little heavier than the portion alone. The node's message gives the duration produced beside the requested one.\n\nThe film's sound is kept over the portion, copied as well, without being re-encoded. A sound that an MP4 file does not accept as it is gets discarded rather than re-encoded, and the node's message says so with its reason. The output is an MP4 file. The « Save the excerpt » button, under the axis, writes it to disk; until it is saved, the file exists only in memory.",
    entrees: [],
    sorties: [{ nom: "Vidéo", nomEn: "Video", type: "fichier" }],
    // Son résultat dépend d'un fichier du disque, que les empreintes du cache ne regardent pas.
    jamaisCache: true,
    parametres: [
      { nom: "Chemin", nomEn: "Path", type: "fichier", extensions: EXTENSIONS_VIDEO.map((e) => e.slice(1)), defaut: "", defautEn: "",
        doc: "Fichier du film, choisi par le bouton « … » ou saisi. Conteneurs lus : MP4, MOV, WebM, MKV, M4V.",
        docEn: "The film's file, chosen with the « … » button or typed. Containers read: MP4, MOV, WebM, MKV, M4V." },
      { nom: "Image de début", nomEn: "Start frame", type: "nombre", plage: [0, 2_000_000], pas: 1, defaut: 0,
        doc: "Première image gardée, à la cadence que le film déclare.",
        docEn: "First frame kept, at the frame rate the film declares." },
      { nom: "Image de fin", nomEn: "End frame", type: "nombre", plage: [0, 2_000_000], pas: 1, defaut: 0,
        doc: "Dernière image gardée. Une valeur qui ne dépasse pas le début désigne la fin du film.",
        docEn: "Last frame kept. A value that does not exceed the start means the end of the film." },
    ],
    async executer(ctx: any) {
      const chemin = ctx.paramTexte("Chemin", "").trim();
      if (!chemin) {
        return { valeurs: [null], message: en() ? "Name a film in « Path »." : "Indiquez un film dans « Chemin »." };
      }
      if (!extensionLisible(chemin)) {
        return {
          valeurs: [null], erreur: true,
          message: en()
            ? "Container not read. WMV and AVI have no decoder here; convert to MP4, MOV, WebM or MKV."
            : "Conteneur non lu. Le WMV et l'AVI n'ont pas de décodeur ici ; convertissez en MP4, MOV, WebM ou MKV.",
        };
      }
      const api = (window as any).api;
      if (!api?.lirePlage || !api?.tailleFichier) {
        return { valeurs: [null], erreur: true, message: en() ? "Requires the desktop application." : "Nécessite l'application de bureau." };
      }

      ctx.onProgress?.(en() ? "reading the film" : "lecture du film");
      let video;
      try {
        video = await ouvrirFilmParPlages(chemin, api);
      } catch {
        return { valeurs: [null], erreur: true, message: `${en() ? "Unreadable file" : "Fichier illisible"} : ${chemin}` };
      }
      if (!video.pisteVideo) {
        return { valeurs: [null], erreur: true, message: en() ? "No picture in this file." : "Aucune image dans ce fichier." };
      }

      const plage = plageExtrait(
        ctx.paramNombre("Image de début", 0),
        ctx.paramNombre("Image de fin", 0),
        video.cadence,
        video.dureeSec,
      );
      if (!(plage.finSec > plage.debutSec)) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "Empty portion: the start is at the end of the film." : "Portion vide : le début est à la fin du film.",
        };
      }

      ctx.onProgress?.(en() ? "copying the picture" : "copie de l'image");
      const { blob, sonGarde, raisonSon } = await ecrireExtrait(video, plage, {
        signal: ctx.signal,
        onProgress: (f) => ctx.onProgress?.(`${Math.round(f * 100)} %`),
      });

      // CE QUI A ÉTÉ PRODUIT, MESURÉ ET NON SUPPOSÉ. L'ajustement à l'image clé allonge l'extrait
      // d'une quantité que seule la lecture du fichier donne ; l'annoncer à côté de la durée demandée
      // évite de croire à une coupe à l'image près qui n'en est pas une.
      let dureeReelle = 0;
      try {
        const relu = await ouvrirVideo(await blob.arrayBuffer());
        dureeReelle = relu.dureeSec;
      } catch { /* la durée réelle reste inconnue, le reste du message vaut toujours */ }

      const data = ctx.noeud.data as Record<string, unknown>;
      if (typeof data._extraitVideoUrl === "string") URL.revokeObjectURL(data._extraitVideoUrl);
      data._extraitVideoUrl = URL.createObjectURL(blob);
      const nomSource = chemin.replace(/^.*[\\/]/, "");
      data._extraitVideoNom = `${(nomSource || "film").replace(/\.[^.]+$/, "")}-extrait.mp4`;
      data._extraitVideoOctets = blob.size;
      data._extraitVideoInfos = {
        dureeSec: video.dureeSec, cadence: video.cadence,
        largeur: video.largeur, hauteur: video.hauteur,
      };

      const fichier = new File([blob], String(data._extraitVideoNom), { type: "video/mp4" });
      const demandee = plage.finSec - plage.debutSec;
      const produite = dureeReelle > 0 ? formatDuree(dureeReelle) : "?";
      // LE SORT DU SON EST DIT, et non deviné : gardé, absent du film, ou écarté avec sa raison.
      const son = sonGarde
        ? (en() ? "sound kept" : "son gardé")
        : raisonSon
          ? `${en() ? "sound not copied" : "son non recopié"} (${raisonSon})`
          : (en() ? "silent film" : "film muet");
      return {
        valeurs: [fichier],
        message: `${plage.images} ${en() ? "frames" : "images"} · ${en() ? "asked" : "demandé"} ${formatDuree(demandee)} · `
          + `${en() ? "produced" : "produit"} ${produite} · ${video.cadence.toFixed(2)} ${en() ? "fps" : "im/s"} · `
          + `${son} · ${(blob.size / MEGA).toFixed(1)} Mo`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
