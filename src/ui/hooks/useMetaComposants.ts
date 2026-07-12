// ui/hooks/useMetaComposants.ts — Méta-composants (§3.8) : grouper / dégrouper +
// navigation dans l'intérieur (double-clic, fil d'Ariane).
// Extrait d'App.tsx à l'identique (comportement inchangé). La logique pure (créer /
// aplatir / redériver / frontières) vit dans core/meta.ts (testée) ; ce hook ne fait
// que l'orchestrer avec l'état React (nœuds/arêtes/pile de navigation).
import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import type { Edge } from "@xyflow/react";
import {
  creerMeta, enregistrerMeta, trouverMeta, indexPort,
  redériverMeta, frontieresPourEdition, renommerMeta,
  type NoeudG, type AreteG,
} from "../../core";
import { registre } from "../../audio/adaptateur";
import type { PluginDef } from "../../core";
const trouverDef = (id: string) => registre.trouverDef(id);
import { idUnique } from "../ids";

// Typage souple : le code d'origine castait déjà tout en `unknown`/`any` pour passer
// entre les nœuds React-Flow et les nœuds « purs » du cœur. On n'y touche pas.
type GrapheRacine = { nodes: any[]; edges: any[] } | null;

export interface OptionsMeta {
  noeudsRef: MutableRefObject<any[]>;
  aretesRef: MutableRefObject<any[]>;
  pileRef: MutableRefObject<{ metaId: string; nom: string }[]>;
  grapheRacineRef: MutableRefObject<GrapheRacine>;
  cacheExec: MutableRefObject<Map<string, any>>;
  setNodes: Dispatch<SetStateAction<any[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setPile: Dispatch<SetStateAction<{ metaId: string; nom: string }[]>>;
  setSel: (n: any) => void;
  // Callbacks standard à rattacher à chaque nœud (fournis par App, réutilisés ici).
  callbacksNoeud: () => Record<string, unknown>;
}

export function useMetaComposants(o: OptionsMeta) {
  const compteurMeta = useRef(0);

  // ── Regrouper la sélection en un méta-composant ──
  const grouper = useCallback(() => {
    const selNodes = o.noeudsRef.current.filter((n) => (n as { selected?: boolean }).selected);
    if (selNodes.length < 2) { window.alert("Sélectionnez au moins deux nœuds à grouper (cadre de sélection ou Maj+clic)."); return; }
    const selection = new Set(selNodes.map((n) => n.id));
    const num = ++compteurMeta.current;
    const metaId = `meta-${Date.now().toString(36)}-${num}`;
    const metaNoeudId = idUnique(o.noeudsRef.current);
    let cpt = 0;
    const { meta, noeudMeta, nouvellesAretes } = creerMeta(
      metaId, metaNoeudId, `Groupe ${num}`, selection,
      o.noeudsRef.current as unknown as NoeudG[],
      o.aretesRef.current as unknown as AreteG[],
      (fid) => trouverDef(fid),
      () => `e-meta-${Date.now()}-${cpt++}`,
    );
    enregistrerMeta(meta);
    const externes = o.noeudsRef.current.filter((n) => !selection.has(n.id));
    const noeudUI = { ...noeudMeta, data: { ...noeudMeta.data, statut: "attente" as const, ...o.callbacksNoeud() } };
    o.setNodes([...externes, noeudUI]);
    o.setEdges(nouvellesAretes as unknown as Edge[]);
    o.cacheExec.current.clear();
    o.setSel(null);
  }, [o]);

  // ── Dégrouper le méta-composant sélectionné ──
  const degrouper = useCallback(() => {
    const cible = o.noeudsRef.current.find((n) => (n as { selected?: boolean }).selected && trouverMeta(n.data.ficheId as string));
    if (!cible) { window.alert("Sélectionnez un méta-composant à dégrouper."); return; }
    const meta = trouverMeta(cible.data.ficheId as string)!;
    const prefixe = `${cible.id}::`;
    const cb = o.callbacksNoeud();
    const nouveaux = o.noeudsRef.current.filter((n) => n.id !== cible.id).slice() as unknown as NoeudG[];
    for (const sn of meta.sousNoeuds) {
      nouveaux.push({ ...sn, id: prefixe + sn.id, type: "atelier", data: { ...sn.data, statut: "attente", ...cb } });
    }
    const nouvellesA = o.aretesRef.current.filter((e) => e.source !== cible.id && e.target !== cible.id).slice() as unknown as AreteG[];
    for (const e of o.aretesRef.current) {
      if (e.target === cible.id) { const m = meta.mapEntrees[indexPort(e.targetHandle)]; if (m) nouvellesA.push({ ...e, id: `${e.id}-dg`, target: prefixe + m.noeudInterne, targetHandle: `in:${m.portIndex}` } as AreteG); }
      if (e.source === cible.id) { const m = meta.mapSorties[indexPort(e.sourceHandle)]; if (m) nouvellesA.push({ ...e, id: `${e.id}-dg`, source: prefixe + m.noeudInterne, sourceHandle: `out:${m.portIndex}` } as AreteG); }
    }
    for (const se of meta.sousAretes) nouvellesA.push({ ...se, id: prefixe + se.id, source: prefixe + se.source, target: prefixe + se.target });
    o.setNodes(nouveaux as unknown as any[]);
    o.setEdges(nouvellesA as unknown as Edge[]);
    o.cacheExec.current.clear();
    o.setSel(null);
  }, [o]);

  // ── Navigation : sauver le contexte courant (racine ou méta du sommet de pile) ──
  const sauvegarderContexteCourant = useCallback(() => {
    const N = o.noeudsRef.current;
    const E = o.aretesRef.current;
    if (o.pileRef.current.length === 0) {
      o.grapheRacineRef.current = { nodes: N.map((n) => ({ ...n })), edges: E.map((e) => ({ ...e })) };
    } else {
      const meta = trouverMeta(o.pileRef.current[o.pileRef.current.length - 1].metaId);
      if (meta) {
        // Re-dérive les ports exposés depuis les nœuds-frontière de l'intérieur édité.
        const r = redériverMeta(N as unknown as NoeudG[], E as unknown as AreteG[], (fid) => trouverDef(fid));
        meta.entrees = r.entrees;
        meta.sorties = r.sorties;
        meta.mapEntrees = r.mapEntrees;
        meta.mapSorties = r.mapSorties;
        meta.sousNoeuds = r.sousNoeuds;
        meta.sousAretes = r.sousAretes;
        enregistrerMeta(meta);
      }
    }
  }, [o]);

  // ── Charger l'intérieur d'un méta pour édition ──
  const chargerContexteMeta = useCallback((metaId: string) => {
    const meta = trouverMeta(metaId);
    if (!meta) return;
    const cb = o.callbacksNoeud();
    // Nœuds réels + nœuds-frontière (ports exposés matérialisés pour l'édition).
    const fr = frontieresPourEdition(meta);
    const tous = [...meta.sousNoeuds, ...fr.noeuds];
    const inner = tous.map((sn) => ({ ...sn, type: "atelier", position: sn.position ?? { x: 0, y: 0 }, data: { ...sn.data, statut: (sn.data as { statut?: string }).statut ?? "attente", ...cb } }));
    o.setNodes(inner as unknown as any[]);
    o.setEdges([...meta.sousAretes, ...fr.aretes].map((a) => ({ ...a })) as unknown as Edge[]);
    o.cacheExec.current.clear();
    o.setSel(null);
  }, [o]);

  const ouvrirMeta = useCallback((metaId: string) => {
    const meta = trouverMeta(metaId);
    if (!meta) return;
    sauvegarderContexteCourant();
    chargerContexteMeta(metaId);
    o.setPile((p) => [...p, { metaId, nom: meta.nom }]);
  }, [sauvegarderContexteCourant, chargerContexteMeta, o]);

  // Remonte le fil d'Ariane à un niveau donné (-1 = racine).
  const remonterA = useCallback((niveauCible: number) => {
    sauvegarderContexteCourant();
    const nouvellePile = o.pileRef.current.slice(0, niveauCible + 1);
    if (nouvellePile.length === 0) {
      const g = o.grapheRacineRef.current;
      if (g) { o.setNodes(g.nodes as unknown as any[]); o.setEdges(g.edges as unknown as Edge[]); o.cacheExec.current.clear(); o.setSel(null); }
    } else {
      chargerContexteMeta(nouvellePile[nouvellePile.length - 1].metaId);
    }
    o.setPile(nouvellePile);
  }, [sauvegarderContexteCourant, chargerContexteMeta, o]);

  // ── Renommer un méta-composant sélectionné ──
  const renommer = useCallback(() => {
    const cible = o.noeudsRef.current.find((n) => (n as { selected?: boolean }).selected && trouverMeta(n.data.ficheId as string));
    if (!cible) {
      window.alert("Sélectionnez un méta-composant à renommer.");
      return;
    }
    const meta = trouverMeta(cible.data.ficheId as string);
    if (!meta) return;
    // Electron bloque window.prompt — utiliser un champ input caché
    const input = document.createElement("input");
    input.type = "text";
    input.value = meta.nom;
    input.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:12px 20px;font-size:16px;border:2px solid #2a9d8f;border-radius:8px;background:#1a1a2e;color:#fff;z-index:99999;outline:none;width:300px;";
    input.placeholder = "Nouveau nom…";
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99998;";
    const valider = () => {
      const nom = input.value.trim();
      if (nom) {
        renommerMeta(meta.id, nom);
        o.setNodes((nds: any[]) => nds.map((n) => n.id === cible.id ? { ...n, data: { ...n.data } } : n));
      }
      overlay.remove();
      input.remove();
    };
    overlay.onclick = valider;
    input.onkeydown = (e) => { if (e.key === "Enter") valider(); if (e.key === "Escape") { overlay.remove(); input.remove(); } };
    document.body.appendChild(overlay);
    document.body.appendChild(input);
    input.focus();
    input.select();
  }, [o]);

  return { grouper, degrouper, renommer, sauvegarderContexteCourant, ouvrirMeta, remonterA };
}
