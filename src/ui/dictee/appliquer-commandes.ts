// ui/dictee/appliquer-commandes.ts — Ce qu'une suite de commandes fait au graphe.
//
// ═══ POURQUOI CE MODULE EXISTE, ET D'OÙ IL SORT ═══
//
// La dictée avait déjà sa grammaire — `commandes-dictee.ts` — et ses règles de placement —
// `pose-dictee.ts` —, toutes deux pures, sans React, éprouvées une à une. Mais l'APPLICATION de
// ces commandes vivait dans `ui/App.tsx`, en cent quarante-six lignes, dans le plus gros fichier du
// dépôt et à son plafond de dette. Trois conséquences, chacune mesurée :
//
//   · LE SEUL CHEMIN QUI MENAIT À CES VERBES ÉTAIT UN MICRO. `tests-e2e/` ne portait aucune épreuve
//     de dictée : la chaîne parole → commandes → canevas n'était exercée NULLE PART, seules ses
//     deux moitiés pures l'étaient.
//   · « POSER UN COMPOSANT » ÉTAIT ÉCRIT DEUX FOIS dans `App.tsx` : `ajouterNoeud`, qu'emploient la
//     palette et les boutons de frontière, et la fonction `poser` d'ici, qui ne l'appelait pas. Les
//     deux calculaient la même chose dans le même ordre — fiche, valeurs par défaut des paramètres,
//     taille, identifiant, objet de nœud — à la position près. Le commentaire de six lignes sur la
//     forme canonique d'un paramètre « choix » n'existait que d'un côté : si cette règle changeait,
//     un seul des deux chemins aurait suivi.
//   · ET RIEN NE POUVAIT L'ÉPROUVER SANS MONTER REACT.
//
// ═══ CE QUI RESTE AU SHELL, ET POURQUOI ═══
//
// Ce module ne pose rien : il CALCULE un lot — des nœuds, des arêtes, des arêtes à détourner — et
// le rend. C'est `App.tsx` qui le verse, parce que verser veut dire `pushHistorique`, `setNodes` et
// `setEdges`, et que ce sont des gestes de React.
//
// « ANNULER » EST LA SEULE COMMANDE QUI NE PEUT PAS ÊTRE CALCULÉE D'AVANCE, et c'est elle qui a
// tenu ce code dans `App.tsx` : elle verse ce qui attend, DÉFAIT, puis repart de l'état obtenu —
// que ce module ne peut pas prévoir, l'historique ne lui appartenant pas. La suite s'arrête donc
// là, en disant ce qu'il reste à faire : l'appelant verse, défait, et redemande.

import type { Commande } from "./commandes-dictee";
import type { Position as PositionDictee } from "./commandes-dictee";
import {
  dernierDeFiche, noeudCourant, planInsertion, positionSuivante,
  type AreteDeDictee, type NoeudPose,
} from "./pose-dictee";

/** Ce qu'une arête dictée emprunte comme ports, et de quoi la dessiner. */
export interface LienDicte {
  sourceHandle: string;
  targetHandle: string;
  type: "arete-personnalisee";
  style: { stroke: string; strokeWidth: number };
}

/** Une arête déjà posée dont une insertion change un bout. */
export interface Detournement {
  id: string;
  vers: string;
  ou: "apres" | "avant";
}

/**
 * Ce que l'applicateur ne sait pas faire lui-même, et que le canevas lui prête.
 *
 * `fabriquerNoeud` EST LE POINT QUI RÉUNIT LES DEUX ÉCRITURES : c'est la même fonction qui sert à
 * la palette. Elle rend `null` sur une fiche inconnue, ce que l'appelant traduit en refus.
 */
export interface OutilsDeDictee<N extends NoeudPose> {
  nomDeFiche(ficheId: string): string;
  existe(ficheId: string): boolean;
  fabriquerNoeud(ficheId: string, position: { x: number; y: number }, noeuds: readonly N[]): N | null;
  lienDicte(noeuds: readonly N[], source: string, target: string): LienDicte | null;
  fermeraitUnCycle(de: string, vers: string, aretes: readonly AreteDeDictee[]): boolean;
  traduire(cle: string, ...args: unknown[]): string;
}

/** L'état du canevas au moment où la suite commence. */
export interface EtatDicte<N extends NoeudPose> {
  noeuds: readonly N[];
  aretes: readonly AreteDeDictee[];
  /** Le nœud sélectionné, sur lequel la dictée enchaîne de préférence. */
  selectionId: string | null;
  /** Le dernier nœud que la dictée a posé, quand rien n'est sélectionné. */
  dernier: string | null;
}

/** Ce qu'il y a à verser sur le canevas. */
export interface LotDicte<N extends NoeudPose> {
  nouveaux: N[];
  aretes: (AreteDeDictee & LienDicte)[];
  aDetourner: Detournement[];
  /** Le nœud sur lequel la prochaine dictée enchaînera. */
  dernier: string | null;
  /** Ce qu'il y a à dire quand un geste n'a pas pu s'appliquer entièrement. */
  avis?: string;
}

/** Les trois gestes de séance, retenus et non faits sur-le-champ. Voir `appliquerCommandes`. */
export interface GestesDeSeance {
  lancer: boolean;
  arreter: boolean;
  recentrer: boolean;
}

export interface SuiteDicte<N extends NoeudPose> {
  lot: LotDicte<N>;
  /** Vrai quand la suite s'est arrêtée sur « annuler » : verser, défaire, puis reprendre `reste`. */
  annulerEnsuite: boolean;
  reste: Commande[];
  seance: GestesDeSeance;
}

/**
 * Applique une suite de commandes à un état de canevas, et rend ce qu'il y a à verser.
 *
 * LES TROIS GESTES DE SÉANCE SONT RETENUS, NON FAITS SUR-LE-CHAMP : « pose un compresseur et
 * lance » doit lancer un graphe qui PORTE le compresseur, et celui-ci n'y est qu'une fois versé.
 * Les faire dans la boucle les ferait porter sur le graphe d'avant.
 *
 * ET L'AVIS EST LE DERNIER DONNÉ, non le premier : une suite de gestes dont le dernier échoue doit
 * dire CE QUI VIENT D'ÉCHOUER, et non un refus survenu trois mots plus tôt.
 */
export function appliquerCommandes<N extends NoeudPose>(
  commandes: readonly Commande[], etat: EtatDicte<N>, outils: OutilsDeDictee<N>,
): SuiteDicte<N> {
  let noeuds: N[] = [...etat.noeuds];
  const nouveaux: N[] = [];
  const aretes: (AreteDeDictee & LienDicte)[] = [];
  const aDetourner: Detournement[] = [];
  let dernier = etat.dernier;
  let avis: string | undefined;
  const seance: GestesDeSeance = { lancer: false, arreter: false, recentrer: false };

  /** « X est posé, mais rien ne le relie à Y » : le nœud reste, le câble non, et on le dit. */
  const avisSansLien = (pose: string, autre: string) =>
    outils.traduire("dictee.sansLien", outils.nomDeFiche(pose), outils.nomDeFiche(autre));

  /** Toutes les arêtes connues : celles du canevas et celles que cette suite vient de poser. */
  const toutesLesAretes = (): AreteDeDictee[] => [...etat.aretes, ...aretes];

  const poser = (ficheId: string, parallele: boolean, ou?: PositionDictee): string | undefined => {
    if (!outils.existe(ficheId)) return `Composant inconnu : ${ficheId}`;
    // UNE RÉFÉRENCE DÉSIGNE, ELLE NE CRÉE PAS : si elle ne désigne rien, on ne pose rien et on le
    // dit. Poser quand même, sans le lien demandé, ferait passer un refus pour une réussite.
    const reference = ou ? dernierDeFiche(noeuds, ou.refFicheId) : undefined;
    if (ou && !reference) {
      return `${outils.traduire("dictee.referenceAbsente")} ${outils.nomDeFiche(ou.refFicheId)}`;
    }
    const courant = reference ?? noeudCourant(noeuds, etat.selectionId, dernier);
    const position = positionSuivante(courant, noeuds, parallele);
    const noeud = outils.fabriquerNoeud(ficheId, position, noeuds);
    if (!noeud) return `Composant inconnu : ${ficheId}`;
    const id = noeud.id;
    noeuds = [...noeuds, noeud];
    nouveaux.push(noeud);

    if (reference && ou) {
      // INSÉRER, ET NON DÉRIVER : ce qui partait de la référence part désormais du nouveau nœud, de
      // sorte que le son y PASSE. Les redirections portent sur les arêtes déjà posées comme sur
      // celles du canevas, la copie de travail valant pour les deux.
      const { aRediriger, lien } = planInsertion(toutesLesAretes(), reference.id, id, ou.ou);
      const ports = outils.lienDicte(noeuds, lien.source, lien.target);
      // POSÉ SANS ÊTRE RELIÉ, ET DIT. Rediriger ce qui part de la référence vers un nœud qui ne peut
      // rien en recevoir COUPERAIT la chaîne au lieu de l'allonger : l'insertion entière est donc
      // abandonnée, redirections comprises, et le nœud reste sur le canevas, libre.
      if (!ports) { dernier = id; return avisSansLien(ficheId, ou.refFicheId); }
      for (const a of aretes) {
        if (!aRediriger.includes(a.id)) continue;
        if (ou.ou === "apres") a.source = id; else a.target = id;
      }
      aDetourner.push(...aRediriger.filter((x) => !aretes.some((a) => a.id === x))
        .map((x) => ({ id: x, vers: id, ou: ou.ou })));
      aretes.push({ id: `e-dictee-${id}-${Date.now()}`, source: lien.source, target: lien.target, ...ports });
    } else if (courant && !parallele) {
      // ENCHAÎNÉ SUR LE COURANT, sauf « en parallèle » : c'est ce qui dispense de dire le lien.
      const ports = outils.lienDicte(noeuds, courant.id, id);
      if (!ports) { dernier = id; return avisSansLien(ficheId, String(courant.data?.ficheId ?? "")); }
      aretes.push({ id: `e-dictee-${id}-${Date.now()}`, source: courant.id, target: id, ...ports });
    }
    dernier = id;
    return undefined;
  };

  const relier = (deFiche: string, versFiche: string): string | undefined => {
    const de = dernierDeFiche(noeuds, deFiche);
    const vers = dernierDeFiche(noeuds, versFiche);
    if (!de || !vers || de.id === vers.id) return undefined;
    // Le même refus qu'à la souris : une arête qui referme un cycle rend muette une branche.
    if (outils.fermeraitUnCycle(de.id, vers.id, toutesLesAretes())) {
      console.warn(`[attic] Dictée : ${de.id} → ${vers.id} refermerait un cycle.`);
      return undefined;
    }
    // ICI RIEN N'EST POSÉ : « relier X à Y » ne crée aucun nœud, donc le refus porte sur le seul
    // câble, et il se dit autrement que celui d'un composant posé sans branchement.
    const ports = outils.lienDicte(noeuds, de.id, vers.id);
    if (!ports) {
      return outils.traduire("dictee.lienImpossible", outils.nomDeFiche(deFiche), outils.nomDeFiche(versFiche));
    }
    aretes.push({ id: `e-dictee-${de.id}-${vers.id}-${Date.now()}`, source: de.id, target: vers.id, ...ports });
    return undefined;
  };

  for (let i = 0; i < commandes.length; i++) {
    const c = commandes[i];
    if (c.quoi === "poser") avis = poser(c.ficheId, c.parallele, c.position) ?? avis;
    else if (c.quoi === "relier") avis = relier(c.de, c.vers) ?? avis;
    else if (c.quoi === "lancer") seance.lancer = true;
    else if (c.quoi === "arreterExecution") seance.arreter = true;
    else if (c.quoi === "recentrer") seance.recentrer = true;
    else if (c.quoi === "annuler") {
      // Ce qui est en attente part d'abord : annuler doit défaire l'état visible, pas un autre.
      // L'appelant verse, défait, et redemande avec ce qui reste.
      return {
        lot: { nouveaux, aretes, aDetourner, dernier, avis },
        annulerEnsuite: true, reste: commandes.slice(i + 1), seance,
      };
    }
  }

  return { lot: { nouveaux, aretes, aDetourner, dernier, avis }, annulerEnsuite: false, reste: [], seance };
}
