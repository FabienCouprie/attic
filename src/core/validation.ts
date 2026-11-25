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
import type { PluginDef, PortDef } from "./types";
import type { TypeFlux } from "./typesFlux";
import { empreinteParametres } from "./graphe";
import { estFrontiere, indexPort, type NoeudG, type AreteG } from "./meta";

interface DepsTypesFlux {
  typeFlux: (id: string) => TypeFlux | undefined;
  fluxCompatibles: (sourceId: string, cibleId: string) => boolean;
}

/**
 * Une faute qui fait refuser une fiche, dite par sa forme et non par une phrase.
 *
 * POURQUOI UNE FORME. Les erreurs de `valider` étaient des phrases françaises, et c'était tout : la
 * console les lisait, et l'interface ne pouvait que les compter. Un `.zip` refusé pour son manifeste
 * disait donc « 1 erreur(s), détaillées dans la console », console que personne ne lit dans
 * l'application construite. Le cœur ne traduit pas ; il dit ce qui manque, et la couche qui parle à
 * la personne le compose dans sa langue.
 */
export type FauteDeFiche =
  | { code: "id-manquant" }
  | { code: "nom-manquant" }
  | { code: "resume-manquant" }
  | { code: "executer-manquant" }
  | { code: "port-sans-type"; port: string }
  | { code: "type-inconnu"; port: string; type: string }
  | { code: "parametre-hors-empreinte"; parametre: string };

/** La phrase française d'une faute : celle que la console écrivait déjà, à l'identique. */
export function fauteEnFrancais(f: FauteDeFiche): string {
  switch (f.code) {
    case "id-manquant": return "id manquant";
    case "nom-manquant": return "nom manquant";
    case "resume-manquant": return "résumé manquant";
    case "executer-manquant": return "fonction executer manquante";
    case "port-sans-type": return `port « ${f.port} » sans type déclaré`;
    case "type-inconnu": return `port « ${f.port} » : type « ${f.type} » non enregistré dans typesFlux`;
    case "parametre-hors-empreinte": return `paramètre « ${f.parametre} » non capturé par empreinteParametres (cache incohérent)`;
  }
}

export function valider<TV, TR>(def: PluginDef<TV, TR>, deps: DepsTypesFlux):
  { erreurs: string[]; avertissements: string[]; fautes: FauteDeFiche[] } {
  const fautes: FauteDeFiche[] = [];
  const avertissements: string[] = [];

  if (!def.id) fautes.push({ code: "id-manquant" });
  if (!def.nom) fautes.push({ code: "nom-manquant" });
  if (!def.resume) fautes.push({ code: "resume-manquant" });
  if (typeof def.executer !== "function") fautes.push({ code: "executer-manquant" });
  if (!def.notice) avertissements.push("notice absente");
  for (const p of def.parametres ?? []) {
    if (!p.doc && !p.docEn) avertissements.push(`paramètre « ${p.nom} » sans documentation`);
  }

  for (const port of [...(def.entrees ?? []), ...(def.sorties ?? [])]) {
    if (!port.type) {
      fautes.push({ code: "port-sans-type", port: port.nom });
    } else if (!deps.typeFlux(port.type)) {
      fautes.push({ code: "type-inconnu", port: port.nom, type: port.type });
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
        fautes.push({ code: "parametre-hors-empreinte", parametre: p.nom });
      }
    }
  }

  return { erreurs: fautes.map(fauteEnFrancais), avertissements, fautes };
}

export interface ResultatValidationGraphe {
  aretesInvalides: AreteG[];
  noeudsAffectes: Map<string, string[]>;
}

interface DefPourValidation {
  entrees: import("./types").PortDef[];
  sorties: import("./types").PortDef[];
}

/**
 * La même validation, mais aussi SÉVÈRE QUE LA POSE D'UNE ARÊTE.
 *
 * TROIS SÉVÉRITÉS, ET ELLES NE SE CONFONDENT PAS :
 *
 *   lire un graphe enregistré   le transport seul, par `validerGraphe` ci-dessous
 *   poser une arête             le transport ET le contenu, par `ui/validerGraphe.ts`
 *   ÉCRIRE un graphe            le transport et le contenu, et c'est cette fonction
 *
 * POURQUOI LA TROISIÈME EXISTE. Un graphe écrit à la main, ou par un agent, n'a jamais rencontré la
 * souris : rien ne lui a refusé le câble qui n'a pas de sens, et la validation de lecture est
 * volontairement permissive pour ne retirer aucun câble à qui rouvre son travail. Entre les deux,
 * personne ne relisait un graphe AVANT de le lancer. C'est ce que fait celle-ci.
 */
export function validerAssemblage(
  noeuds: NoeudG[],
  aretes: AreteG[],
  getDef: (ficheId: string) => DefPourValidation | undefined,
  fluxCompatibles: (sourceId: string, cibleId: string, sousTypeSource?: string, sousTypeCible?: string) => boolean,
): ResultatValidationGraphe {
  const res = validerGraphe(noeuds, aretes, getDef, (s, c) => fluxCompatibles(s, c), fluxCompatibles);
  signalerPortsInexistants(noeuds, aretes, getDef, res);
  return res;
}

/**
 * Le câble qui vise un port que la fiche n'a pas, ou une poignée qui ne se lit pas.
 *
 * LA LECTURE SAUTE CE CÂBLE, et c'est voulu : un port n'a pas de type hors de la fiche, et un graphe
 * rouvert ne doit perdre aucun câble. Un graphe ÉCRIT, lui, doit l'entendre dire. Relevé le
 * 2026-11-25 : « in:7 » sur un nœud de trois entrées passait pour « rien à signaler », et « in:x »
 * se lisait comme l'entrée 0. Le contrat de graphe tient déjà ce rang pour les graphes du dépôt ;
 * celle-ci le tient pour ceux qu'on relit avant de les lancer.
 *
 * CE QU'ELLE NE DIT PAS : une poignée ABSENTE. La validation la lit comme le port 0, et le moteur ne
 * la donne à aucune entrée (`resoudreEntree` de `core/graphe.ts` la lit `in:-1`). Une sonde l'a
 * montré le même jour : une entrée obligatoire branchée par un câble sans `targetHandle` passe la
 * validation et reçoit `null`. Le trou est écrit au §3 de `PORTING-A-DOMAIN.md`.
 */
function signalerPortsInexistants(
  noeuds: NoeudG[],
  aretes: AreteG[],
  getDef: (ficheId: string) => DefPourValidation | undefined,
  res: ResultatValidationGraphe,
): void {
  const ficheDe = (id: string) => noeuds.find((n) => n.id === id)?.data.ficheId as string | undefined;
  const dire = (ou: string, msg: string, ar: AreteG) => {
    const existant = res.noeudsAffectes.get(ou) ?? [];
    existant.push(msg);
    res.noeudsAffectes.set(ou, existant);
    if (!res.aretesInvalides.includes(ar)) res.aretesInvalides.push(ar);
  };
  for (const ar of aretes) {
    const ficheSource = ficheDe(ar.source), ficheCible = ficheDe(ar.target);
    if (!ficheSource || !ficheCible || estFrontiere(ficheSource) || estFrontiere(ficheCible)) continue;
    const bouts: [string, string | null | undefined, PortDef[] | undefined, string][] = [
      [ar.source, ar.sourceHandle, getDef(ficheSource)?.sorties, "sortie"],
      [ar.target, ar.targetHandle, getDef(ficheCible)?.entrees, "entrée"],
    ];
    for (const [ou, poignee, ports, quoi] of bouts) {
      if (!ports || !poignee) continue;
      const rang = indexPort(poignee, -1);
      if (rang < 0) {
        dire(ou, `poignée « ${poignee} » illisible (${ar.source} → ${ar.target})`, ar);
      } else if (rang >= ports.length) {
        dire(ou, `poignée « ${poignee} » : aucune ${quoi} de ce rang, la fiche en déclare ${ports.length} `
          + `(${ar.source} → ${ar.target})`, ar);
      }
    }
  }
}

export function validerGraphe(
  noeuds: NoeudG[],
  aretes: AreteG[],
  getDef: (ficheId: string) => DefPourValidation | undefined,
  fluxCompatibles: (sourceId: string, cibleId: string) => boolean,
  /**
   * La règle SÉVÈRE, quand il y en a une : elle reçoit les sous-types en plus des types.
   *
   * ELLE EST FACULTATIVE, ET C'EST TOUTE LA SÛRETÉ DU DISPOSITIF. Sans elle, cette fonction est
   * exactement ce qu'elle a toujours été, et la lecture d'un graphe enregistré n'y perd rien.
   */
  avecContenu?: (sourceId: string, cibleId: string, sousTypeSource?: string, sousTypeCible?: string) => boolean,
): ResultatValidationGraphe {
  const aretesInvalides: AreteG[] = [];
  const noeudsAffectes = new Map<string, string[]>();
  const ficheDe = (id: string) => noeuds.find((n) => n.id === id)?.data.ficheId as string | undefined;

  for (const ar of aretes) {
    const ficheSource = ficheDe(ar.source);
    const ficheCible = ficheDe(ar.target);
    if (!ficheSource || !ficheCible) continue;
    // UN NŒUD-FRONTIÈRE N'A PAS DE TYPE, IL EN PREND UN. À l'intérieur d'un méta-composant, il
    // marque l'endroit où un port sera exposé ; le type de ce port est celui du port interne
    // auquel il se relie, et `redériverMeta` le lit là. Sa propre déclaration ne dit donc rien,
    // et la comparer à quoi que ce soit n'a pas de sens.
    //
    // CE CONTRÔLE REFUSAIT TOUT CE QUI N'ÉTAIT PAS DE L'AUDIO, et c'est ce qui bornait un méta à
    // n'exposer que du son. La pose de l'arête, elle, exempte les frontières depuis toujours : on
    // pouvait donc tirer le câble, et l'exécution le déclarait ensuite « connexion illégale :
    // texte → audio » en passant le nœud en erreur. Les deux contrôles disent enfin la même chose.
    if (estFrontiere(ficheSource) || estFrontiere(ficheCible)) continue;

    const defSource = getDef(ficheSource);
    const defCible = getDef(ficheCible);
    if (!defSource || !defCible) continue;

    const si = indexPort(ar.sourceHandle, 0);
    const ti = indexPort(ar.targetHandle, 0);
    const typeSource = defSource.sorties[si]?.type;
    const typeCible = defCible.entrees[ti]?.type;
    if (!typeSource || !typeCible) continue;

    const sousTypeSource = defSource.sorties[si]?.sousType;
    const sousTypeCible = defCible.entrees[ti]?.sousType;
    const va = avecContenu
      ? avecContenu(typeSource, typeCible, sousTypeSource, sousTypeCible)
      : fluxCompatibles(typeSource, typeCible);
    if (!va) {
      aretesInvalides.push(ar);
      // LE MESSAGE NOMME LE CONTENU QUAND C'EST LUI QUI REFUSE, sans quoi « texte → texte » serait
      // le seul mot d'un refus incompréhensible.
      const dit = (t: string, st?: string) => (st ? `${t}:${st}` : t);
      const msg = `connexion illégale : ${dit(typeSource, avecContenu && sousTypeSource)} → `
        + `${dit(typeCible, avecContenu && sousTypeCible)} (${ar.source} → ${ar.target})`;
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
