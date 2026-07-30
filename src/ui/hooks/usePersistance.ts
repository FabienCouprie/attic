// ui/hooks/usePersistance.ts — Export / import du workflow (JSON) + méta-composants.
// Extrait d'App.tsx à l'identique (comportement inchangé). Le hook reçoit l'état
// et les setters dont il a besoin et renvoie { exporter, importer }.
import { useCallback } from "react";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import type { Edge } from "@xyflow/react";
import { tousLesMetas, enregistrerMeta, type MetaComposant } from "../../core";
import { serialiserMeta } from "../metasLocaux";
import { detecterPertes, formaterRapportPertes } from "../../core/pertes";
import { useI18n } from "../../i18n";
import { rechargerFichiersPersistes } from "../rechargerFichiers";
import { filtrerAretesInvalides } from "../validerGraphe";

// Typage volontairement souple (les nœuds portent un `data` à index-signature et
// le code d'import d'origine manipulait déjà tout en `any`) : le hook est extrait
// à l'identique, sans resserrer les types au passage.
type NoeudAtelier = any;
type GrapheRacine = { nodes: NoeudAtelier[]; edges: Edge[] } | null;

export interface OptionsPersistance {
  nodes: NoeudAtelier[];
  edges: Edge[];
  setNodes: Dispatch<SetStateAction<NoeudAtelier[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  rfInstance: any;
  repertoire: string;
  sauvegarderContexteCourant: () => void;
  grapheRacineRef: MutableRefObject<GrapheRacine>;
  setPile: (p: { metaId: string; nom: string; nomEn?: string }[]) => void;
  reinitialiserNoeud: (id: string) => void;
  supprimerNoeud: (ids: string | string[]) => void;
  setPrioritaire: (id: string | null) => void;
  lancerRef: MutableRefObject<any>;
  cacheExec: MutableRefObject<Map<string, any>>;
}

export function usePersistance(o: OptionsPersistance) {
  const { t } = useI18n();
  const exporter = useCallback(async () => {
    o.sauvegarderContexteCourant();
    const racine = o.grapheRacineRef.current ?? { nodes: o.nodes, edges: o.edges };

    // ── Détection des pertes de données (Chantier B) ──
    const pertes: { noeud: string; champs: ReturnType<typeof detecterPertes> }[] = [];
    for (const n of racine.nodes) {
      const champsPurges = detecterPertes(n.data as Record<string, unknown>);
      if (champsPurges.length > 0) {
        pertes.push({ noeud: n.data?.ficheId ?? n.id, champs: champsPurges });
      }
    }
    if (pertes.length > 0) {
      const rapport = formaterRapportPertes(pertes);
      console.warn(`[attic] Données non-sérialisables purgées lors de l'export :\n${rapport}`);
      // Alerte utilisateur — non bloquante, informative, limitée au cas détaillé (≤3 nœuds)
      const nbChamps = pertes.reduce((s, p) => s + p.champs.length, 0);
      if (pertes.length <= 3) {
        const message = t("persistance.exportPertesDetail")
          .replace("{nb}", String(nbChamps))
          .replace("{rapport}", rapport);
        if (typeof alert !== "undefined") alert(message);
      }
    }

    const cleanNodes = racine.nodes.map(({ id, type, position, width, height, data }) => ({
      id, type, position, width, height,
      data: {
        ficheId: data.ficheId,
        parametres: data.parametres,
        audioNom: data.audioNom,
        midiNom: data.midiNom,
        imageNom: data.imageNom,
        svgNom: data.svgNom,
        sf2InstrumentIdx: data.sf2InstrumentIdx,
        zonesSelectionnees: data.zonesSelectionnees,
        nomFichier: data.nomFichier,
      },
    }));
    const cleanEdges = racine.edges.map(({ id, source, target, sourceHandle, targetHandle, type, style }) => ({
      id, source, target, sourceHandle, targetHandle, type, style,
    }));
    const metas = tousLesMetas().map(serialiserMeta);
    const json = JSON.stringify({ nodes: cleanNodes, edges: cleanEdges, metas, viewport: o.rfInstance?.getViewport() }, null, 2);
    const nom = `attic-${new Date().toISOString().slice(0, 10)}.json`;

    if ((window as any).api?.sauvegarderFichier) {
      // Mode Electron : dialogue de sauvegarde dans le répertoire work par défaut
      const api = (window as any).api;
      let dossier = o.repertoire;
      if (!dossier) {
        dossier = await api.obtenirRepertoireTravail?.();
      }
      const defaultPath = dossier ? `${dossier}\\${nom}` : nom;
      const result = await api.sauvegarderFichier({
        defaultPath,
        filters: [{ name: "Workflow Attic", extensions: ["json"] }],
        data: json,
      });
      // Aussi sauvegarder l'en-cours localStorage
      try {
        const data = {
          nodes: cleanNodes.map((n: any) => ({ id: n.id, position: n.position, data: { ficheId: n.data.ficheId, parametres: n.data.parametres } })),
          edges: cleanEdges.map((e: any) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })),
          viewport: o.rfInstance?.getViewport(),
          date: new Date().toISOString(),
        };
        localStorage.setItem("attic-encours", JSON.stringify(data));
      } catch {}
      if (result) {
        console.log(`[attic] Exporté : ${result}`);
      }
    } else {
      // Mode web : téléchargement
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = nom; a.click();
    }
  }, [o]);

  const importer = useCallback(async (f?: File) => {
    let texte: string;
    if (f) {
      texte = await f.text();
    } else if ((window as any).api) {
      const resultat = await (window as any).api.ouvrirFichier({
        defaultPath: o.repertoire || undefined,
        filters: [{ name: "Workflow Attic", extensions: ["json"] }],
      });
      if (!resultat) return;
      texte = resultat.contenu;
    } else {
      return;
    }
    let json: any;
    try {
      json = JSON.parse(texte);
    } catch (e) {
      console.error("[attic] Import : JSON invalide", e);
      if (typeof alert !== "undefined") alert(t("persistance.importInvalide"));
      return;
    }
    // Fichier sans nœud de canevas mais avec des métas : le canevas sera vide (les
    // métas ne sont que des définitions de catalogue). Prévenir pour qu'un canevas
    // vide ne soit pas pris pour un échec d'import (cf. workflow aux nœuds perdus).
    const nbNoeuds = Array.isArray(json.nodes) ? json.nodes.length : 0;
    const nbMetas = Array.isArray(json.metas) ? json.metas.length : 0;
    if (nbNoeuds === 0 && nbMetas > 0 && typeof alert !== "undefined") {
      alert(t("persistance.importSansNoeuds").replace("{nb}", String(nbMetas)));
    }
    // Ré-enregistrer les méta-composants AVANT de reconstruire les nœuds. Un méta
    // défaillant ne doit pas interrompre tout l'import (les autres + les nœuds passent).
    for (const m of (json.metas || [])) {
      try { enregistrerMeta(m as MetaComposant); }
      catch (e) { console.error(`[attic] Import : méta « ${(m as any)?.id} » non enregistré`, e); }
    }
    // On repart à la racine (fin d'une éventuelle navigation dans un méta).
    o.setPile([]);
    o.grapheRacineRef.current = null;
    const importedNodes = (json.nodes || []).map((n: any) => ({
      ...n,
      data: {
        ...n.data,
        statut: "attente",
        onSupprimerNoeud: (nid: string) => o.supprimerNoeud(nid),
        onReinitialiser: (nid: string) => o.reinitialiserNoeud(nid),
        onDefinirPrioritaire: (nid: string) => {
          o.setPrioritaire(nid);
          o.lancerRef.current(nid);
        },
        onChargerAudio: (nid: string, fichier: File) => {
          const api = (window as any).api;
          const chemin = api?.cheminFichier ? api.cheminFichier(fichier) : "";
          o.setNodes((nds2) => nds2.map((nd) => nd.id === nid ? { ...nd, data: { ...nd.data, audioFichier: fichier, audioNom: fichier.name, audioUrl: URL.createObjectURL(fichier), parametres: { ...nd.data.parametres, Chemin: chemin } } } : nd));
        },
        onChargerMidi: (nid: string, fichier: File) => {
          const api = (window as any).api;
          const chemin = api?.cheminFichier ? api.cheminFichier(fichier) : "";
          o.setNodes((nds2) => nds2.map((nd) => nd.id === nid ? { ...nd, data: { ...nd.data, midiFichier: fichier, midiNom: fichier.name, parametres: { ...nd.data.parametres, Chemin: chemin } } } : nd));
        },
        onChargerImage: (nid: string, fichier: File) => {
          const api = (window as any).api;
          const chemin = api?.cheminFichier ? api.cheminFichier(fichier) : "";
          o.setNodes((nds2) => nds2.map((nd) => nd.id === nid ? { ...nd, data: { ...nd.data, imageFichier: fichier, imageNom: fichier.name, parametres: { ...nd.data.parametres, Chemin: chemin } } } : nd));
        },
        onChargerSvg: (nid: string, fichier: File) => {
          const api = (window as any).api;
          const chemin = api?.cheminFichier ? api.cheminFichier(fichier) : "";
          o.setNodes((nds2) => nds2.map((nd) => nd.id === nid ? { ...nd, data: { ...nd.data, svgFichier: fichier, svgNom: fichier.name, parametres: { ...nd.data.parametres, Chemin: chemin } } } : nd));
        },
        onChangerEnregistrement: (nid: string, blob: Blob) => {
          o.setNodes((nds2) => nds2.map((nd) => nd.id === nid ? { ...nd, data: { ...nd.data, enregistrementBlob: blob, enregistrementUrl: URL.createObjectURL(blob) } } : nd));
        },
        onChangerParametre: (nid: string, nom: string, val: number | string) => {
          o.cacheExec.current.delete(nid);
          o.setNodes((nds2) => nds2.map((nd) => nd.id === nid ? { ...nd, data: { ...nd.data, parametres: { ...nd.data.parametres, [nom]: val } } } : nd));
          o.reinitialiserNoeud(nid);
        },
        onChangerZones: (nid: string, zones: { debut: number; duree: number }[]) => {
          o.cacheExec.current.delete(nid);
          o.setNodes((nds2) => nds2.map((nd) => nd.id === nid ? { ...nd, data: { ...nd.data, zonesSelectionnees: zones } } : nd));
        },
      },
    }));

    // Recharger les fichiers persistés (Electron) : le File n'est pas sérialisable,
    // mais le chemin est sauvé dans le paramètre "Chemin".
    await rechargerFichiersPersistes(importedNodes);

    const aretesValides = filtrerAretesInvalides(importedNodes, json.edges || []);
    o.setNodes(importedNodes);
    o.setEdges(aretesValides);
    o.cacheExec.current.clear();
    if (json.viewport && o.rfInstance) o.rfInstance.setViewport(json.viewport);
  }, [o]);

  return { exporter, importer };
}
