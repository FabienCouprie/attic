// core/registre-actif.ts — Référence au registre actif, configurée par l'adaptateur.
//
// Les plugins qui ont besoin d'accéder au registre au runtime (gestion-nodes,
// prompt-graphe) ne peuvent pas importer le registre directement car ils sont
// dans des modules séparés. L'adaptateur configure cette référence au démarrage.
import type { Registre } from "./registre";

let actif: Registre | null = null;

export function configurerRegistreActif(r: Registre): void { actif = r; }
export function registreActif(): Registre {
  if (!actif) throw new Error("[attic] Registre actif non configuré. L'adaptateur doit appeler configurerRegistreActif().");
  return actif;
}
