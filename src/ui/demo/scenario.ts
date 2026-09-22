// ui/demo/scenario.ts — Le scénario d'une démonstration filmée de l'application.
//
// Deux temps, enchaînés. LA CONSTRUCTION : le canevas se vide, puis le graphe se reconstruit à
// l'écran — chaque nœud posé à sa place, ses câbles tirés depuis les nœuds déjà posés, ses réglages
// ouverts dans l'inspecteur. LA VISITE : on lance le graphe, puis on passe d'un nœud à l'autre dans
// l'ordre du signal, inspecteur ouvert, en écoutant ce que chacun rend.
//
// Ce fichier est PUR : il dit quoi montrer et dans quel ordre, avec quelles légendes et combien de
// temps. Le jouer — le curseur, la caméra, la capture de la fenêtre — est l'affaire de
// `useRealisateurDemo.tsx`.

import { ordreTopologique } from "../../core/graphe";
import { ordreDeLecture } from "../../audio/demonstration";

export interface NoeudScenario { id: string; ficheId: string; label?: string }
export interface AreteScenario { id: string; source: string; target: string }

export interface DescriptionNoeud {
  nom: string;
  /** « Entrées › Génération » : où le trouver dans la palette. */
  chemin: string;
  /** Le nœud a des réglages à montrer dans l'inspecteur. */
  reglable: boolean;
}

export type ActionDemo =
  | { genre: "titre"; legende: string; duree: number }
  | { genre: "ajouter"; id: string; legende: string; duree: number }
  | { genre: "relier"; arete: string; source: string; target: string; legende: string; duree: number }
  | { genre: "regler"; id: string; legende: string; duree: number }
  | { genre: "lancer"; legende: string; duree: number }
  | { genre: "ecouter"; id: string; legende: string; duree: number }
  | { genre: "fin"; legende: string; duree: number };

/** Libellés, fournis traduits : `{nom}`, `{source}`, `{cible}`, `{chemin}` sont remplacés. */
export interface TextesScenario {
  ajouter: string;
  relier: string;
  regler: string;
  lancer: string;
  ecouter: string;
  fin: string;
}

export interface OptionsScenario {
  titre?: string;
  /** Temps d'écoute accordé à chaque nœud, au plus. */
  dureeParNoeud: number;
  /** Multiplie les durées de la construction : 0,5 va deux fois plus vite. */
  rythme?: number;
}

/** Durées de la construction, en secondes, au rythme 1. */
export const DUREES = { titre: 3, ajouter: 1.6, relier: 1.3, regler: 1.8, lancer: 1.5, fin: 2.5 };

const DECORATIFS = new Set(["comment", "frame"]);

function remplir(modele: string, valeurs: Record<string, string>): string {
  return modele.replace(/\{(nom|source|cible|chemin)\}/g, (_, k: string) => valeurs[k] ?? "");
}

export function scenarioDemo(
  noeuds: NoeudScenario[],
  aretes: AreteScenario[],
  decrire: (ficheId: string) => DescriptionNoeud | null,
  textes: TextesScenario,
  options: OptionsScenario,
): ActionDemo[] {
  const r = Math.max(0.25, options.rythme ?? 1);
  const montres = noeuds.filter((n) => !DECORATIFS.has(n.ficheId) && decrire(n.ficheId));
  const ids = new Set(montres.map((n) => n.id));
  const aretesUtiles = aretes.filter((a) => ids.has(a.source) && ids.has(a.target));
  const ordre = ordreDeLecture(ordreTopologique(montres.map((n) => n.id), aretesUtiles as never), aretesUtiles);
  const parId = new Map(montres.map((n) => [n.id, n]));
  const nomDe = (id: string) => {
    const n = parId.get(id)!;
    return (n.label && n.label.trim()) || decrire(n.ficheId)!.nom;
  };

  const actions: ActionDemo[] = [];
  const titre = (options.titre ?? "").trim();
  if (titre) actions.push({ genre: "titre", legende: titre, duree: DUREES.titre });

  const poses = new Set<string>();
  for (const id of ordre) {
    const n = parId.get(id)!;
    const d = decrire(n.ficheId)!;
    actions.push({ genre: "ajouter", id, legende: remplir(textes.ajouter, { nom: nomDe(id), chemin: d.chemin }), duree: DUREES.ajouter * r });
    poses.add(id);
    for (const a of aretesUtiles) {
      if (a.target !== id || !poses.has(a.source)) continue;
      actions.push({
        genre: "relier", arete: a.id, source: a.source, target: a.target,
        legende: remplir(textes.relier, { source: nomDe(a.source), cible: nomDe(id) }), duree: DUREES.relier * r,
      });
    }
    if (d.reglable) actions.push({ genre: "regler", id, legende: remplir(textes.regler, { nom: nomDe(id) }), duree: DUREES.regler * r });
  }

  actions.push({ genre: "lancer", legende: textes.lancer, duree: DUREES.lancer * r });
  for (const id of ordre) {
    actions.push({ genre: "ecouter", id, legende: remplir(textes.ecouter, { nom: nomDe(id) }), duree: Math.max(1, options.dureeParNoeud) });
  }
  actions.push({ genre: "fin", legende: textes.fin, duree: DUREES.fin });
  return actions;
}
