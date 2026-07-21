// core/meta.ts — Méta-composants (sous-graphes, spec §3.8).
// Logique pure (sans React ni DOM) : construction d'un méta-composant à partir
// d'une sélection, et aplatissement d'un graphe (expansion des méta-nœuds) avant
// exécution. Réutilise le moteur DAG existant sans le modifier.
import type { PortDef } from "./types";

export interface NoeudG {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  width?: number;
  height?: number;
  data: { ficheId: string; parametres?: Record<string, unknown>; [k: string]: unknown };
}

export interface AreteG {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  [k: string]: unknown;
}

// Un port exposé pointe vers un port d'un nœud intérieur.
export interface PortInterne { noeudInterne: string; portIndex: number }

export interface MetaComposant {
  id: string;
  nom: string;
  nomEn?: string;
  entrees: PortDef[];
  sorties: PortDef[];
  mapEntrees: PortInterne[]; // parallèle à entrees
  mapSorties: PortInterne[]; // parallèle à sorties
  sousNoeuds: NoeudG[];
  sousAretes: AreteG[];
}

export interface DefPorts { entrees: PortDef[]; sorties: PortDef[] }

// Identifiants des nœuds-frontière (ports exposés visibles dans la vue interne).
export const ID_ENTREE_FRONTIERE = "__entree-frontiere";
export const ID_SORTIE_FRONTIERE = "__sortie-frontiere";
export function estFrontiere(ficheId: string): boolean {
  return ficheId === ID_ENTREE_FRONTIERE || ficheId === ID_SORTIE_FRONTIERE;
}

export function indexPort(handle: string | null | undefined, defaut = 0): number {
  if (!handle) return defaut;
  const n = parseInt(handle.split(":")[1]);
  return Number.isNaN(n) ? defaut : n;
}

// N'emporte dans le sous-graphe que les champs utiles à l'exécution/au rendu
// (pas les callbacks React ni les URL de résultat runtime).
export function nettoyerNoeud(n: NoeudG): NoeudG {
  const d = n.data as Record<string, unknown>;
  const data: NoeudG["data"] = { ficheId: d.ficheId as string, parametres: (d.parametres as Record<string, unknown>) ?? {} };
  for (const cle of ["audioFichier", "audioNom", "midiFichier", "midiNom", "enregistrementBlob", "sequenceNotes", "modeleFichier", "sf2InstrumentIdx", "zonesSelectionnees"]) {
    if (d[cle] !== undefined) data[cle] = d[cle];
  }
  return { id: n.id, type: n.type, position: n.position ?? { x: 0, y: 0 }, width: n.width, height: n.height, data };
}

// Construit un méta-composant à partir d'une sélection de nœuds, et renvoie le
// nouveau graphe principal (nœuds sélectionnés remplacés par le méta-nœud, arêtes
// externes recâblées). Les ports exposés sont les arêtes qui traversent la frontière.
export function creerMeta(
  metaId: string,
  metaNoeudId: string,
  nom: string,
  selection: Set<string>,
  noeuds: NoeudG[],
  aretes: AreteG[],
  getDef: (ficheId: string) => DefPorts | undefined,
  nouvelIdArete: () => string,
): { meta: MetaComposant; noeudMeta: NoeudG; nouveauxNoeuds: NoeudG[]; nouvellesAretes: AreteG[] } {
  const interne = noeuds.filter((n) => selection.has(n.id));
  const externe = noeuds.filter((n) => !selection.has(n.id));
  const ficheDe = (id: string) => noeuds.find((n) => n.id === id)?.data.ficheId ?? "";

  const entrees: PortDef[] = [];
  const sorties: PortDef[] = [];
  const mapEntrees: PortInterne[] = [];
  const mapSorties: PortInterne[] = [];
  const cleEntree = new Map<string, number>();
  const cleSortie = new Map<string, number>();
  const sousAretes: AreteG[] = [];
  const nouvellesAretes: AreteG[] = [];

  for (const a of aretes) {
    const sIn = selection.has(a.source);
    const tIn = selection.has(a.target);
    if (sIn && tIn) {
      sousAretes.push(a); // arête interne : part dans le sous-graphe
    } else if (!sIn && tIn) {
      // externe → entrée d'un nœud interne : port d'ENTRÉE exposé
      const ti = indexPort(a.targetHandle, 0);
      const cle = `${a.target}:${ti}`;
      let idx = cleEntree.get(cle);
      if (idx === undefined) {
        idx = entrees.length;
        cleEntree.set(cle, idx);
        const type = getDef(ficheDe(a.target))?.entrees[ti]?.type ?? "audio";
        entrees.push({ nom: `In ${idx + 1}`, type });
        mapEntrees.push({ noeudInterne: a.target, portIndex: ti });
      }
      nouvellesAretes.push({ ...a, id: nouvelIdArete(), target: metaNoeudId, targetHandle: `in:${idx}` });
    } else if (sIn && !tIn) {
      // sortie d'un nœud interne → externe : port de SORTIE exposé
      const si = indexPort(a.sourceHandle, 0);
      const cle = `${a.source}:${si}`;
      let idx = cleSortie.get(cle);
      if (idx === undefined) {
        idx = sorties.length;
        cleSortie.set(cle, idx);
        const type = getDef(ficheDe(a.source))?.sorties[si]?.type ?? "audio";
        sorties.push({ nom: `Out ${idx + 1}`, type });
        mapSorties.push({ noeudInterne: a.source, portIndex: si });
      }
      nouvellesAretes.push({ ...a, id: nouvelIdArete(), source: metaNoeudId, sourceHandle: `out:${idx}` });
    } else {
      nouvellesAretes.push(a); // entièrement externe : inchangée
    }
  }

  const meta: MetaComposant = {
    id: metaId,
    nom,
    entrees,
    sorties,
    mapEntrees,
    mapSorties,
    sousNoeuds: interne.map(nettoyerNoeud),
    sousAretes: sousAretes.map((a) => ({ ...a })),
  };

  // Position du méta-nœud : barycentre de la sélection.
  const cx = interne.reduce((s, n) => s + (n.position?.x ?? 0), 0) / Math.max(1, interne.length);
  const cy = interne.reduce((s, n) => s + (n.position?.y ?? 0), 0) / Math.max(1, interne.length);
  const noeudMeta: NoeudG = { id: metaNoeudId, type: "atelier", position: { x: cx, y: cy }, data: { ficheId: metaId, nom, parametres: {} } };

  const nouveauxNoeuds = [...externe, noeudMeta];
  return { meta, noeudMeta, nouveauxNoeuds, nouvellesAretes };
}

// Aplatit un graphe : remplace chaque méta-nœud par ses nœuds/arêtes intérieurs
// (id préfixés par l'id du méta-nœud), et recâble les arêtes externes vers les
// ports intérieurs correspondants. Récursif : gère les méta-composants imbriqués.
export function aplatirGraphe(
  noeuds: NoeudG[],
  aretes: AreteG[],
  getMeta: (ficheId: string) => MetaComposant | undefined,
): { noeuds: NoeudG[]; aretes: AreteG[]; expansions: Map<string, string> } {
  // expansions : id de nœud interne aplati → id du méta-nœud d'origine (pour
  // remonter un résultat vers le méta-nœud affiché).
  const expansions = new Map<string, string>();
  let courantN = noeuds.map((n) => ({ ...n }));
  let courantE = aretes.map((a) => ({ ...a }));
  let encore = true;
  let garde = 0;

  while (encore && garde++ < 100) {
    encore = false;
    const outN: NoeudG[] = [];
    const outE: AreteG[] = courantE.map((a) => ({ ...a }));
    for (const n of courantN) {
      const meta = getMeta(n.data.ficheId);
      if (!meta) { outN.push(n); continue; }
      encore = true;
      const prefixe = `${n.id}::`;
      const racine = expansions.get(n.id) ?? n.id;
      for (const sn of meta.sousNoeuds) {
        const nid = prefixe + sn.id;
        expansions.set(nid, racine);
        outN.push({ ...sn, id: nid });
      }
      for (const se of meta.sousAretes) {
        outE.push({ ...se, id: prefixe + se.id, source: prefixe + se.source, target: prefixe + se.target });
      }
      for (const e of outE) {
        if (e.target === n.id) {
          const m = meta.mapEntrees[indexPort(e.targetHandle, 0)];
          if (m) { e.target = prefixe + m.noeudInterne; e.targetHandle = `in:${m.portIndex}`; }
        }
        if (e.source === n.id) {
          const m = meta.mapSorties[indexPort(e.sourceHandle, 0)];
          if (m) { e.source = prefixe + m.noeudInterne; e.sourceHandle = `out:${m.portIndex}`; }
        }
      }
    }
    courantN = outN;
    courantE = outE;
  }

  return { noeuds: courantN, aretes: courantE, expansions };
}

// Synthétise les nœuds-frontière (et leurs arêtes vers les ports internes) pour
// l'édition de l'intérieur d'un méta : un nœud « ▸ entrée » / « sortie ◂ » par
// port exposé, relié au port interne correspondant.
export function frontieresPourEdition(meta: MetaComposant): { noeuds: NoeudG[]; aretes: AreteG[] } {
  const noeuds: NoeudG[] = [];
  const aretes: AreteG[] = [];
  // Placement relatif à la boîte englobante des nœuds internes : les frontières
  // se posent juste à gauche (entrées) et à droite (sorties) du contenu, pour
  // une vue interne compacte et lisible plutôt qu'étalée.
  const xs = meta.sousNoeuds.map((n) => n.position?.x ?? 0);
  const ys = meta.sousNoeuds.map((n) => n.position?.y ?? 0);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 0;
  const baseY = ys.length ? Math.min(...ys) : 0;
  meta.entrees.forEach((p, i) => {
    const m = meta.mapEntrees[i];
    if (!m) return;
    const id = `__fe-${i}`;
    noeuds.push({ id, type: "atelier", position: { x: minX - 200, y: baseY + i * 96 }, data: { ficheId: ID_ENTREE_FRONTIERE, parametres: {}, frontiereNom: p.nom } });
    aretes.push({ id: `__fe-e-${i}`, source: id, sourceHandle: "out:0", target: m.noeudInterne, targetHandle: `in:${m.portIndex}` });
  });
  meta.sorties.forEach((p, i) => {
    const m = meta.mapSorties[i];
    if (!m) return;
    const id = `__fs-${i}`;
    noeuds.push({ id, type: "atelier", position: { x: maxX + 240, y: baseY + i * 96 }, data: { ficheId: ID_SORTIE_FRONTIERE, parametres: {}, frontiereNom: p.nom } });
    aretes.push({ id: `__fs-e-${i}`, source: m.noeudInterne, sourceHandle: `out:${m.portIndex}`, target: id, targetHandle: "in:0" });
  });
  return { noeuds, aretes };
}

// Reconstruit les ports exposés d'un méta à partir de son intérieur édité :
// chaque nœud-frontière relié à un port interne devient un port exposé (type
// hérité du port interne). Les nœuds réels et leurs arêtes forment le sous-graphe.
export function redériverMeta(
  noeuds: NoeudG[],
  aretes: AreteG[],
  getDef: (ficheId: string) => DefPorts | undefined,
): { entrees: PortDef[]; sorties: PortDef[]; mapEntrees: PortInterne[]; mapSorties: PortInterne[]; sousNoeuds: NoeudG[]; sousAretes: AreteG[] } {
  const reels = noeuds.filter((n) => !estFrontiere(n.data.ficheId));
  const idsReels = new Set(reels.map((n) => n.id));
  const ficheDe = (id: string) => noeuds.find((n) => n.id === id)?.data.ficheId ?? "";
  // Ordre stable des ports : les frontières pré-existantes (id « __fe-i » / « __fs-i »)
  // gardent leur index d'origine ; les nouvelles (ajoutées à la main) sont ajoutées
  // ensuite, triées par position verticale. Préserve la validité des arêtes externes
  // du méta-nœud pour les ports déjà exposés.
  const ordre = (n: NoeudG) => {
    const m = /^__f[es]-(\d+)$/.exec(n.id);
    return m ? parseInt(m[1]) : 1000 + (n.position?.y ?? 0);
  };
  const parOrdre = (a: NoeudG, b: NoeudG) => ordre(a) - ordre(b);
  const entreesN = noeuds.filter((n) => n.data.ficheId === ID_ENTREE_FRONTIERE).sort(parOrdre);
  const sortiesN = noeuds.filter((n) => n.data.ficheId === ID_SORTIE_FRONTIERE).sort(parOrdre);

  const entrees: PortDef[] = [];
  const mapEntrees: PortInterne[] = [];
  const sorties: PortDef[] = [];
  const mapSorties: PortInterne[] = [];

  for (const bn of entreesN) {
    const e = aretes.find((a) => a.source === bn.id && idsReels.has(a.target));
    if (!e) continue; // frontière non reliée → ignorée
    const ti = indexPort(e.targetHandle, 0);
    const type = getDef(ficheDe(e.target))?.entrees[ti]?.type ?? "audio";
    entrees.push({ nom: (bn.data.frontiereNom as string) || `In ${entrees.length + 1}`, type });
    mapEntrees.push({ noeudInterne: e.target, portIndex: ti });
  }
  for (const bn of sortiesN) {
    const e = aretes.find((a) => a.target === bn.id && idsReels.has(a.source));
    if (!e) continue;
    const si = indexPort(e.sourceHandle, 0);
    const type = getDef(ficheDe(e.source))?.sorties[si]?.type ?? "audio";
    sorties.push({ nom: (bn.data.frontiereNom as string) || `Out ${sorties.length + 1}`, type });
    mapSorties.push({ noeudInterne: e.source, portIndex: si });
  }

  const sousNoeuds = reels.map(nettoyerNoeud);
  const sousAretes = aretes.filter((a) => idsReels.has(a.source) && idsReels.has(a.target)).map((a) => ({ ...a }));
  return { entrees, sorties, mapEntrees, mapSorties, sousNoeuds, sousAretes };
}
