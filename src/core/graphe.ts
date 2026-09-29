// core/graphe.ts — Logique de graphe PURE utilisée par le moteur d'exécution
// (boucle `lancer` d'App.tsx). Extraite ici pour être testable indépendamment
// de React : c'est le FILET DE SÉCURITÉ qui permettra de décomposer App.tsx en
// hooks sans régression (les fonctions ci-dessous sont figées par des tests).
//
// Domaine-neutre : ces fonctions ne connaissent ni l'audio ni React ; elles
// opèrent sur des ids de nœuds, des arêtes et une table de résultats opaque.
import type { AreteG } from "./meta";

// Tri topologique (algorithme de Kahn) d'un DAG. Renvoie les ids de nœuds dans
// un ordre d'exécution valide (une source avant ses cibles). Réplique exacte de
// la logique historiquement inline dans `lancer`.
export function ordreTopologique(ids: string[], aretes: AreteG[]): string[] {
  const indegree = new Map<string, number>();
  for (const id of ids) indegree.set(id, 0);
  for (const a of aretes) indegree.set(a.target, (indegree.get(a.target) ?? 0) + 1);
  const file: string[] = [];
  for (const id of ids) if (indegree.get(id) === 0) file.push(id);
  const ordonnees: string[] = [];
  while (file.length > 0) {
    const id = file.shift()!;
    ordonnees.push(id);
    for (const a of aretes) {
      if (a.source === id) {
        const d = (indegree.get(a.target) ?? 1) - 1;
        indegree.set(a.target, d);
        if (d === 0) file.push(a.target);
      }
    }
  }
  return ordonnees;
}

/**
 * Les nœuds qu'un tri topologique ne parvient pas à classer : la preuve qu'un cycle existe.
 *
 * C'EST LA PREUVE, ET NON UN INDICE. Kahn n'émet un nœud que lorsque son degré entrant tombe à
 * zéro ; un nœud pris dans un cycle attend une arête qui ne sera jamais consommée, et n'est donc
 * jamais émis. Ce qui manque à l'ordre est EXACTEMENT l'ensemble des nœuds dont un cycle est
 * atteignable en remontant. Le résultat vide veut dire acyclique, sans réserve.
 *
 * POURQUOI CE N'EST PAS `ordreTopologique` QUI LE DIT. Sa signature est figée par ses tests et par
 * le moteur, qui attend une liste d'ids : lui faire rendre un couple aurait touché tous ses
 * appelants pour un besoin qui n'est pas le leur. Le coût est un second passage, négligeable devant
 * une exécution de graphe, et le calcul reste écrit une seule fois.
 *
 * L'ORDRE RENDU EST CELUI DE `ids`, pour qu'un message qui les nomme soit stable d'une fois sur
 * l'autre : un ensemble rendu dans l'ordre de parcours changerait de forme sans que rien ne bouge.
 */
export function noeudsEnCycle(ids: string[], aretes: AreteG[]): string[] {
  const classes = new Set(ordreTopologique(ids, aretes));
  return ids.filter((id) => !classes.has(id));
}

/**
 * Cette arête refermerait-elle un cycle ?
 *
 * À EXÉCUTER AVANT CHAQUE POSE. Le moteur exécute un graphe acyclique, et rien d'autre : un cycle
 * n'a pas d'ordre topologique, si bien que les nœuds qu'il contient ne sont jamais exécutés. Refuser
 * l'arête au moment où on la tire est le seul endroit où le refus ne coûte rien à personne.
 *
 * LA QUESTION EST UNE ATTEIGNABILITÉ, ET ELLE S'ARRÊTE TÔT. Poser `source → cible` referme un cycle
 * si et seulement si `source` est DÉJÀ atteignable depuis `cible`. On descend donc de `cible` en
 * cherchant `source`, et l'on rend la main dès qu'on la trouve — inutile de classer le graphe entier
 * pour répondre à une question sur deux nœuds. Un graphe déjà cyclique ne fait pas boucler la
 * recherche : l'ensemble des nœuds vus l'en empêche, comme dans `descendants`.
 *
 * UNE BOUCLE D'ATTIC N'EN EST PAS UNE AU SENS DU GRAPHE, et ce contrôle ne la gêne pas. « Début de
 * boucle » et « Fin de boucle » sont deux nœuds distincts reliés vers l'aval : la répétition se fait
 * par dépliage avant l'exécution, ou par passes successives, jamais par une arête qui remonte.
 */
export function fermeraitUnCycle(source: string, cible: string, aretes: AreteG[]): boolean {
  // Une arête d'un nœud vers lui-même est le plus court des cycles, et aucune descente ne la verrait.
  if (source === cible) return true;
  const vus = new Set<string>([cible]);
  const pile = [cible];
  while (pile.length > 0) {
    const id = pile.pop()!;
    for (const a of aretes) {
      if (a.source !== id) continue;
      if (a.target === source) return true;
      if (vus.has(a.target)) continue;
      vus.add(a.target);
      pile.push(a.target);
    }
  }
  return false;
}

// Repousse en fin d'ordre les nœuds qui doivent passer APRÈS tous les autres — un nœud qui montre
// le travail du graphe entier sans en recevoir aucune valeur par ses entrées. Sans entrée, le tri
// topologique peut le placer n'importe où, y compris en tête ; il n'y a pas d'arête pour le dire.
// L'ordre relatif est conservé des deux côtés, et un nœud « dernier » qui aurait des descendants
// les emmène avec lui, pour que l'ordre reste topologique.
export function placerEnDernier(ordre: string[], estDernier: (id: string) => boolean, aretes: AreteG[] = []): string[] {
  const derniers = new Set<string>();
  for (const id of ordre) {
    if (!estDernier(id)) continue;
    derniers.add(id);
    for (const d of descendants(id, aretes)) derniers.add(d);
  }
  if (!derniers.size) return ordre;
  return [...ordre.filter((id) => !derniers.has(id)), ...ordre.filter((id) => derniers.has(id))];
}

// Ensemble des ancêtres (amont transitif) d'un nœud, le nœud cible INCLUS.
// Sert au mode « priorité » : n'exécuter que ce dont dépend un nœud donné.
export function ancetres(cible: string, aretes: AreteG[]): Set<string> {
  const set = new Set<string>();
  const collecter = (id: string) => {
    if (set.has(id)) return;
    set.add(id);
    for (const a of aretes) if (a.target === id) collecter(a.source);
  };
  collecter(cible);
  return set;
}

// Ensemble des descendants (aval transitif) d'un nœud, le nœud de départ EXCLU.
//
// ATTENTION à l'asymétrie avec `ancetres`, qui inclut sa cible : ce n'est pas un
// oubli de part ni d'autre. `ancetres` sert au mode « priorité », qui doit
// exécuter le nœud demandé en plus de ce dont il dépend. Ici, l'exclusion est
// tout l'intérêt de la fonction — deux réinitialisations différentes s'en
// distinguent, et c'est au point d'appel de dire laquelle il veut :
//
//   changer de FICHIER sur un nœud  → { lui } ∪ descendants  (sa sortie change)
//   changer ses ZONES sélectionnées → descendants seuls       (sa sortie audio
//                                     est le fichier d'entrée transmis tel quel ;
//                                     effacer son résultat ferait disparaître sa
//                                     forme d'onde à chaque zone ajoutée)
//
// Le garde `set.has` n'est pas qu'une optimisation : il fait terminer la
// traversée sur un graphe cyclique, que l'interface n'interdit pas.
export function descendants(depart: string, aretes: AreteG[]): Set<string> {
  const set = new Set<string>();
  const collecter = (id: string) => {
    for (const a of aretes) {
      if (a.source !== id || set.has(a.target)) continue;
      set.add(a.target);
      collecter(a.target);
    }
  };
  collecter(depart);
  return set;
}

// Empreinte des sources entrantes d'un nœud (clé de cache « entrées »).
// Deux graphes identiques en amont d'un nœud donnent la même empreinte.
export function empreinteEntrees(nodeId: string, aretes: AreteG[]): string {
  return aretes.filter((a) => a.target === nodeId).map((a) => a.source).sort().join(",");
}

/**
 * Empreinte des SORTIES branchées d'un nœud (clé de cache « sorties »).
 *
 * POURQUOI LE CÂBLAGE AVAL ENTRE DANS LA CLÉ. Depuis qu'un nœud peut savoir si une de ses sorties
 * est branchée, ce qu'il rend en dépend : une sortie chère n'est calculée que lorsqu'elle sert.
 * Sans cette empreinte, brancher un câble sur une sortie restée vide ne relançait rien, le cache
 * tenant les paramètres et les entrées pour inchangés ; on branchait l'audio, on lançait, et le
 * nœud d'aval annonçait « aucune entrée ». Relevé à l'écran.
 *
 * SEUL LE RANG DE LA POIGNÉE COMPTE, non le nœud d'arrivée : deux câbles partis de la même sortie
 * ne changent rien à ce qui est calculé, et rebrancher ailleurs non plus.
 */
export function empreinteSorties(nodeId: string, aretes: AreteG[]): string {
  const rangs = new Set<string>();
  for (const a of aretes) if (a.source === nodeId && a.sourceHandle) rangs.add(a.sourceHandle);
  return [...rangs].sort().join(",");
}

// Empreinte des paramètres d'un nœud (clé de cache « paramètres »).
// NB : inclut quelques champs de données audio (sequenceNotes, nom de fichier) —
// c'est la clé actuelle ; à rendre injectable lors de la généralisation (§1 roadmap).
export function empreinteParametres(data: Record<string, unknown>): string {
  const f = data.audioFichier as { name?: string } | undefined;
  // LES MORCEAUX DU MONTAGE ENTRENT DANS LA CLÉ, au même titre que les notes enregistrées d'un
  // clavier : ils sont posés à la main et décident de ce que le composant rend. Sans eux, couper ou
  // déplacer un morceau n'aurait relancé personne, et l'on aurait entendu le montage d'avant.
  return JSON.stringify({
    p: data.parametres ?? {}, s: data.sequenceNotes ?? null, m: data.morceaux ?? null,
    f: f ? f.name : null,
  });
}

// Empreinte stable d'une valeur individuelle (utilisée pour les entrées).
// Permet au cache d'invalidation d'être basé sur les valeurs réelles reçues,
// pas seulement sur les ids des nœuds amont. Traite les types courants du
// moteur (primitifs, AudioBuffer, File/Blob, tableaux, objets simples).
export function empreinteValeur(valeur: unknown): string {
  if (valeur === null) return "null";
  if (valeur === undefined) return "undefined";
  const type = typeof valeur;
  if (type === "string" || type === "number" || type === "boolean") return String(valeur);
  if (typeof AudioBuffer !== "undefined" && valeur instanceof AudioBuffer) {
    return `AudioBuffer(${valeur.length},${valeur.sampleRate},${valeur.numberOfChannels})`;
  }
  if (valeur instanceof File) return `File(${valeur.name},${valeur.size},${valeur.type})`;
  if (valeur instanceof Blob) return `Blob(${valeur.size},${valeur.type})`;
  if (Array.isArray(valeur)) return `[${valeur.map(empreinteValeur).join(",")}]`;
  if (valeur instanceof Uint8Array || valeur instanceof Int8Array || valeur instanceof Float32Array) {
    return `TypedArray(${(valeur as ArrayBufferView).constructor.name},${valeur.length})`;
  }
  if (type === "object") {
    const obj = valeur as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${k}:${empreinteValeur(obj[k])}`).join(",")}}`;
  }
  return `other(${String(valeur)})`;
}

// Empreinte des valeurs effectivement branchées en entrée d'un nœud.
// Si un amont est recalculé et produit une valeur différente, l'empreinte change
// et force la réexécution du nœud — même si la liste des ids amont n'a pas changé.
// Les arêtes sont triées par index d'entrée pour que l'ordre de l'array ne change
// pas l'empreinte (seuls les ports réellement connectés comptent).
export function empreinteValeursEntrantes<T = unknown>(
  nodeId: string,
  aretes: AreteG[],
  resultats: Map<string, T[]>,
): string {
  const aretesTriees = aretes
    .filter((a) => a.target === nodeId)
    .sort((a, b) => {
      const ia = parseInt((a.targetHandle ?? "in:-1").split(":")[1]);
      const ib = parseInt((b.targetHandle ?? "in:-1").split(":")[1]);
      if (ia !== ib) return ia - ib;
      const sa = `${a.source}:${a.sourceHandle ?? "out:0"}`;
      const sb = `${b.source}:${b.sourceHandle ?? "out:0"}`;
      return sa.localeCompare(sb);
    });
  const valeurs = aretesTriees.map((a) => {
    const si = parseInt((a.sourceHandle ?? "out:0").split(":")[1]);
    return resultats.get(a.source)?.[si] ?? null;
  });
  return empreinteValeur(valeurs);
}

// Résout la valeur branchée sur l'entrée `index` d'un nœud, depuis les arêtes et
// la table des résultats déjà calculés. Renvoie null si l'entrée n'est pas connectée.
export function resoudreEntree<T = unknown>(
  nodeId: string, index: number, aretes: AreteG[], resultats: Map<string, T[]>,
): T | null {
  const arc = aretes.find((a) => a.target === nodeId && parseInt((a.targetHandle ?? "in:-1").split(":")[1]) === index);
  if (!arc) return null;
  const si = parseInt((arc.sourceHandle ?? "out:0").split(":")[1]);
  return resultats.get(arc.source)?.[si] ?? null;
}

// Toutes les valeurs branchées en entrée d'un nœud (dans l'ordre des arêtes),
// null pour les sources non encore calculées. Base des entrées variadiques.
export function valeursEntrantes<T = unknown>(
  nodeId: string, aretes: AreteG[], resultats: Map<string, T[]>,
): (T | null)[] {
  return aretes.filter((a) => a.target === nodeId).map((a) => {
    const si = parseInt((a.sourceHandle ?? "out:0").split(":")[1]);
    return resultats.get(a.source)?.[si] ?? null;
  });
}
