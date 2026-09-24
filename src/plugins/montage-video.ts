// plugins/montage-video.ts — Poser des sons sur un film, et rendre le film sonorisé.
//
// LA PRISE, ET RIEN QUE LA PRISE. Le calcul des instants et l'ajustement à la durée vivent dans
// `audio/video-montage.ts`, la lecture du fichier et l'écriture du MP4 dans `audio/video-sortie.ts`,
// et le mélange dans `audio/objets-sonores.ts` — celui du montage, pour qu'il n'y ait qu'une écriture
// des fondus à puissance constante.
//
// LES INSTANTS SE COMPTENT EN IMAGES, à la demande de Fabien : c'est ainsi qu'on cale un son sur un
// plan. La cadence employée est celle que le fichier déclare, mesurée sur ses paquets ; à 29,97
// images par seconde, l'image mille tombe à 33,3667 s et non à 33,3333, et l'écart croît avec la
// durée.
//
// LE SON D'ORIGINE EST GARDÉ, comme une piste parmi les autres, avec son gain : le baisser à moins
// soixante revient à le supprimer, sans qu'il faille un réglage de plus.

import type { FicheAudio } from "../audio/types-domaine";
import { respirer } from "../core/respirer";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { monter } from "../audio/objets-sonores";
import { ajusterALaVideo, EXTENSIONS_VIDEO, extensionLisible, plansDepuisPistes, type PisteVideo } from "../audio/video-montage";
import { ecrireMp4, ouvrirFilmParPlages, sonDuFilm } from "../audio/video-sortie";
import { creteDeColonnes, enveloppeDeTampon } from "../audio/pistes-visu";

/** Six, comme le visualiseur : au-delà, on ne suit plus ce qu'on a posé. */
export const PISTES_VIDEO = 6;

const en = () => langueCourante() === "en";
const MEGA = 1024 * 1024;

export const fiches: FicheAudio[] = ([
  {
    id: "montage-video", nom: "Montage vidéo", nomEn: "Video Montage",
    univers: "Autres", famille: "Vidéo",
    resume: "Pose jusqu'à six sons sur un film, chacun à son image, et rend le film sonorisé en MP4.",
    resumeEn: "Lays up to six sounds on a film, each at its own frame, and returns the scored film as MP4.",
    notice: "Ce composant prend un film, lui ajoute des sons et rend un MP4.\n\nLe film se regarde dans le composant, et les pistes se placent sous lui sur son axe du temps. Une tête de lecture traverse les bandes à l'instant que l'image montre. Un clic sur les bandes déplace le film à cet instant ; une bande tirée à la souris change son réglage « Image n ». Le composant se redimensionne par ses bords, et la vue suit sa taille.\n\nUne piste branchée reçoit une bande dès qu'elle est branchée, et la forme de son onde y paraît après une exécution ; une piste débranchée perd la sienne aussitôt. Après cette exécution, les pistes s'entendent sur le film pendant sa lecture, chacune à son instant, à son niveau et avec ses fondus. Le son d'origine du film s'entend avec elles, au niveau que « Gain du film » lui donne ; un niveau positif s'y entend à zéro décibel, et à sa valeur dans le fichier produit.\n\n« Chemin » désigne le fichier du film. Le bouton « … » ouvre le sélecteur du système, et le champ accepte aussi un chemin saisi. Les conteneurs lus sont MP4, MOV, WebM, MKV et M4V. Un fichier WMV n'est pas lu : son conteneur et ses codecs n'ont de décodeur ni dans le moteur de l'application ni dans sa bibliothèque média, et le composant le dit au lieu d'échouer.\n\nIl montre deux pistes au départ ; les boutons « + » et « − », sous ses entrées, l'allongent ou le raccourcissent, jusqu'à six. Chaque piste a quatre réglages : l'image où elle commence, son niveau, son fondu d'entrée et son fondu de sortie. Ils n'apparaissent que pour les pistes branchées.\n\nLes débuts se comptent en images, à la cadence que le film déclare. Une image n'est pas un trentième de seconde : à 29,97 images par seconde, l'image mille tombe à 33,3667 s, et l'écart avec un calcul à trente atteint une seconde au bout de dix minutes.\n\n« Gain du film » règle le son d'origine, qui est gardé et mélangé aux pistes. À moins soixante décibels, il se tait.\n\nLa durée du fichier produit est celle du film. Un son qui dépasserait la fin est coupé avec un fondu. L'image est recopiée telle quelle, sans être ré-encodée : la définition, la cadence et la qualité du film sont celles de l'original.\n\nLa sortie est un fichier MP4, dont le son est en AAC. Le bouton « Enregistrer le film sonorisé », sous les pistes, l'écrit sur le disque ; tant qu'il n'est pas enregistré, le fichier n'existe qu'en mémoire. Le fichier du film est lu par plages, sans être chargé en entier. Le composant annonce la mémoire qu'il a retenue : le son décodé du film, le mélange et le fichier produit s'y ajoutent.",
    noticeEn: "This node takes a film, adds sounds to it and returns an MP4.\n\nThe film is watched inside the node, and the tracks are laid under it on its time axis. A playhead crosses the bands at the instant the picture shows. A click on the bands moves the film to that instant; a band dragged with the mouse changes its « Frame n » setting. The node is resized by its edges, and the view follows its size.\n\nA connected track gets a band as soon as it is connected, and its waveform appears there after a run; a disconnected track loses its own at once. After that run, the tracks are heard over the film as it plays, each at its own instant, at its own level and with its fades. The film's own sound is heard with them, at the level « Film level » gives it; a positive level is heard there at zero decibels, and at its value in the produced file.\n\n« Path » names the film's file. The « … » button opens the system selector, and the field also accepts a typed path. The containers read are MP4, MOV, WebM, MKV and M4V. A WMV file is not read: neither its container nor its codecs have a decoder in the application's engine or in its media library, and the node says so rather than failing.\n\nIt shows two tracks to begin with; the « + » and « - » buttons under its inputs make it longer or shorter, up to six. Each track has four settings: the frame at which it starts, its level, its fade in and its fade out. They only appear for connected tracks.\n\nStarts are counted in frames, at the frame rate the film declares. A frame is not a thirtieth of a second: at 29.97 frames per second, frame one thousand falls at 33.3667 s, and the gap against a calculation at thirty reaches one second after ten minutes.\n\n« Film level » sets the original sound, which is kept and mixed with the tracks. At minus sixty decibels it falls silent.\n\nThe length of the produced file is the film's. A sound running past the end is cut with a fade. The picture is copied as it is, without being re-encoded: the definition, the frame rate and the quality are those of the original.\n\nThe output is an MP4 file whose sound is AAC. The « Save the scored film » button, under the tracks, writes it to disk; until it is saved, the file exists only in memory. The film's file is read by ranges, without being loaded whole. The node states the memory it has held: the film's decoded sound, the mix and the produced file add up.",
    entrees: Array.from({ length: PISTES_VIDEO }, (_, k) => ({
      nom: `Piste ${k + 1}`, nomEn: `Track ${k + 1}`, type: "audio" as const, requis: false,
    })),
    entreesExtensibles: { min: 2, defaut: 2 },
    sorties: [{ nom: "Vidéo", nomEn: "Video", type: "fichier" }],
    // Son résultat dépend d'un fichier du disque, que les empreintes du cache ne regardent pas.
    jamaisCache: true,
    parametres: [
      // Le dialogue du système veut les extensions sans leur point, la reconnaissance du conteneur
      // les compare avec : une seule liste, tenue là où elle sert à décider, et pelée ici.
      { nom: "Chemin", nomEn: "Path", type: "fichier", extensions: EXTENSIONS_VIDEO.map((e) => e.slice(1)), defaut: "", defautEn: "",
        doc: "Fichier du film, choisi par le bouton « … » ou saisi. Conteneurs lus : MP4, MOV, WebM, MKV, M4V.",
        docEn: "The film's file, chosen with the « … » button or typed. Containers read: MP4, MOV, WebM, MKV, M4V." },
      { nom: "Gain du film", nomEn: "Film level", type: "curseur", plage: [-60, 12], pas: 0.5, defaut: 0, unite: "dB",
        doc: "Niveau du son d'origine du film, gardé et mélangé aux pistes. À −60 dB, il se tait.",
        docEn: "Level of the film's own sound, kept and mixed with the tracks. At −60 dB it falls silent." },
      ...Array.from({ length: PISTES_VIDEO }, (_, k) => [
        { nom: `Image ${k + 1}`, nomEn: `Frame ${k + 1}`, type: "nombre" as const, plage: [0, 2_000_000] as [number, number], pas: 1, defaut: 0, port: k,
          doc: `Image du film où commence la piste ${k + 1}.`,
          docEn: `Frame of the film at which track ${k + 1} starts.` },
        { nom: `Gain ${k + 1}`, nomEn: `Gain ${k + 1}`, type: "curseur" as const, plage: [-60, 12] as [number, number], pas: 0.5, defaut: 0, unite: "dB", port: k,
          doc: `Niveau de la piste ${k + 1}.`, docEn: `Level of track ${k + 1}.` },
        { nom: `Fondu entrée ${k + 1}`, nomEn: `Fade in ${k + 1}`, type: "nombre" as const, plage: [0, 60000] as [number, number], pas: 1, defaut: 10, unite: "ms", port: k,
          doc: `Durée du fondu d'entrée de la piste ${k + 1}.`,
          docEn: `Length of track ${k + 1}'s fade in.` },
        { nom: `Fondu sortie ${k + 1}`, nomEn: `Fade out ${k + 1}`, type: "nombre" as const, plage: [0, 60000] as [number, number], pas: 1, defaut: 10, unite: "ms", port: k,
          doc: `Durée du fondu de sortie de la piste ${k + 1}.`,
          docEn: `Length of track ${k + 1}'s fade out.` },
      ]).flat(),
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
      // LE FILM N'EST PAS CHARGÉ EN MÉMOIRE. Il est lu par plages, à la demande de la bibliothèque :
      // l'index, puis les paquets recopiés, et rien d'autre. C'est ce qui permet un film plus gros
      // que ce qu'une page peut tenir.
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

      ctx.onProgress?.(en() ? "decoding its sound" : "décodage de son son");
      const sonFilm = await sonDuFilm(video, respirer);

      const pistes: PisteVideo[] = [];
      if (sonFilm) {
        pistes.push({
          piste: -1, son: sonFilm, image: 0, gainDb: ctx.paramNombre("Gain du film", 0),
          fonduEntreeMs: 0, fonduSortieMs: 0,
        });
      }
      for (let k = 0; k < PISTES_VIDEO; k++) {
        const son = ctx.entree(k);
        if (!(son instanceof AudioBuffer)) continue;
        pistes.push({
          piste: k, son,
          image: ctx.paramNombre(`Image ${k + 1}`, 0),
          gainDb: ctx.paramNombre(`Gain ${k + 1}`, 0),
          fonduEntreeMs: ctx.paramNombre(`Fondu entrée ${k + 1}`, 10),
          fonduSortieMs: ctx.paramNombre(`Fondu sortie ${k + 1}`, 10),
        });
      }
      if (pistes.length === 0) {
        return { valeurs: [null], erreur: true, message: en() ? "Silent film and no track connected." : "Film muet et aucune piste branchée." };
      }

      ctx.onProgress?.(en() ? "mixing" : "mélange");
      await respirer();
      const brut = await monter(plansDepuisPistes(pistes, video.cadence));
      const melange = ajusterALaVideo(brut, video.dureeSec);

      ctx.onProgress?.(en() ? "copying the picture" : "copie de l'image");
      const blob = await ecrireMp4(video, melange, {
        signal: ctx.signal,
        onProgress: (f) => ctx.onProgress?.(`${Math.round(f * 100)} %`),
      });

      const data = ctx.noeud.data as Record<string, unknown>;
      if (typeof data._videoMontageUrl === "string") URL.revokeObjectURL(data._videoMontageUrl);
      data._videoMontageUrl = URL.createObjectURL(blob);
      const nomSource = chemin.replace(/^.*[\\/]/, "");
      data._videoMontageSource = nomSource;
      // La vue lit ceci : seule l'exécution connaît la cadence et la durée du film.
      data._videoMontageInfos = {
        dureeSec: video.dureeSec, cadence: video.cadence,
        largeur: video.largeur, hauteur: video.hauteur,
      };
      // LES ENVELOPPES, ET NON LES SONS. La vue dessine les bandes avec ; six tampons retenus pour
      // l'affichage pèseraient des dizaines de mégaoctets, ces colonnes pèsent seize kilo-octets.
      data._videoMontagePistes = pistes
        .filter((p) => p.piste >= 0)
        .map((p) => {
          const colonnes = enveloppeDeTampon(p.son);
          return {
            piste: p.piste, dureeSec: p.son.duration,
            crete: creteDeColonnes(colonnes), colonnes,
          };
        });
      // LES SONS EUX-MÊMES, pour les entendre sur le film. Ce sont les tampons des composants en
      // amont, désignés et non recopiés : ils vivent déjà dans le cache d'exécution, et ce sont les
      // sons posés, courts par nature, jamais le film. Le son du film, lui, est rendu par l'élément
      // vidéo et n'a donc pas à être gardé.
      data._videoMontageSons = Object.fromEntries(
        pistes.filter((p) => p.piste >= 0).map((p) => [p.piste, p.son]),
      );

      const nom = (nomSource || "montage").replace(/\.[^.]+$/, "");
      const fichier = new File([blob], `${nom}-sonorise.mp4`, { type: "video/mp4" });
      // La vue propose de l'enregistrer : un fichier produit qui ne se récupère nulle part n'est pas
      // produit. Le nom et la taille viennent d'ici, personne d'autre ne les connaît.
      data._videoMontageNom = fichier.name;
      data._videoMontageOctets = blob.size;
      // Les octets du film n'entrent pas dans ce compte : ils n'ont jamais été tenus. Restent le
      // mélange et le fichier produit.
      const retenu = (melange.length * melange.numberOfChannels * 4 + blob.size) / MEGA;
      return {
        valeurs: [fichier],
        message: `${pistes.length} ${en() ? "tracks" : "pistes"} · ${video.dureeSec.toFixed(1)} s · `
          + `${video.cadence.toFixed(2)} ${en() ? "fps" : "im/s"} · ${(blob.size / MEGA).toFixed(0)} Mo · `
          + `${en() ? "held" : "retenu"} ${retenu.toFixed(0)} Mo`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
