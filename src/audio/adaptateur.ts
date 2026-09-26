// audio/adaptateur.ts — Adaptateur du domaine audio.
//
// Crée un registre typé, enregistre les types de flux audio + toutes les fiches
// de plugins, et configure les modules du cœur qui ont besoin du registre
// (metastore, nodes-installes, registre-actif).
//
// C'est le SEUL endroit où `enregistrer()` est appelé. Importer un module de
// plugin n'a plus d'effet de bord — les fiches sont exportées, pas enregistrées.
import { creerRegistre } from "../core";
import { configurerRegistre as configurerRegistreMeta } from "../core/metastore";
import { configurerRegistreNodes } from "../core/nodes-installes";
import { configurerRegistreGestion } from "../plugins/gestion-nodes";
import { configurerRegistreQuiz } from "../plugins/quiz";
import { toutesLesFiches } from "../plugins";
import type { TypeValeur } from "../core";

export const registre = creerRegistre<TypeValeur, AudioContext>();

// Types de flux du domaine audio (dans le registre, pas dans un global)
  registre.enregistrerTypeFlux({ id: "audio", couleur: "#2a9d8f", libelle: "Audio" });
  registre.enregistrerTypeFlux({ id: "midi", couleur: "#e9a13b", libelle: "MIDI" });
  registre.enregistrerTypeFlux({ id: "controle", couleur: "#e8590c", libelle: "Contrôle" });
  registre.enregistrerTypeFlux({ id: "texte", couleur: "#36a2eb", libelle: "Texte" });
  registre.enregistrerTypeFlux({ id: "fichier", couleur: "#999", libelle: "Fichier" });
  registre.enregistrerTypeFlux({ id: "image", couleur: "#d63384", libelle: "Image" });
  registre.enregistrerTypeFlux({ id: "courbe", couleur: "#b06fe0", libelle: "Courbe" });
  // ORANGE FRANC, et non plus l'ambre #c99a2e : mesurée dans Lab, sa distance au MIDI (#e9a13b)
  // n'était que de 11,9 ΔE — deux tuyaux qu'on ne distingue pas d'un coup d'œil, et c'est ce qui a
  // été remonté. Celle-ci en est à 22,3 tout en restant à 24,2 du « Contrôle » (#e8590c), l'autre
  // orange de la palette : c'est le meilleur compromis mesuré entre les deux voisines.
  registre.enregistrerTypeFlux({ id: "banque", couleur: "#fb8c00", libelle: "Banque" });
  // VERT TILLEUL, la seule teinte que la palette n'occupait pas encore : un objet sonore n'est pas de
  // l'audio — il porte un son ET sa trajectoire, sans salle —, et il ne doit pouvoir se brancher que
  // sur un rendu d'objets. Un type distinct l'impose ; le teinter comme l'audio inviterait à l'erreur.
  registre.enregistrerTypeFlux({ id: "objet", couleur: "#82c91e", libelle: "Objet" });
  // CORAIL CLAIR, choisi par la mesure et non au jugé : sa distance en Lab à la couleur la plus
  // proche de la palette, le rose de l'image (#d63384), est de 40,5 ΔE, et toutes les autres sont
  // au-delà. C'était le meilleur des treize candidats essayés, le suivant étant à 38,7. Un film
  // n'est ni un fichier quelconque ni une image : il porte une durée, et un port qui le dit permet
  // enfin de brancher une sortie vidéo quelque part.
  registre.enregistrerTypeFlux({ id: "video", couleur: "#ff8787", libelle: "Vidéo" });
  // SÉPIA, et c'est la seule famille de teintes que la palette n'occupait pas : dix couleurs y
  // sont posées, du turquoise au corail, aucune n'est brune. Mesurée comme les deux précédentes,
  // en Lab : sa distance à la plus proche des dix, l'ambre du MIDI, est de 39,1 ΔE, la deuxième
  // étant à 42,6 — là où le dépôt a accepté 22,3 pour la banque. Et 69,2 ΔE du fond du canevas,
  // #0a1a40, quand la moins détachée des dix en est à 58,9 : les indigos d'encre tombaient tous
  // sous ce seuil et disparaissaient sur le bleu nuit.
  //
  // UN PORT QUI PORTE DES NOTES ET NON UN FICHIER. Le type « midi » transporte un `.mid`, dont le
  // numéro de note est un octet : une hauteur qui ne tombe pas sur un demi-ton n'y survit pas.
  // Voir `audio/sequence.ts` pour ce que cela empêchait.
  //
  // IL S'EST APPELÉ « PARTITION » LE TEMPS D'UNE HEURE, et Fabien a relevé la collision : quatre
  // ports Csound portent déjà ce nom pour un texte au format `sco`, et deux ports homonymes de
  // deux couleurs se seraient côtoyés dans la palette. Le mot promettait en outre une notation,
  // quand ce flux n'est qu'un convoi d'événements.
  registre.enregistrerTypeFlux({ id: "sequence", couleur: "#8b5a2b", libelle: "Séquence" });

// Enregistrer toutes les fiches de plugins
for (const fiche of toutesLesFiches) {
  registre.enregistrer(fiche);
}

// Configurer les modules du cœur avec ce registre
configurerRegistreMeta(registre);
configurerRegistreNodes(registre);
configurerRegistreGestion(registre);
configurerRegistreQuiz(registre);

