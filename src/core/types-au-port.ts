// core/types-au-port.ts — Une valeur rendue correspond-elle au type de son port ?
//
// ═══ POURQUOI CE MODULE, ET C'EST LE POINT 6 D'UNE REVUE ═══
//
// Relevé le 2026-10-25 : « Rien ne vérifie, à l'exécution, qu'une valeur correspond au type de son
// port. Un composant qui déclare une sortie audio peut rendre n'importe quoi. Le typage généré
// inscrit à la feuille de route est un chantier lourd ; une vérification au moteur coûte presque
// rien en comparaison. »
//
// VÉRIFIÉ, SANS NUANCE. `core/validation.ts` regarde la DÉCLARATION d'une fiche — un identifiant,
// un nom, un résumé, une fonction `executer`, la documentation de ses réglages. Rien ne regarde une
// VALEUR. Et `estDuType` n'existait nulle part : un `TypeFlux` portait une couleur, une forme, un
// libellé et deux règles de compatibilité de PORTS, aucune de contenu.
//
// ═══ CE QUE CE MODULE FAIT, ET CE QU'IL NE FAIT SURTOUT PAS ═══
//
// IL RAPPORTE, IL NE REFUSE PAS. Un écart de type est un défaut du composant, pas de l'utilisateur :
// refuser le résultat casserait un graphe qui tourne aujourd'hui, et pour quelqu'un qui n'y peut
// rien. Le moteur l'écrit dans la console, le banc le compte dans son relevé, et c'est à celui qui
// écrit le composant d'en tenir compte.
//
// ET IL NE CHECK QUE CE QU'UN TYPE DÉCLARE. Un `TypeFlux` sans `estDuType` n'est pas vérifié : le
// silence est le défaut, parce qu'un prédicat FAUX est pire que pas de prédicat. Il crierait sur des
// composants corrects, on apprendrait à ne plus le lire, et le jour où il dirait vrai personne ne
// l'entendrait. Chaque prédicat se déclare donc après avoir mesuré ce qui circule vraiment.
//
// ═══ ET POURQUOI IL TOURNE TOUJOURS, ET NON SEULEMENT EN DÉVELOPPEMENT ═══
//
// La revue proposait « en mode développement et pendant les passes du banc ». Ce qu'il coûte est un
// appel de prédicat par port de sortie et par run — `v instanceof AudioBuffer` pour l'audio. C'est
// MOINS que la ligne de journal qu'il remplace, laquelle interpolait quatre empreintes en chaîne de
// caractères pour chaque nœud de chaque run, et que personne ne lisait. Un drapeau aurait donc coûté
// plus cher à porter que la vérification à faire.

/** Ce qu'il faut savoir d'un port pour vérifier ce qui en sort. */
export interface PortVerifiable {
  nom: string;
  type: string;
}

/** Ce qu'un type de flux doit fournir pour que son contenu soit vérifiable. */
export interface TypeVerifiable {
  estDuType?: (valeur: unknown) => boolean;
}

export interface EcartDeType {
  /** Le rang du port, et son nom tel que la fiche l'écrit. */
  rang: number;
  port: string;
  /** Le type que la fiche promet. */
  attendu: string;
  /** Ce qu'on a reçu, nommé du mieux qu'on puisse sans connaître le domaine. */
  recu: string;
}

/**
 * Le nom du genre d'une valeur, pour qu'un écart se lise.
 *
 * ON NE NOMME PAS UN TYPE DU DOMAINE ICI : le cœur ne les connaît pas, et `services-domaine.ts`
 * existe pour cela. Mais le CONSTRUCTEUR d'un objet porte son nom tout seul, et c'est assez pour un
 * message — « reçu Float32Array, attendu audio » se comprend sans que le cœur sache ce qu'est l'un
 * ou l'autre.
 */
export function genreDe(valeur: unknown): string {
  if (valeur === null) return "null";
  if (valeur === undefined) return "undefined";
  const t = typeof valeur;
  if (t !== "object" && t !== "function") return t;
  const nom = (valeur as { constructor?: { name?: string } }).constructor?.name;
  return nom && nom !== "Object" ? nom : t;
}

/**
 * Les valeurs rendues qui ne correspondent pas au type de leur port.
 *
 * ═══ CE QUI N'EST PAS UN ÉCART, ET CHAQUE CAS A SA RAISON ═══
 *
 *   · `null` ET `undefined`. Un composant qui n'a rien à rendre rend `null`, et c'est déclaré : une
 *     fiche peut même porter `sortieNullePermise`. Un nœud en erreur rend `null` lui aussi. En faire
 *     un écart ferait crier le garde sur le fonctionnement normal.
 *   · UN PORT SANS VALEUR. Un composant peut rendre moins de valeurs qu'il n'a de ports ; c'est la
 *     même chose qu'un `null`.
 *   · UN TYPE QUI NE DÉCLARE PAS `estDuType`. Voir l'en-tête : le silence est le défaut.
 *   · UN PORT DE FRONTIÈRE. Son type n'est pas le sien — il prend celui du port interne auquel il se
 *     relie —, de sorte que son `type` déclaré ne promet rien sur son contenu.
 */
export function ecartsDeType(
  sorties: readonly PortVerifiable[],
  valeurs: readonly unknown[] | undefined,
  typeDe: (id: string) => TypeVerifiable | undefined,
): EcartDeType[] {
  if (!valeurs) return [];
  const ecarts: EcartDeType[] = [];
  for (let i = 0; i < sorties.length; i++) {
    const port = sorties[i];
    if (!port || port.type === "frontiere") continue;
    const v = valeurs[i];
    if (v === null || v === undefined) continue;
    const predicat = typeDe(port.type)?.estDuType;
    if (!predicat || predicat(v)) continue;
    ecarts.push({ rang: i, port: port.nom, attendu: port.type, recu: genreDe(v) });
  }
  return ecarts;
}

/**
 * Les écarts, et une ligne de console par écart. Rend la liste pour qui veut la compter.
 *
 * LE MESSAGE NOMME LE NŒUD, SON COMPOSANT ET SON PORT, parce qu'un écart de type sans ces trois
 * choses envoie chercher. Et il dit `attendu`/`reçu` dans cet ordre : c'est la promesse de la fiche
 * qui est en cause, pas la valeur.
 */
export function signalerEcartsDeType(
  noeudId: string, ficheId: string,
  sorties: readonly PortVerifiable[], valeurs: readonly unknown[] | undefined,
  typeDe: (id: string) => TypeVerifiable | undefined,
): EcartDeType[] {
  const ecarts = ecartsDeType(sorties, valeurs, typeDe);
  for (const e of ecarts) {
    console.error(`[type] ${noeudId}(${ficheId}) sortie ${e.rang} « ${e.port} » :`
      + ` la fiche promet « ${e.attendu} », le composant rend ${e.recu}`);
  }
  return ecarts;
}
