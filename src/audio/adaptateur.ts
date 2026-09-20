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

// Enregistrer toutes les fiches de plugins
for (const fiche of toutesLesFiches) {
  registre.enregistrer(fiche);
}

// Configurer les modules du cœur avec ce registre
configurerRegistreMeta(registre);
configurerRegistreNodes(registre);
configurerRegistreGestion(registre);

