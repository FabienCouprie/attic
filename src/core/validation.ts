// core/validation.ts — Garde-fou renforcé pour l'enregistrement des plugins
// et validation des graphes avant exécution.
//
//  1. **Validation des fiches** (valider) : types de ports enregistrés + couverture
//     du hash de cache. Erreurs bloquantes à l'enregistrement (spec §10).
//
//  2. **Validation des graphes** (validerGraphe) : résout les types de ports depuis
//     les PluginDef et rejette les arêtes dont les types sont incompatibles. Appliqué
//     avant le tri topologique : les nœuds affectés passent en statut « erreur » sans
//     exécution. Même patron que valider() mais au niveau du graphe (spec §10).
//
//  Les types de flux sont injectés (pas importés depuis un global) — chaque registre
//  a son propre jeu de types.
import type { PluginDef } from "./types";
import type { TypeFlux } from "./typesFlux";
import { empreinteParametres } from "./graphe";
import { indexPort, type NoeudG, type AreteG } from "./meta";

interface DepsTypesFlux {
  typeFlux: (id: string) => TypeFlux | undefined;
  fluxCompatibles: (sourceId: string, cibleId: string) => boolean;
}

export function valider<TV, TR>(def: PluginDef<TV, TR>, deps: DepsTypesFlux): { erreurs: string[]; avertissements: string[] } {
  const erreurs: string[] = [];
  const avertissements: string[] = [];

  if (!def.id) erreurs.push("id manquant");
  if (!def.nom) erreurs.push("nom manquant");
  if (!def.resume) erreurs.push("résumé manquant");
  if (typeof def.executer !== "function") erreurs.push("fonction executer manquante");
  if (!def.notice) avertissements.push("notice absente");
  for (const p of def.parametres ?? []) {
    if (!p.doc && !p.docEn) avertissements.push(`paramètre « ${p.nom} » sans documentation`);
  }

  for (const port of [...(def.entrees ?? []), ...(def.sorties ?? [])]) {
    if (!port.type) {
      erreurs.push(`port « ${port.nom} » sans type déclaré`);
    } else if (!deps.typeFlux(port.type)) {
      erreurs.push(`port « ${port.nom} » : type « ${port.type} » non enregistré dans typesFlux`);
    }
  }

  const params = def.parametres ?? [];
  if (params.length > 0) {
    const baseData = { parametres: {} as Record<string, unknown> };
    for (const p of params) baseData.parametres[p.nom] = p.defaut;
    const hashBase = empreinteParametres(baseData);

    for (const p of params) {
      const mutant = { parametres: { ...baseData.parametres } };
      if (typeof p.defaut === "number") mutant.parametres[p.nom] = p.defaut + 1;
      else if (typeof p.defaut === "string") mutant.parametres[p.nom] = p.defaut + "_x";
      else mutant.parametres[p.nom] = JSON.stringify(p.defaut) + "_x";
      const hashMutant = empreinteParametres(mutant);
      if (hashBase === hashMutant) {
        erreurs.push(`paramètre « ${p.nom} » non capturé par empreinteParametres (cache incohérent)`);
      }
    }
  }

  return { erreurs, avertissements };
}

export interface ResultatValidationGraphe {
  aretesInvalides: AreteG[];
  noeudsAffectes: Map<string, string[]>;
}

interface DefPourValidation {
  entrees: import("./types").PortDef[];
  sorties: import("./types").PortDef[];
}

export function validerGraphe(
  noeuds: NoeudG[],
  aretes: AreteG[],
  getDef: (ficheId: string) => DefPourValidation | undefined,
  fluxCompatibles: (sourceId: string, cibleId: string) => boolean,
): ResultatValidationGraphe {
  const aretesInvalides: AreteG[] = [];
  const noeudsAffectes = new Map<string, string[]>();
  const ficheDe = (id: string) => noeuds.find((n) => n.id === id)?.data.ficheId as string | undefined;

  for (const ar of aretes) {
    const ficheSource = ficheDe(ar.source);
    const ficheCible = ficheDe(ar.target);
    if (!ficheSource || !ficheCible) continue;

    const defSource = getDef(ficheSource);
    const defCible = getDef(ficheCible);
    if (!defSource || !defCible) continue;

    const si = indexPort(ar.sourceHandle, 0);
    const ti = indexPort(ar.targetHandle, 0);
    const typeSource = defSource.sorties[si]?.type;
    const typeCible = defCible.entrees[ti]?.type;
    if (!typeSource || !typeCible) continue;

    if (!fluxCompatibles(typeSource, typeCible)) {
      aretesInvalides.push(ar);
      const msg = `connexion illégale : ${typeSource} → ${typeCible} (${ar.source} → ${ar.target})`;
      const existant = noeudsAffectes.get(ar.target) ?? [];
      existant.push(msg);
      noeudsAffectes.set(ar.target, existant);
    }
  }

  for (const n of noeuds) {
    const def = getDef(n.data.ficheId as string);
    if (!def) continue;
    for (let i = 0; i < def.entrees.length; i++) {
      const port = def.entrees[i];
      if (port.requis === false) continue;
      const connecte = aretes.some(
        (a) => a.target === n.id && indexPort(a.targetHandle, 0) === i,
      );
      if (!connecte) {
        const msg = `entrée obligatoire « ${port.nom} » non connectée`;
        const existant = noeudsAffectes.get(n.id) ?? [];
        existant.push(msg);
        noeudsAffectes.set(n.id, existant);
      }
    }
  }

  return { aretesInvalides, noeudsAffectes };
}
