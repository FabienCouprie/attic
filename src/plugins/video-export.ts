// plugins/video-export.ts — Nœud « Export vidéo » : écrit un film reçu sur son entrée dans le
// répertoire de travail, et rend son chemin.
//
// POURQUOI IL MANQUAIT, relevé par Fabien. Quatre composants parlent le flux vidéo : trois le
// produisent, un le consomme, et AUCUN ne l'écrivait sur le disque. « Sorties › Export » avait son
// export d'image, de SVG et de SFZ ; un film ne pouvait sortir que par le bouton d'un nœud, donc
// jamais depuis une chaîne. Un film qui se calcule doit pouvoir s'écrire sans qu'on clique.
//
// IL EST LE JUMEAU DE L'EXPORT D'IMAGE, et volontairement : mêmes réglages, même place, même façon
// de rendre le chemin écrit. Ce qui les sépare tient à l'extension et au poids.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";

/** Les conteneurs qu'un film peut porter ici. Le MP4 est le défaut, et ce qu'un lecteur ouvre partout. */
const EXTENSIONS = ["mp4", "webm", "mov", "mkv"];

function nomAvecExtension(nom: string, mime: string): string {
  const base = nom.replace(/\.(mp4|webm|mov|mkv|m4v)$/i, "").trim() || "film";
  const depuisMime = /webm/i.test(mime) ? "webm" : /quicktime|mov/i.test(mime) ? "mov" : "mp4";
  // Une extension écrite à la main est respectée si elle désigne un conteneur connu ; sinon c'est
  // le type réel du fichier qui décide, pour qu'un lecteur ne se trompe pas sur ce qu'il ouvre.
  const ecrite = nom.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return `${base}.${ecrite && EXTENSIONS.includes(ecrite) ? ecrite : depuisMime}`;
}

export const fiches: FicheAudio[] = ([
  {
    id: "export-video",
    nom: "Export vidéo", nomEn: "Video Export",
    univers: "Sorties", famille: "Export",
    resume: "Écrit un film sur le disque, dans le répertoire de travail, et rend son chemin.",
    resumeEn: "Writes a film to disk, in the working directory, and returns its path.",
    notice: "Écrit sur le disque le film reçu sur son entrée, dans le répertoire de travail, et rend le chemin écrit sur sa sortie.\n\n« Nom » donne le nom du fichier. Une extension qui désigne un conteneur connu est respectée ; à défaut, elle est déduite du type réel du film, de sorte qu'un lecteur ne se trompe pas sur ce qu'il ouvre. Les conteneurs reconnus sont MP4, WebM, MOV et MKV.\n\nLe film est écrit tel qu'il arrive, sans être ré-encodé : sa définition, sa cadence et sa qualité sont celles qu'il portait.\n\nLa sortie « Chemin » donne le chemin du fichier écrit, que la suite de la chaîne peut reprendre. Le message donne le nom et le poids.\n\nL'écriture sur le disque demande l'application de bureau ; dans un navigateur, le composant le dit au lieu d'échouer.",
    noticeEn: "Writes the film received on its input to disk, in the working directory, and returns the written path on its output.\n\n« Name » gives the file name. An extension naming a known container is respected; failing that, it is deduced from the film's actual type, so that a player is not mistaken about what it opens. The containers recognised are MP4, WebM, MOV and MKV.\n\nThe film is written as it arrives, without being re-encoded: its definition, its frame rate and its quality are those it carried.\n\nThe « Path » output gives the path of the written file, which the rest of the chain can take up. The message gives the name and the weight.\n\nWriting to disk requires the desktop application; in a browser, the node says so rather than failing.",
    entrees: [{ nom: "Vidéo", nomEn: "Video", type: "video" }],
    sorties: [{ nom: "Chemin", nomEn: "Path", type: "texte" }],
    parametres: [
      { nom: "Nom", nomEn: "Name", type: "texte", defaut: "film.mp4", defautEn: "film.mp4",
        doc: "Nom du fichier écrit, dans le répertoire de travail. Une extension connue est respectée ; sinon elle est déduite du type réel du film.",
        docEn: "Name of the file written, in the working directory. A known extension is respected; failing that it is deduced from the film's actual type." },
    ],
    async executer(ctx: any) {
      const api = (window as any).api;
      if (!api?.ecrireFichier) {
        return { valeurs: [null], message: traduire("msg.n_cessite_electron") };
      }
      const film = ctx.entree(0);
      if (!(film instanceof File)) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "Connect a film to the « Video » input." : "Brancher un film sur l'entrée « Vidéo ».",
        };
      }

      const nomFinal = nomAvecExtension(ctx.paramTexte("Nom", "film.mp4"), film.type);
      const chemin = `${ctx.repertoireTravail}/${nomFinal}`;
      const octets = new Uint8Array(await film.arrayBuffer());
      const ecrit = await api.ecrireFichier(chemin, octets);
      if (!ecrit) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? `Could not write ${nomFinal}.` : `Écriture impossible : ${nomFinal}.`,
        };
      }

      const mo = (octets.byteLength / 1048576).toFixed(1);
      return {
        valeurs: [chemin],
        message: en() ? `${nomFinal} · ${mo} MB written` : `${nomFinal} · ${mo} Mo écrits`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
