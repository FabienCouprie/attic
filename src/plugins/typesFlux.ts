// plugins/typesFlux.ts — Types de flux du DOMAINE AUDIO (spec §3.2).
// Le domaine déclare ici ses types + couleurs ; le cœur et l'UI les lisent via
// le registre (core/typesFlux). Ajouter un domaine = fournir un fichier analogue.
import { enregistrerTypeFlux } from "../core";

// Audio = signal sonore (vert) ; MIDI = notes symboliques ; Contrôle =
// valeur/position (durée, zones, profil…) ; Texte = donnée lisible (analyse) ;
// Fichier = binaire.
enregistrerTypeFlux({ id: "audio", couleur: "#2a9d8f", libelle: "Audio" });
enregistrerTypeFlux({ id: "midi", couleur: "#e9a13b", libelle: "MIDI" });
enregistrerTypeFlux({ id: "controle", couleur: "#e8590c", libelle: "Contrôle" });
enregistrerTypeFlux({ id: "texte", couleur: "#36a2eb", libelle: "Texte" });
enregistrerTypeFlux({ id: "fichier", couleur: "#999", libelle: "Fichier" });
