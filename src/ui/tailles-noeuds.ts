// src/ui/tailles-noeuds.ts — La taille de naissance de chaque composant sur le canevas.
//
// EXTRAIT D'`App.tsx` POUR ETRE INVENTORIE. La hauteur qu'un composant recoit a sa creation decide
// de ce que ses vues peuvent montrer : une vue dont la hauteur se deduit d'un ancetre n'affiche
// rien dans un noeud ne de 162 pixels. Ce choix vivait dans `App.tsx`, ou rien ne pouvait le lire ;
// il est ici pour que `docs/inventaire-ui.ts` le porte dans INTERFACE.md, et qu'un changement de
// taille se voie dans un diff plutot que de se decouvrir a l'ecran.
import type { FicheAudio } from "../audio/types-domaine";

export function tailleDefaut(def: FicheAudio): { width: number; height: number } {
  const nbPorts = Math.max(def.entrees.length, def.sorties.length, 1);
  const nbParams = def.parametres.length;
  let w = 260;
  if (def.id === "clavier-melodie") return { width: 500, height: 260 };
  // Un peu plus haut que le precedent : une ligne de plus, qui dit quelle banque est chargee.
  if (def.id === "clavier-sfz") return { width: 540, height: 300 };
  // La liste a cocher des instruments : onze lignes et leurs intitules de famille.
  if (def.id === "orchestre-csound") return { width: 340, height: 420 };
  if (def.id === "visualiseur-forme-onde") return { width: 420, height: 240 };
  if (def.id === "analyseur-spectre") return { width: 420, height: 300 };
  if (def.id === "spectrogramme") return { width: 420, height: 300 };
  if (def.id === "oscillateur") return { width: 420, height: 340 };
  if (def.id === "reponse-filtre") return { width: 420, height: 300 };
  if (def.id === "noms-instruments") return { width: 300, height: 320 };
  if (def.id === "styles-musicaux") return { width: 300, height: 320 };
  if (def.id === "emotions") return { width: 300, height: 320 };
  if (def.id === "tessitures-voix") return { width: 300, height: 320 };
  if (def.id === "generateur-script-ia") return { width: 380, height: 400 };
  if (def.id === "detecteur-accords") return { width: 320, height: 340 };
  if (def.id === "vu-metre") return { width: 300, height: 260 };
  if (def.id === "goniometre") return { width: 330, height: 470 };
  if (def.id === "score-esthetique") return { width: 420, height: 380 };
  if (def.id === "comparaison-esthetique") return { width: 380, height: 300 };
  if (def.id === "colorsynth") return { width: 280, height: 220 };
  if (def.id === "generateur-pochette") return { width: 300, height: 420 };
  if (def.id === "attracteur-ifs") return { width: 320, height: 320 };
  // L'animation occupe toute la place laissée par l'en-tête, les trois ports et le lecteur : sans
  // hauteur déclarée, le nœud naissait à la hauteur de son seul contenu et l'image recevait 8 px.
  if (def.id === "cercle-pulsant") return { width: 300, height: 500 };
  if (def.id === "partition-verovio") return { width: 420, height: 320 };
  if (def.id === "rendu-image") return { width: 320, height: 320 };
  if (def.id === "entree-image") return { width: 320, height: 320 };
  if (def.id === "lecteur-svg") return { width: 320, height: 320 };
  if (def.id.startsWith("vexflow-")) {
    const largeur = Number(def.parametres.find((p) => p.nom === "Largeur" || p.nomEn === "Width")?.defaut ?? 500);
    const hauteur = Number(def.parametres.find((p) => p.nom === "Hauteur" || p.nomEn === "Height")?.defaut ?? 160);
    return { width: largeur, height: hauteur };
  }
  if (def.id === "galerie-exposition") return { width: 280, height: 280 };
  if (def.id === "gestion-nodes") return { width: 280, height: 220 };
  if (def.id === "couleur-suno-ia") return { width: 300, height: 260 };
  if (def.id === "source-texte") return { width: 280, height: 200 };
  if (def.id === "sortie-texte") return { width: 280, height: 250 };
  // La même zone qu'une sortie texte, plus la ligne du bouton et du compte.
  if (def.id === "modifier-texte") return { width: 300, height: 280 };
  if (def.id === "python-processor") return { width: 380, height: 300 };
  if (def.id === "sequenceur-batterie-avance") return { width: 480, height: 360 };
  if (def.id === "sequenceur-melodique") return { width: 460, height: 400 };
  if (def.id === "sequenceur-accords") return { width: 480, height: 380 };
  if (def.id === "enveloppe-adsr") return { width: 420, height: 300 };
  if (def.id === "selecteur-multi-zones") return { width: 460, height: 340 };
  if (def.id === "collection-lecteur-musique") return { width: 380, height: 320 };
  if (def.id.startsWith("collection-")) return { width: 380, height: 280 };
  if (def.id === "lecteur-analyse") return { width: 380, height: 300 };
  if (def.id === "classificateur-genre") return { width: 380, height: 300 };
  if (def.id === "multi-reservoirs") return { width: 280, height: 540 };
  // Le film en haut, six bandes dessous : un nœud étroit ne montrerait ni l'un ni les autres. Il se
  // redimensionne ensuite, la vue suivant sa boîte.
  if (def.id === "montage-video") return { width: 520, height: 560 };
  // Une seule bande sous l'image, donc moins haut que le montage.
  if (def.id === "extrait-video") return { width: 480, height: 420 };
  // Nodes standard : largeur fixe, hauteur = contenu réel (en-tête + ports + statut)
  void nbParams; void w;
  return { width: 240, height: nbPorts * 22 + 96 };
}
