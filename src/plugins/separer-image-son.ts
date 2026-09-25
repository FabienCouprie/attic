// plugins/separer-image-son.ts — Défaire un film en ses deux moitiés.
//
// LE PREMIER COMPOSANT QUI PREND UNE VIDÉO EN ENTRÉE. Les sorties vidéo existaient déjà mais ne
// menaient nulle part, faute d'un port qui les accepte ; celui-ci en est un, et le type de flux
// « vidéo » est né avec lui. Ce qui circule sur une arête vidéo est un fichier MP4.
//
// DEUX MOITIÉS, DEUX NATURES. L'image sort telle quelle, recopiée sans être ré-encodée et débarrassée
// de sa piste sonore ; le son sort décodé, en tampon, comme tout audio du catalogue, donc traitable
// par le reste du catalogue et repose-able sur l'image par le montage.
//
// ÉCARTER LE SON NE LE DÉCODE PAS : la piste n'entre pas dans la sortie vidéo, et cette moitié-là
// coûte donc le temps d'une copie. Le son, lui, est décodé d'un bout à l'autre, et c'est la part
// lourde de ce composant.

import type { FicheAudio } from "../audio/types-domaine";
import { respirer } from "../core/respirer";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { ecrireSansSon, ouvrirVideo, sonDuFilm } from "../audio/video-sortie";

const en = () => langueCourante() === "en";
const MEGA = 1024 * 1024;

export const fiches: FicheAudio[] = ([
  {
    id: "separer-image-son", nom: "Séparer image et son", nomEn: "Split Picture and Sound",
    univers: "Autres", famille: "Vidéo",
    resume: "Prend un film et en rend deux choses : l'image sans son, et le son décodé.",
    resumeEn: "Takes a film and returns two things: the picture without sound, and the decoded sound.",
    notice: "Ce composant prend un film et en rend deux choses : l'image sans son, et le son.\n\n« Vidéo » reçoit un film d'une sortie vidéo d'un autre composant.\n\nLa sortie « Vidéo muette » rend le même film sans sa piste sonore. L'image est recopiée telle quelle, sans être ré-encodée : la définition, la cadence et la qualité sont celles de l'original. La piste sonore n'est pas décodée, elle n'entre pas dans le fichier. Le bouton « Enregistrer la vidéo muette » l'écrit sur le disque ; tant qu'il n'est pas enregistré, le fichier n'existe qu'en mémoire.\n\nLa sortie « Audio » rend le son du film décodé, à sa fréquence d'échantillonnage et avec son nombre de canaux. Un film muet donne un son vide et le composant le dit.\n\nLe message du composant donne la durée, la taille de la vidéo muette, et la fréquence d'échantillonnage du son rendu.",
    noticeEn: "This node takes a film and returns two things: the picture without sound, and the sound.\n\n« Video » receives a film from another node's video output.\n\nThe « Silent video » output returns the same film without its audio track. The picture is copied as it is, without being re-encoded: the definition, the frame rate and the quality are those of the original. The audio track is not decoded, it does not enter the file. The « Save the silent video » button writes it to disk; until it is saved, the file exists only in memory.\n\nThe « Audio » output returns the film's sound decoded, at its sample rate and with its channel count. A silent film gives an empty sound and the node says so.\n\nThe node's message gives the duration, the size of the silent video, and the sample rate of the returned sound.",
    entrees: [{ nom: "Vidéo", nomEn: "Video", type: "video", requis: true }],
    sorties: [
      { nom: "Vidéo muette", nomEn: "Silent video", type: "video" },
      { nom: "Audio", nomEn: "Audio", type: "audio" },
    ],
    parametres: [],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!(entree instanceof Blob)) {
        return {
          valeurs: [null, null],
          message: en() ? "Connect a video output." : "Branchez une sortie vidéo.",
        };
      }

      ctx.onProgress?.(en() ? "reading the film" : "lecture du film");
      // LE FICHIER VIENT D'UNE ARÊTE, DONC DE LA MÉMOIRE : il n'y a pas de chemin à lire par plages
      // ici, et le tampon existe déjà chez le composant d'amont.
      const video = await ouvrirVideo(await entree.arrayBuffer());
      if (!video.pisteVideo) {
        return { valeurs: [null, null], erreur: true, message: en() ? "No picture in this file." : "Aucune image dans ce fichier." };
      }

      ctx.onProgress?.(en() ? "copying the picture" : "copie de l'image");
      const blob = await ecrireSansSon(video, {
        signal: ctx.signal,
        onProgress: (f) => ctx.onProgress?.(`${Math.round(f * 100)} %`),
      });

      ctx.onProgress?.(en() ? "decoding the sound" : "décodage du son");
      const son = await sonDuFilm(video, respirer);

      const data = ctx.noeud.data as Record<string, unknown>;
      if (typeof data._videoMuetteUrl === "string") URL.revokeObjectURL(data._videoMuetteUrl);
      data._videoMuetteUrl = URL.createObjectURL(blob);
      const nomSource = (entree as File).name ?? "";
      data._videoMuetteNom = `${(nomSource || "film").replace(/\.[^.]+$/, "")}-muet.mp4`;
      data._videoMuetteOctets = blob.size;

      const fichier = new File([blob], String(data._videoMuetteNom), { type: "video/mp4" });
      const sonDit = son
        ? `${son.sampleRate} Hz · ${son.numberOfChannels} ${en() ? "ch" : "canaux"}`
        : (en() ? "silent film" : "film muet");
      return {
        valeurs: [fichier, son],
        message: `${video.dureeSec.toFixed(1)} s · ${video.largeur}x${video.hauteur} · `
          + `${(blob.size / MEGA).toFixed(1)} Mo · ${sonDit}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
