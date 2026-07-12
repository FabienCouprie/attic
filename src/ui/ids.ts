// ui/ids.ts — Génération d'identifiants de nœuds (schéma « noeud-N »).
// Partagé entre App (ajout de nœud) et useMetaComposants (création de méta).

export function idUnique(noeuds: { id: string }[]): string {
  let max = 0;
  for (const n of noeuds) {
    const m = n.id.match(/^noeud-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1]));
  }
  return `noeud-${max + 1}`;
}
