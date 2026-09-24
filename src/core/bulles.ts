// core/bulles.ts — Replier une partie du schéma sans rien extraire.
//
// CE QU'EST UNE BULLE, ET CE QU'ELLE N'EST PAS. C'est une simplification VISUELLE : les nœuds qu'elle
// contient restent dans le graphe, à leur place, avec leurs identifiants et leurs arêtes. Elle ne les
// copie pas, ne les déplace pas, ne les remplace pas. Elle les CACHE, et se dessine à leur place.
//
// POURQUOI REPLIER PLUTÔT QU'EXTRAIRE, et c'est la mesure qui l'a décidé. Le cache d'exécution est
// indexé par identifiant de nœud et par empreinte des arêtes entrantes (`core/graphe.ts`). Extraire un
// sous-graphe renomme ses nœuds — c'est ce que fait l'aplatissement d'un méta-composant, qui préfixe
// tout par `monNoeud::` —, donc invalide chaque résultat déjà calculé. Un geste de lisibilité qu'on
// répète dix fois par séance ne peut pas coûter un rendu complet. Replier ne renomme rien : les
// résultats survivent.
//
// CE QUE CELA ÉPARGNE. Rien à définir hors du graphe, donc rien à ranger dans un catalogue, rien à
// restaurer, rien à réécrire en sortant. L'annulation, le fichier de projet et la reprise de session
// transportent déjà les nœuds et les arêtes : une bulle y voyage sans ligne supplémentaire.
//
// LA SOURCE DE VÉRITÉ EST L'APPARTENANCE, JAMAIS `hidden`. Le réalisateur de démonstration se sert de
// `hidden` pour révéler les nœuds un à un (`ui/demo/useRealisateurDemo.tsx`) : un nœud caché n'est donc
// pas forcément le membre d'une bulle repliée. `hidden` est une CONSÉQUENCE, recalculée par
// `appliquerRepli`, jamais une donnée.
//
// L'IMBRICATION EST PERMISE, DONC LES CYCLES SONT POSSIBLES. Un fichier de projet abîmé peut décrire
// une bulle membre d'elle-même, ou deux bulles membres l'une de l'autre. Chaque parcours d'ascendance
// porte donc un ensemble de visités : une donnée fausse rend un résultat faux, jamais une boucle
// infinie.

import { indexPort, type AreteG, type DefPorts, type NoeudG, type PortInterne } from "./meta";
import type { PortDef } from "./types";

/**
 * L'espace de noms des fiches de bulle.
 *
 * CHAQUE BULLE A SA PROPRE FICHE, et il n'y a pas le choix : une fiche porte des ports, et les ports
 * d'une bulle sont ceux de SES membres. Une fiche partagée ne pourrait en décrire aucune. Son
 * identifiant se déduit donc de celui du nœud, comme celui d'un méta-composant est le sien.
 *
 * CE PRÉFIXE N'EST PAS UN SUBSTITUT. Ailleurs dans ce dépôt, deviner une propriété d'après un nom
 * s'est révélé une mauvaise idée — le cœur par trames lu dans le nom du réglage, la dépendance au Web
 * Audio lue dans un `grep`. Ici, rien n'est deviné : c'est NOUS qui formons l'identifiant, et un test
 * exige la correspondance dans les deux sens. C'est le même procédé que les nœuds-frontière, préfixés
 * `__`, dont personne n'a jamais eu à deviner la nature.
 */
export const PREFIXE_FICHE_BULLE = "bulle::";

export const estBulle = (ficheId: string | undefined): boolean =>
  typeof ficheId === "string" && ficheId.startsWith(PREFIXE_FICHE_BULLE);

/** La fiche d'une bulle, d'après l'identifiant de son nœud. */
export const ficheDeBulle = (noeudId: string): string => `${PREFIXE_FICHE_BULLE}${noeudId}`;

/** L'identifiant du nœud auquel appartient cette fiche de bulle. */
export const noeudDeFicheBulle = (ficheId: string): string =>
  estBulle(ficheId) ? ficheId.slice(PREFIXE_FICHE_BULLE.length) : "";

/** La bulle dont ce nœud est membre, s'il l'est. */
export const bulleDe = (n: NoeudG): string | undefined => {
  const b = (n.data as Record<string, unknown>).bulle;
  return typeof b === "string" && b ? b : undefined;
};

/** Une bulle est-elle repliée ? Une bulle sans état l'est : on la crée fermée. */
export const estRepliee = (n: NoeudG): boolean =>
  estBulle(n.data.ficheId) && (n.data as Record<string, unknown>).replie !== false;

/**
 * La chaîne des bulles qui contiennent ce nœud, de la plus proche à la plus lointaine.
 *
 * Le parcours s'arrête sur un nœud déjà vu : une appartenance circulaire rend une chaîne tronquée, et
 * non une boucle sans fin.
 */
export function ancetresBulle(noeuds: readonly NoeudG[], id: string): string[] {
  const parId = new Map(noeuds.map((n) => [n.id, n]));
  const out: string[] = [];
  const vus = new Set<string>([id]);
  let courant = parId.get(id);
  for (;;) {
    const parent = courant ? bulleDe(courant) : undefined;
    if (!parent || vus.has(parent)) return out;
    vus.add(parent);
    out.push(parent);
    courant = parId.get(parent);
  }
}

/**
 * La bulle repliée la plus EXTÉRIEURE qui cache ce nœud, s'il en est une.
 *
 * C'est elle que l'affichage montre à sa place : replier une bulle qui en contient une autre ne doit
 * pas laisser voir la bulle intérieure.
 */
export function bulleCachante(noeuds: readonly NoeudG[], id: string): string | undefined {
  const parId = new Map(noeuds.map((n) => [n.id, n]));
  let trouvee: string | undefined;
  for (const a of ancetresBulle(noeuds, id)) {
    const n = parId.get(a);
    if (n && estRepliee(n)) trouvee = a;
  }
  return trouvee;
}

/** Ce nœud est-il caché par une bulle repliée ? */
export const estCacheParBulle = (noeuds: readonly NoeudG[], id: string): boolean =>
  bulleCachante(noeuds, id) !== undefined;

/** Les membres directs d'une bulle, dans l'ordre du tableau de nœuds. */
export const membresDe = (noeuds: readonly NoeudG[], bulleId: string): NoeudG[] =>
  noeuds.filter((n) => bulleDe(n) === bulleId);

export interface PortsBulle {
  entrees: PortDef[];
  sorties: PortDef[];
  /** Parallèle à `entrees` : le nœud RÉEL et son port, jamais une bulle. */
  mapEntrees: PortInterne[];
  mapSorties: PortInterne[];
}

/**
 * Les ports d'une bulle : TOUS les ports de TOUS ses descendants réels, à plat.
 *
 * POURQUOI TOUS, ET NON LES SEULS PORTS TRAVERSÉS. Les poignées d'une bulle repliée sont
 * connectables, donc il faut pouvoir atteindre un port encore libre. Et l'ordre doit être STABLE :
 * s'il ne dépendait que des arêtes existantes, brancher un câble réordonnerait les poignées et les
 * autres câbles changeraient de port sous les doigts. Ici, seul l'ajout ou le retrait d'un membre
 * réordonne, et c'est un geste délibéré. Le trop-plein est l'affaire de l'affichage, qui sait déjà
 * n'en montrer qu'une partie.
 *
 * LA TABLE POINTE TOUJOURS VERS UN NŒUD RÉEL. Une bulle membre d'une bulle n'apparaît pas dans la
 * table : ses propres descendants y sont, de sorte qu'une arête de substitution atteint directement le
 * nœud qui calcule.
 */
export function portsDeBulle(
  noeuds: readonly NoeudG[],
  bulleId: string,
  getDef: (ficheId: string) => DefPorts | undefined,
  nomDe: (n: NoeudG) => string,
): PortsBulle {
  const entrees: PortDef[] = [];
  const sorties: PortDef[] = [];
  const mapEntrees: PortInterne[] = [];
  const mapSorties: PortInterne[] = [];
  const vus = new Set<string>();

  const parcourir = (id: string): void => {
    if (vus.has(id)) return;
    vus.add(id);
    for (const m of membresDe(noeuds, id)) {
      if (estBulle(m.data.ficheId)) { parcourir(m.id); continue; }
      const def = getDef(m.data.ficheId);
      if (!def) continue;
      const nom = nomDe(m);
      def.entrees.forEach((p: PortDef, i: number) => {
        entrees.push({ ...p, nom: `${nom} ▸ ${p.nom}`, nomEn: `${nom} ▸ ${p.nomEn ?? p.nom}`, requis: false });
        mapEntrees.push({ noeudInterne: m.id, portIndex: i });
      });
      def.sorties.forEach((p: PortDef, i: number) => {
        sorties.push({ ...p, nom: `${nom} ▸ ${p.nom}`, nomEn: `${nom} ▸ ${p.nomEn ?? p.nom}` });
        mapSorties.push({ noeudInterne: m.id, portIndex: i });
      });
    }
  };
  parcourir(bulleId);
  return { entrees, sorties, mapEntrees, mapSorties };
}

/**
 * AUCUN PORT D'UNE BULLE N'EST OBLIGATOIRE, et c'est délibéré.
 *
 * Un port requis non connecté fait échouer la validation du graphe (`core/validation.ts`). Une bulle
 * expose tous les ports de ses membres, libres compris : les déclarer requis interdirait d'exécuter un
 * graphe dès qu'on replie quoi que ce soit. La validation continue de porter sur les membres, qui sont
 * toujours là.
 */

/** Le préfixe qui marque une arête de substitution, pour qu'aucun autre code ne s'y trompe. */
export const PREFIXE_SUBSTITUTION = "sub::";

export const estSubstitution = (a: AreteG): boolean => a.id.startsWith(PREFIXE_SUBSTITUTION);

/**
 * Pose `hidden` sur ce qui est caché, et remplace les arêtes traversantes.
 *
 * C'EST UNE NORMALISATION, appelée après toute mutation qui touche au repli : elle ne lit que
 * l'appartenance et l'état de repli, et réécrit le reste. Rejouée deux fois de suite, elle rend la
 * même chose.
 *
 * `hidden` DÉJÀ POSÉ AILLEURS EST RESPECTÉ. Le réalisateur de démonstration cache les nœuds qu'il n'a
 * pas encore révélés : la normalisation n'ôte donc `hidden` qu'à ce qu'elle a elle-même caché, ce que
 * `data.cacheParBulle` note sur le nœud.
 */
export function appliquerRepli(
  noeuds: readonly NoeudG[],
  aretes: readonly AreteG[],
  getDef: (ficheId: string) => DefPorts | undefined,
  nomDe: (n: NoeudG) => string,
): { noeuds: NoeudG[]; aretes: AreteG[] } {
  const ports = new Map<string, PortsBulle>();
  const portsPour = (bulleId: string): PortsBulle => {
    let p = ports.get(bulleId);
    if (!p) { p = portsDeBulle(noeuds, bulleId, getDef, nomDe); ports.set(bulleId, p); }
    return p;
  };

  const cachants = new Map<string, string | undefined>();
  for (const n of noeuds) cachants.set(n.id, bulleCachante(noeuds, n.id));

  const sortieNoeuds: NoeudG[] = noeuds.map((n) => {
    const cache = cachants.get(n.id) !== undefined;
    const data = { ...n.data };
    const cachePrecedemment = data.cacheParBulle === true;
    if (cache) data.cacheParBulle = true; else delete data.cacheParBulle;
    // On ne touche `hidden` que si c'est nous qui l'avons posé ou qui le posons.
    const hidden = cache ? true : cachePrecedemment ? false : (n as { hidden?: boolean }).hidden;
    return { ...n, hidden, data };
  });

  const reelles = aretes.filter((a) => !estSubstitution(a));
  const sortieAretes: AreteG[] = [];
  for (const a of reelles) {
    const bs = cachants.get(a.source);
    const bt = cachants.get(a.target);
    if (!bs && !bt) { sortieAretes.push({ ...a, hidden: false }); continue; }
    // Les deux extrémités dans la même bulle repliée : l'arête est interne, on la cache sans
    // substitut — il n'y a rien à montrer entre deux nœuds qu'on ne voit pas.
    sortieAretes.push({ ...a, hidden: true });
    if (bs === bt) continue;

    const source = bs ?? a.source;
    const target = bt ?? a.target;
    let sourceHandle = a.sourceHandle ?? "out:0";
    let targetHandle = a.targetHandle ?? "in:0";
    if (bs) {
      const i = portsPour(bs).mapSorties
        .findIndex((m) => m.noeudInterne === a.source && m.portIndex === indexPort(a.sourceHandle, 0));
      if (i < 0) continue;
      sourceHandle = `out:${i}`;
    }
    if (bt) {
      const i = portsPour(bt).mapEntrees
        .findIndex((m) => m.noeudInterne === a.target && m.portIndex === indexPort(a.targetHandle, 0));
      if (i < 0) continue;
      targetHandle = `in:${i}`;
    }
    sortieAretes.push({
      ...a, id: `${PREFIXE_SUBSTITUTION}${a.id}`, source, target, sourceHandle, targetHandle, hidden: false,
    });
  }
  return { noeuds: sortieNoeuds, aretes: sortieAretes };
}

/**
 * Traduit une connexion déposée sur la poignée d'une bulle en connexion vers le nœud réel.
 *
 * Rend `null` quand la poignée ne désigne rien — une bulle vide, un index hors liste —, pour que
 * l'appelant refuse la connexion plutôt que d'en fabriquer une fausse.
 */
export function traduireConnexion(
  noeuds: readonly NoeudG[],
  conn: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null },
  getDef: (ficheId: string) => DefPorts | undefined,
  nomDe: (n: NoeudG) => string,
): { source: string; target: string; sourceHandle: string; targetHandle: string } | null {
  const parId = new Map(noeuds.map((n) => [n.id, n]));
  let { source, target } = conn;
  let sourceHandle = conn.sourceHandle ?? "out:0";
  let targetHandle = conn.targetHandle ?? "in:0";

  const s = parId.get(source);
  if (s && estBulle(s.data.ficheId)) {
    const m = portsDeBulle(noeuds, source, getDef, nomDe).mapSorties[indexPort(sourceHandle, -1)];
    if (!m) return null;
    source = m.noeudInterne;
    sourceHandle = `out:${m.portIndex}`;
  }
  const t = parId.get(target);
  if (t && estBulle(t.data.ficheId)) {
    const m = portsDeBulle(noeuds, target, getDef, nomDe).mapEntrees[indexPort(targetHandle, -1)];
    if (!m) return null;
    target = m.noeudInterne;
    targetHandle = `in:${m.portIndex}`;
  }
  if (source === target) return null;
  return { source, target, sourceHandle, targetHandle };
}

/**
 * Les bulles vides, à supprimer.
 *
 * Une bulle dont on a retiré le dernier membre n'a plus de port, donc plus de prise : elle disparaît
 * d'elle-même. Décision de Fabien.
 */
export const bullesVides = (noeuds: readonly NoeudG[]): string[] =>
  noeuds.filter((n) => estBulle(n.data.ficheId) && membresDe(noeuds, n.id).length === 0).map((n) => n.id);
