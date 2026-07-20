// ui/reactflowTypes.ts — Définitions stables de nodeTypes/edgeTypes pour React Flow.
// Extrait de App.tsx pour éviter la recréation de l'objet à chaque hot-reload,
// qui déclenche l'avertissement React Flow #002.
import { AtelierNode } from "./AtelierNode";
import { AretePersonnalisee } from "./AretePersonnalisee";

export const nodeTypes = { atelier: AtelierNode };
export const edgeTypes = { "arete-personnalisee": AretePersonnalisee };
