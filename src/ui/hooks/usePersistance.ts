// ui/hooks/usePersistance.ts — Export / import du workflow (JSON) + méta-composants.
// Extrait d'App.tsx à l'identique (comportement inchangé). Le hook reçoit l'état
// et les setters dont il a besoin et renvoie { exporter, importer }.
import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import type { Edge } from "@xyflow/react";
import { tousLesMetas, enregistrerMeta, type MetaComposant } from "../../core";
import { serialiserMeta } from "../metasLocaux";
import { detecterPertes, formaterRapportPertes } from "../../core/pertes";
import { useI18n } from "../../i18n";
import { rechargerFichiersPersistes } from "../rechargerFichiers";
import { filtrerAretesInvalides } from "../validerGraphe";
import { decisionSauvegardeAuto, type DecisionSauvegarde } from "../sauvegarde-auto";

// Typage volontairement souple (les nœuds portent un `data` à index-signature et
// le code d'import d'origine manipulait déjà tout en `any`) : le hook est extrait
// à l'identique, sans resserrer les types au passage.
type NoeudAtelier = any;
type GrapheRacine = { nodes: NoeudAtelier[]; edges: Edge[] } | null;

export interface OptionsPersistance {
  nodes: NoeudAtelier[];
  edges: Edge[];
  setNodes: Dispatch<SetStateAction<NoeudAtelier[]>>;
  setEdges: Dispatch<SetStateAction<NoeudAtelier[]>>;
  rfInstance: any;
  repertoire: string;
  sauvegarderContexteCourant: () => void;
  grapheRacineRef: MutableRefObject<GrapheRacine>;
  setPile: (p: { metaId: string; nom: string; nomEn?: string }[]) => void;
  reinitialiserNoeud: (id: string) => void;
  supprimerNoeud: (ids: string | string[]) => void;
  setPrioritaire: (id: string | null) => void;
  /** Gestionnaires attachés au `data` de chaque nœud — définis une seule fois, dans App. */
  callbacksNoeud: () => Record<string, unknown>;
  lancerRef: MutableRefObject<any>;
  cacheExec: MutableRefObject<Map<string, any>>;
  currentFilePath: string | null;
  setCurrentFilePath: (path: string | null) => void;
}

export function usePersistance(o: OptionsPersistance) {
  const { t } = useI18n();
  // Référence stable vers le fichier courant pour éviter les stale closures
  // dans les raccourcis clavier / callbacks de la barre d'outils.
  const currentFilePathRef = useRef(o.currentFilePath);
  // Le dernier contenu écrit : la sauvegarde automatique s'abstient quand rien n'a bougé,
  // pour ne pas réécrire le même fichier toutes les trente secondes.
  const dernierJsonRef = useRef<string | null>(null);
  useEffect(() => {
    currentFilePathRef.current = o.currentFilePath;
  }, [o.currentFilePath]);

  const buildExportData = useCallback(() => {
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
    }

    const cleanNodes = racine.nodes.map(({ id, type, position, width, height, data }) => ({
      id, type, position, width, height,
      data: {
        ficheId: data.ficheId,
        parametres: data.parametres,
        audioNom: data.audioNom,
        audioChemin: data.audioChemin,
        midiNom: data.midiNom,
        imageNom: data.imageNom,
        svgNom: data.svgNom,
        sf2InstrumentIdx: data.sf2InstrumentIdx,
        zonesSelectionnees: data.zonesSelectionnees,
        // Le .sfz designe dans un « Clavier SFZ » : sans lui, un graphe reouvert avait un clavier
        // sans instrument, alors que le fichier n'avait pas bouge du disque.
        sfzChemin: data.sfzChemin,
        sfzNom: data.sfzNom,
        // Ce qui a ete joue au clavier d'un noeud : perdu jusqu'ici a chaque reouverture.
        sequenceNotes: data.sequenceNotes,
        nomFichier: data.nomFichier,
        nom: data.nom,
        couleur: data.couleur,
      },
    }));
    const cleanEdges = racine.edges.map(({ id, source, target, sourceHandle, targetHandle, type, style }) => ({
      id, source, target, sourceHandle, targetHandle, type, style,
    }));
    const metas = tousLesMetas().map(serialiserMeta);
    const json = JSON.stringify({ nodes: cleanNodes, edges: cleanEdges, metas, viewport: o.rfInstance?.getViewport() }, null, 2);

    const encours = {
      nodes: cleanNodes.map((n: any) => ({ id: n.id, type: n.type, position: n.position, width: n.width, height: n.height, data: { ficheId: n.data.ficheId, parametres: n.data.parametres, zonesSelectionnees: n.data.zonesSelectionnees, audioChemin: n.data.audioChemin, sfzChemin: n.data.sfzChemin, sfzNom: n.data.sfzNom, sequenceNotes: n.data.sequenceNotes, nom: n.data.nom, couleur: n.data.couleur } })),
      edges: cleanEdges.map((e: any) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })),
      viewport: o.rfInstance?.getViewport(),
      date: new Date().toISOString(),
    };

    return { json, cleanNodes, cleanEdges, encours };
  }, [o]);

  /** Sauvegarde "classique" : écrit dans le fichier courant si connu, sinon demande. */
  const sauvegarder = useCallback(async (forceDialog = false) => {
    const currentFilePath = currentFilePathRef.current;
    console.log("[persistance] sauvegarder called forceDialog=", forceDialog, "currentFilePath=", currentFilePath);
    const { json, encours } = buildExportData();
    const defaultName = currentFilePath ? undefined : `attic-${new Date().toISOString().slice(0, 10)}.json`;

    if ((window as any).api?.sauvegarderFichier) {
      const api = (window as any).api;
      console.log("[persistance] api available, ecrireFichier=", !!api.ecrireFichier);
      let filePath = currentFilePath;
      // Si pas de fichier courant ou "Save as" demandé, on ouvre le dialogue.
      if (!filePath || forceDialog) {
        let dossier = o.repertoire;
        if (!dossier) dossier = await api.obtenirRepertoireTravail?.();
        const defaultPath = filePath || (dossier ? `${dossier}\\${defaultName}` : defaultName);
        filePath = await api.sauvegarderFichier({
          defaultPath,
          filters: [{ name: "Workflow Attic", extensions: ["json"] }],
          data: json,
        });
      } else if (api?.ecrireFichier) {
        // Écriture directe dans le fichier courant sans dialogue.
        await api.ecrireFichier(filePath, json);
      } else {
        // Fallback : dialogue pré-rempli avec le fichier courant.
        filePath = await api.sauvegarderFichier({
          defaultPath: filePath,
          filters: [{ name: "Workflow Attic", extensions: ["json"] }],
          data: json,
        });
      }
      if (filePath) {
        o.setCurrentFilePath(filePath);
        console.log(`[attic] Sauvegardé : ${filePath}`);
      }
    } else {
      // Mode web : téléchargement (aucun vrai "fichier courant" possible).
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = defaultName || "attic.json"; a.click();
    }

    // Toujours mettre à jour l'en-cours localStorage.
    try {
      localStorage.setItem("attic-encours", JSON.stringify(encours));
    } catch {}
    dernierJsonRef.current = json;
  }, [o, buildExportData]);

  /**
   * Sauvegarde automatique : écrit le fichier courant, sans dialogue et sans rien
   * afficher, et seulement s'il y a du nouveau.
   *
   * Elle est séparée de `sauvegarder` parce qu'elle n'a pas le droit d'ouvrir quoi que ce
   * soit : sans fichier courant ou sans écriture directe, `sauvegarder` ouvre un dialogue
   * — en mode web, il déclenche même un téléchargement —, ce qu'un minuteur ne doit
   * jamais provoquer dans le dos de l'utilisateur. Renvoie ce qu'elle a décidé, ce qui
   * rend le comportement observable.
   */
  const sauvegarderAuto = useCallback(async (active = true): Promise<DecisionSauvegarde> => {
    const api = (window as any).api;
    // Coupée : on ne construit même pas l'export, qui parcourt tout le graphe.
    if (!active) return "desactivee";
    const { json, encours } = buildExportData();
    const decision = decisionSauvegardeAuto({
      active,
      cheminFichier: currentFilePathRef.current,
      ecritureDirecte: !!api?.ecrireFichier,
      json,
      dernierJson: dernierJsonRef.current,
    });
    if (decision !== "a-ecrire") return decision;
    await api.ecrireFichier(currentFilePathRef.current, json);
    dernierJsonRef.current = json;
    // L'en-cours de localStorage suit : c'est lui qui est relu au démarrage.
    try {
      localStorage.setItem("attic-encours", JSON.stringify(encours));
    } catch {}
    return decision;
  }, [buildExportData]);

  /**
   * Mémorise le graphe tel qu'il est, dans l'en-cours relu au démarrage — sans fichier ni dialogue.
   *
   * C'EST LA CONDITION D'UN RECHARGEMENT SANS PERTE. L'en-cours n'était écrit qu'à l'enregistrement
   * manuel, ou par la sauvegarde automatique quand un fichier est ouvert : recharger la fenêtre
   * aurait donc rendu le graphe du dernier enregistrement, et perdu en silence tout ce qui a été
   * modifié depuis. Rien n'est écrit sur le disque ici, et aucun fichier courant n'est touché.
   */
  const memoriserEncours = useCallback((): boolean => {
    try {
      const { encours } = buildExportData();
      localStorage.setItem("attic-encours", JSON.stringify(encours));
      return true;
    } catch {
      return false;
    }
  }, [buildExportData]);

  const exporter = useCallback(() => sauvegarder(true), [sauvegarder]);

  const importer = useCallback(async (f?: File) => {
    let texte: string;
    let chemin: string | null = null;
    if (f) {
      texte = await f.text();
      const api = (window as any).api;
      if (api?.cheminFichier) {
        chemin = api.cheminFichier(f) || null;
      }
    } else if ((window as any).api) {
      const resultat = await (window as any).api.ouvrirFichier({
        defaultPath: o.repertoire || undefined,
        filters: [{ name: "Workflow Attic", extensions: ["json"] }],
      });
      if (!resultat) return;
      texte = resultat.contenu;
      chemin = resultat.chemin || null;
    } else {
      return;
    }
    console.log("[persistance] importer chemin=", chemin);
    o.setCurrentFilePath(chemin);
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
        // Les MÊMES gestionnaires que pour un nœud ajouté à la main : ce bloc en
        // portait une seconde écriture, et les deux avaient divergé. La copie
        // d'ici oubliait le `cacheExec.delete` des chargements de fichier — un
        // projet importé rejouait donc le résultat du fichier précédent depuis
        // le cache — n'empilait pas l'historique à la suppression d'un nœud, et
        // n'aurait pas reçu la cascade de réinitialisation ajoutée en face.
        // Un seul endroit, pour qu'aucune correction ne s'applique qu'à moitié.
        ...o.callbacksNoeud(),
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

  return { sauvegarder, sauvegarderAuto, exporter, importer, memoriserEncours };
}
