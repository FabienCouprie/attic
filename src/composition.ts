// src/composition.ts — La racine de composition : le seul endroit qui connaît les deux côtés.
//
// CE QUE CE FICHIER FAIT. Il branche un domaine sur le shell. Le shell (`src/ui/`) ne nomme aucun
// domaine : il demande le registre actif et la liste de liens de la barre d'outils. Le domaine
// (`src/audio/`, `src/plugins/`) ne connaît pas le shell. Ces deux mondes se rencontrent ici, et
// nulle part ailleurs.
//
// POUR BRANCHER UN AUTRE DOMAINE — images, données tabulaires, texte, robotique —, c'est ce fichier
// qu'on remplace : on y dépose un autre adaptateur, et rien de `src/ui/` ni de `src/core/` ne bouge.
// Voir `PORTING-A-DOMAIN.md`.
//
// POURQUOI UN MODULE À PART, ET POURQUOI IL DOIT ÊTRE IMPORTÉ EN PREMIER.
//
// `ui/App.tsx` fait son démarrage AU CHARGEMENT DU MODULE : il restaure une sauvegarde, relit les
// méta-composants locaux, installe les métas d'exemple, relit les nodes installés. Tout cela touche
// au registre. Or les imports d'un module sont évalués avant son corps : si les dépôts étaient
// écrits dans le corps de `main.tsx`, ils auraient lieu APRÈS l'évaluation de `App.tsx`, et le
// registre serait réclamé avant d'avoir été déposé. C'est exactement ce qui est arrivé, et
// l'application s'est arrêtée sur « Registre UI non configuré » avant de peindre une seule fois.
//
// Les dépôts vivent donc dans un module dont l'IMPORT, placé avant celui de l'application, est ce
// qui les déclenche. `src/docs/composition.test.ts` tient cet ordre : une contrainte d'ordre écrite
// dans un commentaire ne survit pas au premier trieur d'imports.

import { createElement } from "react";

import { registre } from "./audio/adaptateur";
import { configurerRegistreUI, type RegistreUI } from "./ui/registre-actif";
import { FAVORIS_SON } from "./audio/favoris";
import { configurerFavoris } from "./ui/favoris";
import { declarerGenresParametre } from "./ui/widgets-parametre";
import { SelecteurInstrumentSF2 } from "./vues-domaine/SelecteurInstrumentSF2";
// LES VUES DE NŒUD DU DOMAINE, déclarées par l'effet de bord de cet import. Le shell ne connaît
// aucune vue : `ui/registre-vues.ts` est vide tant que personne n'a déclaré, et `AtelierNode` ne
// charge plus les modules de vues de l'audio. Un autre domaine importe le sien à la place.
import "./vues-domaine/vues";
import { APERCU_AUDIO } from "./plugins/apercu-domaine";
import { configurerServicesApercu } from "./ui/services-apercu";
import { ORCHESTRATION_AUDIO } from "./plugins/orchestration-domaine";
import { configurerServicesOrchestration } from "./ui/services-orchestration";

// LE SEUL TRANSTYPAGE DU SYSTÈME, et c'est le bon endroit pour lui. `Registre` est invariant en ses
// deux paramètres — `enregistrer` les prend, `trouverDef` les rend —, si bien qu'un registre concret
// n'entre pas dans un registre générique sans qu'on le dise. Le dire ici l'interdit partout ailleurs.
configurerRegistreUI(registre as unknown as RegistreUI);

// Les bibliothèques que la barre d'outils propose relèvent du domaine : un domaine qui n'en déclare
// aucune n'a pas de bouton, au lieu d'un menu qui s'ouvrirait sur rien.
configurerFavoris(FAVORIS_SON);

// LES GENRES DE PARAMÈTRE PROPRES À L'AUDIO. `"sf2instrument"` était énuméré dans le cœur, rendu par
// une branche de l'inspecteur, et compté parmi les genres numériques par une troisième liste : trois
// endroits génériques nommaient un préréglage de banque SoundFont. Le genre se déclare ici, avec son
// composant de saisie et le fait que sa valeur est un nombre.
declarerGenresParametre({
  sf2instrument: {
    rendre: ({ valeur, defaut, onChanger }) =>
      createElement(SelecteurInstrumentSF2, {
        value: Number(valeur ?? defaut),
        onChange: (v: number) => onChanger(v),
      }),
    numerique: true,
  },
});

// CE QUE LE MOTEUR D'EXÉCUTION DEMANDE AU DOMAINE SUR LES VALEURS PRODUITES. Six fonctions audio
// étaient importées par `ui/hooks/useExecutionGraphe.ts`, sur le chemin d'exécution de tous les
// domaines : quelle sortie représente ce qu'un nœud a produit, combien de temps elle dure, comment
// en faire un aperçu écoutable, de combien le niveau a changé. Sans ces réponses, le graphe
// s'exécute et le canevas ne montre que ce qu'un nœud rend de lui-même.
configurerServicesApercu(APERCU_AUDIO);

// CE QUE LE MOTEUR POSE ET DEMANDE AUTOUR D'UN RUN : le graphe et l'exécution courants, posés pour
// les nœuds qui les lisent, et les dossiers qu'un graphe demande de lire avant de planifier. Les
// deux PILOTES de passes — le lot et les boucles de séquences — restent dans le moteur, pour la
// raison écrite en tête de `ui/services-orchestration.ts` : un domaine qui n'a rien à planifier
// obtient une exécution en une passe, ce qui est le comportement utile.
configurerServicesOrchestration(ORCHESTRATION_AUDIO);
