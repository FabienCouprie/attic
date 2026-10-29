// ui/fenetre.ts — Ce qui appartient à UNE fenêtre : son graphe en cours et son fichier courant.
//
// ═══ LA SECONDE FENÊTRE HÉRITAIT DU DOCUMENT DE LA PREMIÈRE ═══
//
// Mesuré le 2026-10-29 sur le build, deux fenêtres ouvertes : la seconde s'ouvrait sur le graphe de
// la première ET sur son fichier, parce que toutes deux lisaient au montage les deux mêmes clés de
// `localStorage`. Les deux sauvegardes automatiques réécrivaient alors le même fichier à tour de
// rôle (la première à 6 s, la seconde à 20 s, la première à 66 s), et à la fermeture le graphe de
// la seconde n'était plus nulle part.
//
// ═══ LA RÈGLE, DÉCIDÉE PAR FABIEN ═══
//
// Une fenêtre ouverte par « Nouvelle fenêtre » naît sur un canevas vide, sans fichier courant, en
// développement comme sur le build. Le processus principal la marque par son adresse
// (`?fenetre=nouvelle`, voir `electron/fenetres.cjs`) ; elle seule le sait.
//
// ═══ L'EN-COURS PARTAGÉ EST SIGNÉ, ET LA FENÊTRE GARDE SA COPIE ═══
//
// L'en-cours de `localStorage` sert à la reprise au prochain lancement : il garde le graphe de qui a
// bougé en dernier, avec son fichier écrit DANS LE MÊME GESTE — séparés, la reprise rattachait le
// graphe d'une fenêtre au fichier de l'autre, et la sauvegarde automatique l'y aurait écrit. Il
// porte désormais l'identifiant de la fenêtre qui l'a écrit.
//
// RECHARGER UNE FENÊTRE LA RENDAIT AU DERNIER EN-COURS ÉCRIT PAR N'IMPORTE QUELLE FENÊTRE. Elle garde
// donc sa copie dans `sessionStorage`, qui lui est propre et survit à son rechargement : c'est la
// durée de vie d'un document ouvert. Rechargée, elle reprend sa copie QUAND L'EN-COURS PARTAGÉ EST
// SIGNÉ D'UNE AUTRE. Un en-cours sans signature est une semence — un spec qui pose un graphe puis
// recharge, une version antérieure — et il est repris tel quel, comme avant.

/** Le paramètre d'adresse posé par le processus principal ; `electron/fenetres.cjs` a le même. */
export const PARAMETRE_FENETRE = "fenetre";
export const VALEUR_NOUVELLE = "nouvelle";

export const CLE_ENCOURS = "attic-encours";
export const CLE_FICHIER = "attic-current-file-path";
/** L'identifiant de la fenêtre, gardé d'un rechargement à l'autre ; sa présence dit qu'on recharge. */
const CLE_ID = "attic-fenetre-id";

type Stockage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface Demarrage {
  /** D'où vient ce que la fenêtre reprend. */
  origine: "lancement" | "nouvelle" | "rechargement";
  encours: string | null;
  fichier: string | null;
  /** L'identifiant de cette fenêtre, qui signe l'en-cours partagé. */
  id: string;
}

export interface SourcesDemarrage {
  /** `location.search` */
  recherche: string;
  /** Le type de la navigation qui a chargé la page : « reload » pour un rechargement. */
  navigation: string | undefined;
  partage: Stockage | undefined;
  propre: Stockage | undefined;
  nouvelId?: () => string;
}

function lire(s: Stockage | undefined, cle: string): string | null {
  try { return s?.getItem(cle) ?? null; } catch { return null; }
}

/** La fenêtre qui a signé un en-cours, ou `null` s'il n'est pas signé. */
function signature(encours: string | null): string | null {
  if (!encours) return null;
  try { return (JSON.parse(encours) as { fenetre?: unknown }).fenetre as string ?? null; } catch { return null; }
}

/**
 * Un identifiant que deux fenêtres ne tirent pas ensemble : une fenêtre, une question, une copie.
 *
 * PAR `crypto.getRandomValues`, ET NON `Math.random` : ce hasard ne touche à aucun rendu, et
 * `core/hasard-couverture.test.ts` tient l'inventaire de ceux qui y touchent. `getRandomValues`
 * existe aussi hors d'un contexte sécurisé, à la différence de `randomUUID`.
 */
export function identifiantAuHasard(): string {
  const v = crypto.getRandomValues(new Uint32Array(2));
  return `${Date.now().toString(36)}-${v[0].toString(36)}${v[1].toString(36)}`;
}

const idAuHasard = identifiantAuHasard;

/**
 * Ce que la fenêtre reprend en s'ouvrant.
 *
 * LE RECHARGEMENT SE RECONNAÎT À DEUX SIGNES, et il faut les deux : le type de navigation dit qu'on
 * recharge, l'identifiant dans `sessionStorage` dit que c'est bien cette fenêtre qui avait été
 * ouverte. Un onglet ouvert par `window.open` en mode web reçoit une copie du `sessionStorage` de son
 * ouvreur, identifiant compris : seule la navigation le distingue d'un rechargement, et il reçoit
 * alors un identifiant neuf.
 */
export function lireDemarrage(s: SourcesDemarrage): Demarrage {
  const idGarde = lire(s.propre, CLE_ID);
  if (s.navigation === "reload" && idGarde) {
    const partage = lire(s.partage, CLE_ENCOURS);
    const qui = signature(partage);
    if (partage !== null && (qui === null || qui === idGarde)) {
      return { origine: "rechargement", encours: partage, fichier: lire(s.partage, CLE_FICHIER), id: idGarde };
    }
    return { origine: "rechargement", encours: lire(s.propre, CLE_ENCOURS), fichier: lire(s.propre, CLE_FICHIER), id: idGarde };
  }
  const id = (s.nouvelId ?? idAuHasard)();
  const nouvelle = new URLSearchParams(s.recherche).get(PARAMETRE_FENETRE) === VALEUR_NOUVELLE;
  const d: Demarrage = nouvelle
    ? { origine: "nouvelle", encours: null, fichier: null, id }
    : { origine: "lancement", encours: lire(s.partage, CLE_ENCOURS), fichier: lire(s.partage, CLE_FICHIER), id };
  // LA COPIE DE LA FENÊTRE PART DE CE QU'ELLE REPREND, et ce qu'une copie héritée aurait apporté est
  // effacé.
  try {
    s.propre?.setItem(CLE_ID, id);
    ecrireDans(s.propre, d.encours, d.fichier);
  } catch { /* stockage refusé : la fenêtre marche, sans rechargement fidèle */ }
  return d;
}

function ecrireDans(s: Stockage | undefined, encours: string | null, fichier: string | null): void {
  if (!s) return;
  if (encours === null) s.removeItem(CLE_ENCOURS); else s.setItem(CLE_ENCOURS, encours);
  if (fichier) s.setItem(CLE_FICHIER, fichier); else s.removeItem(CLE_FICHIER);
}

function navigationCourante(): string | undefined {
  try {
    return (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type;
  } catch { return undefined; }
}

function stockage(nom: "localStorage" | "sessionStorage"): Stockage | undefined {
  try { return globalThis[nom]; } catch { return undefined; }
}

let memo: Demarrage | null = null;

/** Ce que CETTE fenêtre reprend, lu une fois par chargement de page. */
export function demarrage(): Demarrage {
  if (!memo) {
    memo = lireDemarrage({
      recherche: typeof location !== "undefined" ? location.search : "",
      navigation: navigationCourante(),
      partage: stockage("localStorage"),
      propre: stockage("sessionStorage"),
    });
  }
  return memo;
}

/** Ce qu'il faut pour écrire un en-cours ; les défauts sont ceux de la page. */
export interface Destinations { partage?: Stockage; propre?: Stockage; id?: string }

const signer = (encours: object, id: string) => JSON.stringify({ ...encours, fenetre: id });

/**
 * Écrit l'en-cours de la fenêtre, signé : sa copie, et l'en-cours partagé avec SON fichier.
 *
 * LÈVE si le stockage refuse, comme `localStorage.setItem` : l'appelant décide de ce qu'un quota
 * dépassé veut dire.
 */
export function ecrireEncours(encours: object, fichier: string | null, d: Destinations = {}): void {
  const texte = signer(encours, d.id ?? demarrage().id);
  ecrireDans(d.propre ?? stockage("sessionStorage"), texte, fichier);
  ecrireDans(d.partage ?? stockage("localStorage"), texte, fichier);
}

/** Écrit la seule copie de la fenêtre : l'en-cours partagé est laissé à une autre. */
export function ecrireEncoursPropre(encours: object, fichier: string | null, d: Destinations = {}): void {
  ecrireDans(d.propre ?? stockage("sessionStorage"), signer(encours, d.id ?? demarrage().id), fichier);
}

/** Le fichier courant a changé : la copie de la fenêtre le retient pour son rechargement. */
export function noterFichierPropre(fichier: string | null, propre = stockage("sessionStorage")): void {
  try {
    if (fichier) propre?.setItem(CLE_FICHIER, fichier); else propre?.removeItem(CLE_FICHIER);
  } catch { /* stockage refusé */ }
}

/** Ouvre une fenêtre neuve : par le processus principal, ou un onglet marqué en mode web. */
export function ouvrirNouvelleFenetre(): void {
  const api = (window as { api?: { nouvelleFenetre?: () => unknown } }).api;
  if (api?.nouvelleFenetre) { void api.nouvelleFenetre(); return; }
  const url = new URL(location.href);
  url.searchParams.set(PARAMETRE_FENETRE, VALEUR_NOUVELLE);
  window.open(url.href, "_blank", "width=1400,height=900");
}
