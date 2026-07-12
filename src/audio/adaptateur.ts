// audio/adaptateur.ts — Adaptateur du domaine audio.
//
// Crée un registre typé, enregistre les types de flux audio + toutes les fiches
// de plugins, et configure les modules du cœur qui ont besoin du registre
// (metastore, nodes-installes, registre-actif).
//
// C'est le SEUL endroit où `enregistrer()` est appelé. Importer un module de
// plugin n'a plus d'effet de bord — les fiches sont exportées, pas enregistrées.
import { creerRegistre, enregistrerTypeFlux } from "../core";
import { configurerRegistre as configurerRegistreMeta } from "../core/metastore";
import { configurerRegistreNodes } from "../core/nodes-installes";
import { toutesLesFiches } from "../plugins";
import type { PluginDef, TypeValeur } from "../core";

const registre = creerRegistre();

// Types de flux du domaine audio
enregistrerTypeFlux({ id: "audio", couleur: "#2a9d8f", libelle: "Audio" });
enregistrerTypeFlux({ id: "midi", couleur: "#e9a13b", libelle: "MIDI" });
enregistrerTypeFlux({ id: "controle", couleur: "#e8590c", libelle: "Contrôle" });
enregistrerTypeFlux({ id: "texte", couleur: "#36a2eb", libelle: "Texte" });
enregistrerTypeFlux({ id: "fichier", couleur: "#999", libelle: "Fichier" });

// Enregistrer toutes les fiches de plugins
for (const fiche of toutesLesFiches) {
  registre.enregistrer(fiche as PluginDef<TypeValeur, AudioContext>);
}

// Configurer les modules du cœur avec ce registre
configurerRegistreMeta(registre);
configurerRegistreNodes(registre);

export { registre };
