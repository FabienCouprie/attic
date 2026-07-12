// core/typesFlux.ts — Registre des TYPES DE FLUX (couleur + règle de
// compatibilité de connexion). Domaine-neutre : le cœur et l'UI ne connaissent
// plus l'union figée `audio|midi|controle|texte` — chaque domaine enregistre ses
// propres types de flux (audio, mais aussi image/masque, table/schéma, etc.).
//
// C'est l'un des points d'extension multi-domaines (cf. ARCHITECTURE.md §14) :
// un nouveau domaine fournit son jeu de types de flux sans toucher au cœur.

export interface TypeFlux {
  id: string;
  couleur: string;
  // Nom lisible optionnel (UI, légende).
  libelle?: string;
  // Un port de SORTIE de ce type peut-il alimenter un port d'ENTRÉE `cibleId` ?
  // Absent ⇒ compatibilité par identité stricte (source === cible).
  compatible?: (cibleId: string) => boolean;
}

const REGISTRE = new Map<string, TypeFlux>();

export function enregistrerTypeFlux(t: TypeFlux): void {
  REGISTRE.set(t.id, t);
}

export function typeFlux(id: string): TypeFlux | undefined {
  return REGISTRE.get(id);
}

export function tousTypesFlux(): TypeFlux[] {
  return [...REGISTRE.values()];
}

// Couleur d'un type de flux (gris neutre par défaut : type inconnu / « fichier »).
export function couleurFlux(id: string): string {
  return REGISTRE.get(id)?.couleur ?? "#999";
}

// Compatibilité source→cible : délègue à la règle du type source si fournie,
// sinon égalité stricte des ids. Réplique le comportement historique (`typeS === typeT`).
export function fluxCompatibles(sourceId: string, cibleId: string): boolean {
  const t = REGISTRE.get(sourceId);
  if (t?.compatible) return t.compatible(cibleId);
  return sourceId === cibleId;
}
