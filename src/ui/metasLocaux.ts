// ui/metasLocaux.ts — Persistance locale des méta-composants (localStorage), UNE CLÉ PAR MÉTA.
// Rend le catalogue de métas PERMANENT sur la machine : ils survivent aux
// redémarrages, sans dépendre d'un workflow exporté. Le cœur reste sans stockage
// (cf. core/metastore : on s'abonne à surChangementMetas pour sauvegarder).
//
// ═══ POURQUOI UNE CLÉ PAR MÉTA, ET NON PLUS UNE LISTE ═══
//
// La bibliothèque tenait dans une seule clé, `attic-metas`, réécrite ENTIÈRE à chaque changement
// depuis le registre en mémoire de la fenêtre. Deux fenêtres ont deux registres. Mesuré le
// 2026-10-29 : la fenêtre 1 crée M1, le stockage tient `[exemple, M1]` ; la fenêtre 2, qui ne voit
// pas M1, crée M2, et le stockage tient `[exemple, M2]`. À la relance, les nœuds qui employaient M1
// s'affichaient sous leur identifiant brut, sans un port, et le contenu de M1 n'était plus nulle
// part. Sous sa propre clé, chaque méta ne s'écrit que lorsqu'il change, et l'autre fenêtre en
// reçoit l'événement `storage` : `appliquerMetaDistant` le verse dans son registre.
import { tousLesMetas, trouverMeta, enregistrerMeta, supprimerMeta, type MetaComposant } from "../core";
import { registreUI } from "./registre-actif";

/** L'ancienne clé, qui tenait la bibliothèque entière. Lue une fois au démarrage, pour migrer. */
export const CLE_LISTE_METAS = "attic-metas";
/** La clé d'un méta : ce préfixe, puis son identifiant. */
export const PREFIXE_META = "attic-meta:";

type Stockage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
const stockageLocal = (): Stockage | undefined => { try { return localStorage; } catch { return undefined; } };

// Rend un méta sérialisable (retire File/Blob des sous-nœuds — mêmes règles que
// l'export de workflow ; source unique de vérité de la sérialisation d'un méta).
export function serialiserMeta(m: MetaComposant) {
  return {
    // LA DESCRIPTION SUIT LE MÉTA, sans quoi le texte de son auteur serait perdu au premier
    // redémarrage et le catalogue reviendrait au compte des nœuds. LE NOM ANGLAIS AUSSI : ce qui
    // vient d'une autre fenêtre REMPLACE le méta en mémoire, donc ce que cette fonction oublie, la
    // fenêtre qui le reçoit le perd sur-le-champ, et non plus au redémarrage suivant.
    id: m.id, nom: m.nom, nomEn: m.nomEn, description: m.description, entrees: m.entrees, sorties: m.sorties,
    mapEntrees: m.mapEntrees, mapSorties: m.mapSorties,
    sousNoeuds: m.sousNoeuds.map((n) => ({
      id: n.id, position: n.position, width: n.width, height: n.height,
      data: {
        ficheId: n.data.ficheId,
        parametres: n.data.parametres,
        audioNom: (n.data as Record<string, unknown>).audioNom,
        midiNom: (n.data as Record<string, unknown>).midiNom,
        imageNom: (n.data as Record<string, unknown>).imageNom,
        svgNom: (n.data as Record<string, unknown>).svgNom,
        zonesSelectionnees: (n.data as Record<string, unknown>).zonesSelectionnees,
      },
    })),
    sousAretes: m.sousAretes.map((a) => ({ id: a.id, source: a.source, target: a.target, sourceHandle: a.sourceHandle, targetHandle: a.targetHandle })),
  };
}

/**
 * Vrai pendant qu'on verse ce qui vient d'une autre fenêtre. Ce qui arrive ainsi ne se réécrit
 * pas : sans ce verrou, chaque fenêtre renverrait à l'autre ce qu'elle vient d'en recevoir.
 */
let appliqueDistant = false;
function sansReecrire(f: () => void): void {
  appliqueDistant = true;
  try { f(); } finally { appliqueDistant = false; }
}

/**
 * Écrit UN méta sous sa clé, ou la retire s'il n'existe plus.
 *
 * RIEN N'EST ÉCRIT QUAND LA VALEUR EST DÉJÀ CELLE DU STOCKAGE : le journal de session réenregistre
 * le méta qu'on édite à chaque geste, et chaque écriture réveillerait les autres fenêtres.
 */
export function sauvegarderMeta(id: string, s: Stockage | undefined = stockageLocal()): void {
  if (appliqueDistant || !s) return;
  try {
    const cle = PREFIXE_META + id;
    const m = trouverMeta(id);
    if (!m) { s.removeItem(cle); return; }
    const valeur = JSON.stringify(serialiserMeta(m));
    if (s.getItem(cle) !== valeur) s.setItem(cle, valeur);
  } catch { /* quota/indispo : on ignore */ }
}

/**
 * Verse l'ancienne liste dans les clés par méta, puis la retire.
 *
 * UN MÉTA QUI A DÉJÀ SA CLÉ LA GARDE : la clé est plus récente que la liste, qui ne revient que par
 * la restauration d'une sauvegarde d'avant mise à jour. Une liste illisible est laissée en place.
 */
function migrerLaListe(s: Stockage): void {
  const brut = s.getItem(CLE_LISTE_METAS);
  if (brut === null) return;
  let liste: unknown;
  try { liste = JSON.parse(brut); } catch { console.warn("[attic] attic-metas illisible, laissé en place"); return; }
  if (Array.isArray(liste)) {
    for (const m of liste as { id?: unknown }[]) {
      if (typeof m?.id === "string" && s.getItem(PREFIXE_META + m.id) === null) s.setItem(PREFIXE_META + m.id, JSON.stringify(m));
    }
  }
  s.removeItem(CLE_LISTE_METAS);
}

/** Tous les métas en stockage, tels qu'ils y sont écrits. */
function metasStockes(s: Stockage): any[] {
  const tous: any[] = [];
  for (let i = 0; i < s.length; i++) {
    const cle = s.key(i);
    if (!cle?.startsWith(PREFIXE_META)) continue;
    try { tous.push(JSON.parse(s.getItem(cle) ?? "null")); } catch { console.warn(`[attic] ${cle} illisible`); }
  }
  return tous.filter((m) => m?.id && m?.nom && Array.isArray(m.sousNoeuds));
}

/** La bibliothèque en une liste, pour la sauvegarde d'avant mise à jour : la forme d'autrefois. */
export function listeDesMetasStockes(s: Stockage | undefined = stockageLocal()): string | null {
  if (!s) return null;
  const tous = metasStockes(s);
  return tous.length ? JSON.stringify(tous) : null;
}

/** Les fiches qu'un méta emploie sans que le registre (ni `idsConnus`) les connaisse. */
function fichesManquantes(m: any, idsConnus: Set<string>): string[] {
  const manquants = (m.sousNoeuds as any[]).map((sn) => sn?.data?.ficheId)
    .filter((fid) => !(typeof fid === "string" && (!!registreUI().trouverDef(fid) || idsConnus.has(fid))));
  return [...new Set(manquants.map(String))];
}

// Un méta non restauré (sous-nœud référençant un plugin introuvable) — de quoi
// afficher un avertissement compréhensible plutôt que de le perdre en silence.
export interface MetaNonRestaure { nom: string; manquants: string[] }

// Recharge les métas persistés et les ré-enregistre. GARDE : un méta n'est
// restauré que si chacun de ses sous-nœuds référence un plugin connu (ou un autre
// méta persisté — cas des métas imbriqués). Sinon il est ignoré, MAIS GARDÉ SOUS SA CLÉ, au cas
// où le plugin reviendrait — ex. le renommage d'un plugin, à réparer via l'ALIAS de
// core/registreUI().ts plutôt qu'en resignalant sans cesse le même méta comme perdu. Renvoie les
// métas non restaurés (tableau vide si tout va bien), pour que l'appelant puisse prévenir
// l'utilisateur au lieu de laisser des méta-composants disparaître du catalogue sans explication.
export function chargerMetasLocaux(s: Stockage | undefined = stockageLocal()): MetaNonRestaure[] {
  if (!s) return [];
  try {
    migrerLaListe(s);
    const liste = metasStockes(s);
    if (liste.length === 0) {
      console.log("[attic] chargerMetasLocaux: aucun méta en localStorage");
      return [];
    }
    console.log(`[attic] chargerMetasLocaux: ${liste.length} méta(s) trouvé(s) en localStorage`);
    const idsPersistes = new Set<string>(liste.map((m) => m.id));
    const nonRestaures: MetaNonRestaure[] = [];
    for (const m of liste) {
      const manquants = fichesManquantes(m, idsPersistes);
      if (manquants.length === 0) { sansReecrire(() => enregistrerMeta(m as MetaComposant)); continue; }
      console.warn(`[attic] Méta « ${m.id} » non restauré : sous-nœud(s) inconnu(s) : ${manquants.join(", ")}`);
      nonRestaures.push({ nom: m.nom, manquants });
    }
    return nonRestaures;
  } catch { return []; }
}

/** Ce qu'une écriture venue d'une autre fenêtre a fait ici. */
export interface MetaDistant {
  id: string;
  /**
   * `enregistre` : le méta est créé ou remplacé ici ; `retire` : il quitte le catalogue ;
   * `garde` : supprimé là-bas, mais EMPLOYÉ ICI, donc gardé et réécrit ; `ignore` : rien.
   */
  action: "enregistre" | "retire" | "garde" | "ignore";
}

/**
 * Verse dans le registre de cette fenêtre ce qu'une autre a écrit sous une clé de méta.
 *
 * Rend `null` si la clé n'est pas celle d'un méta. `estEmploye` dit si le graphe de cette fenêtre
 * emploie le méta : une suppression ne passe alors pas. La fenêtre qui supprime demande d'abord
 * (voir `ui/fenetres-partagees.ts`) ; ce garde-ci couvre la fenêtre qui n'a pas répondu à temps, et
 * la suppression refusée après coup se défait en réécrivant le méta.
 */
export function appliquerMetaDistant(cle: string | null, valeur: string | null,
  estEmploye: (id: string) => boolean, s: Stockage | undefined = stockageLocal()): MetaDistant | null {
  if (!cle?.startsWith(PREFIXE_META)) return null;
  const id = cle.slice(PREFIXE_META.length);
  if (valeur === null) {
    if (!trouverMeta(id)) return { id, action: "ignore" };
    if (estEmploye(id)) {
      console.warn(`[attic] Méta « ${id} » supprimé dans une autre fenêtre, mais employé ici : il est gardé.`);
      sauvegarderMeta(id, s);
      return { id, action: "garde" };
    }
    sansReecrire(() => supprimerMeta(id));
    return { id, action: "retire" };
  }
  let m: any;
  try { m = JSON.parse(valeur); } catch { return { id, action: "ignore" }; }
  if (m?.id !== id || !m?.nom || !Array.isArray(m.sousNoeuds)) return { id, action: "ignore" };
  const manquants = fichesManquantes(m, new Set([...tousLesMetas().map((x) => x.id), id]));
  if (manquants.length) {
    console.warn(`[attic] Méta « ${id} » venu d'une autre fenêtre, non repris : fiche(s) inconnue(s) ${manquants.join(", ")}`);
    return { id, action: "ignore" };
  }
  sansReecrire(() => enregistrerMeta(m as MetaComposant));
  return { id, action: "enregistre" };
}
