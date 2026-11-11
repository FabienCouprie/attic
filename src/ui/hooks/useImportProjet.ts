// ui/hooks/useImportProjet.ts — L'import d'un projet : du fichier lu au graphe posé, et au rapport de ce
// qui s'est perdu en chemin.
//
// SORTI DE `ui/hooks/usePersistance.ts` le 2026-11-09, troisième pièce de son découpage (lot 2 de la
// revue d'architecture du 2026-10-31). C'est le bloc d'`importer`, recopié ligne pour ligne, dans
// l'ordre exact de ses effets : le fichier courant posé avant l'analyse, les métas enregistrés avant
// les nœuds, le rechargement des fichiers avant les réglages du domaine, le graphe posé avant le
// rapport. Le crochet l'appelle à la place exacte du bloc : l'ordre des crochets de React ne change
// donc pas, et `importer` change d'identité à chaque rendu, comme avant.
//
// IL NE PARTAGE RIEN AVEC LA SAUVEGARDE, que l'objet des options et la traduction `t`, que le
// crochet lui prête au lieu d'en demander une seconde au contexte.
import { useCallback } from "react";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import type { Edge, Viewport } from "@xyflow/react";
import {
  enregistrerMeta,
  FORMAT_PROJET, versionDuProjet, perteAuChargementVide, rienDePerduAuChargement, rapportDuChargement,
  type MetaComposant, type PerteAuChargement,
} from "../../core";
import { servicesDomaine } from "../../core/services-domaine";
import { registreUI } from "../registre-actif";
import { pertesDesNoeuds, traduireNomsHerites } from "../pertes-chargement";
import { rechargerFichiersPersistes } from "../rechargerFichiers";
import { filtrerAretesInvalides } from "../validerGraphe";
import { idsDe, oublierNoeuds } from "../oubli-noeuds";

// Le même typage souple que `usePersistance`, d'où ce code vient : il manipulait déjà tout en `any`.
type NoeudAtelier = any;
type GrapheRacine = { nodes: NoeudAtelier[]; edges: Edge[] } | null;

/** Ce que l'import lit et écrit de l'atelier : les dix options de `usePersistance` qu'il emploie. */
export interface OptionsImportProjet {
  setNodes: Dispatch<SetStateAction<NoeudAtelier[]>>;
  setEdges: Dispatch<SetStateAction<NoeudAtelier[]>>;
  rfInstance: any;
  repertoire: string;
  grapheRacineRef: MutableRefObject<GrapheRacine>;
  setPile: (p: { metaId: string; nom: string; nomEn?: string }[]) => void;
  /** Où l'import dépose la vue du fichier, pour le recadrage que sa remise à zéro de la pile déclenche. */
  vueAPoserRef: MutableRefObject<Viewport | null>;
  /** Gestionnaires attachés au `data` de chaque nœud — définis une seule fois, dans App. */
  callbacksNoeud: () => Record<string, unknown>;
  cacheExec: MutableRefObject<Map<string, any>>;
  setCurrentFilePath: (path: string | null) => void;
}

export function useImportProjet(o: OptionsImportProjet, t: (cle: string) => string) {
  // `cadrer` : la vue que le fichier porte est ignorée, et le projet ouvert est cadré. C'est ce que
  // demande l'ouverture d'un exemple livré, décidé par Fabien le 2026-11-09 : un exemple s'ouvre sur
  // n'importe quelle fenêtre, et seize des vingt portaient une vue que personne n'avait jamais vue,
  // sous laquelle sept s'ouvraient sur un canevas presque vide.
  const importer = useCallback(async (f?: File, ouverture: { cadrer?: boolean } = {}) => {
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
    // LA VUE DU FICHIER EST DÉPOSÉE AVANT : cette remise à zéro déclenche le recadrage d'`App.tsx`,
    // qui écrasait la vue posée plus bas. Il la pose désormais au lieu de cadrer ; sans vue, ou pour
    // un exemple, il cadre.
    o.vueAPoserRef.current = ouverture.cadrer ? null : json.viewport ?? null;
    o.setPile([]);
    o.grapheRacineRef.current = null;
    const nodesLus = (json.nodes || []).map((n: any) => ({
      ...n,
      data: {
        ...n.data,
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

    // Recharger les fichiers persistés (Electron) : le File n'est pas sérialisable, mais le chemin
    // est sauvé dans « Chemin ». Les nœuds rechargés sont rendus : voir `ui/rechargerFichiers.ts`.
    const importedNodes = await rechargerFichiersPersistes(nodesLus);

    // ═══ CE QUE LE CHARGEMENT A PERDU SE DIT, au lieu de n'être qu'un `console.warn` ═══
    //
    // RELEVÉ PAR UNE REVUE DU DÉPÔT : « Toutes les pertes au chargement ne laissent qu'un
    // console.warn : fiche inconnue, arête rejetée, fichier introuvable sur une autre machine. »
    // Vérifié, et vrai — et une ligne de console n'est lue par personne, d'autant moins sous
    // Windows où celle du processus principal d'Electron n'apparaît pas.
    const perte: PerteAuChargement = perteAuChargementVide();
    const versionLue = versionDuProjet(json);
    if (versionLue > FORMAT_PROJET) perte.formatFutur = versionLue;
    // LES RÉGLAGES DE DOMAINE DU FICHIER DEVIENNENT CEUX DE LA SÉANCE. Côté audio, sa fréquence de
    // travail : un fichier qui n'en déclare pas vaut 44 100 Hz — ce que ses générateurs écrivaient
    // en dur —, et c'est pourquoi ouvrir un ancien projet ne change rien à ce qu'il rend.
    servicesDomaine().appliquerReglagesDeProjet(json as Record<string, unknown>);
    // LE CALCUL VIT DANS `ui/pertes-chargement.ts`, où il s'éprouve : c'est lui qui peut se tromper,
    // trois exemptions valant trois occasions de déclarer perdu ce qui ne l'est pas.
    // ET LA TRADUCTION PASSE AVANT LE RAPPORT : un réglage renommé que la fiche sait retrouver
    // n'est plus une perte, et l'annoncer comme telle enverrait chercher ce qui vient de revenir.
    traduireNomsHerites(importedNodes, (ficheId) => registreUI().trouverDef(ficheId));
    const { fiches, reglages } = pertesDesNoeuds(
      importedNodes,
      (ficheId) => registreUI().trouverDef(ficheId),
      new Set((json.metas || []).map((m: any) => String(m?.id ?? ""))),
    );
    perte.fiches.push(...fiches);
    perte.reglages.push(...reglages);
    const aretesValides = filtrerAretesInvalides(importedNodes, json.edges || [], perte.aretes);
    o.setNodes(importedNodes);
    o.setEdges(aretesValides);
    o.cacheExec.current.clear();
    // LE GRAPHE D'AVANT EST ABANDONNÉ, DONC SES RÉSULTATS AUSSI. Les résultats et les statuts
    // vivent hors du tableau des nœuds ; les laisser en place donnerait au graphe importé, dont
    // les identifiants repartent de « noeud-1 », ce que le précédent avait produit. La pile et le
    // graphe racine viennent d'être remis à zéro : seuls les nœuds importés vivent encore.
    // Voir `ui/oubli-noeuds.ts`.
    oublierNoeuds(idsDe(importedNodes));
    if (json.viewport && o.rfInstance && !ouverture.cadrer) o.rfInstance.setViewport(json.viewport);

    // LE RAPPORT PARAÎT APRÈS QUE LE GRAPHE EST POSÉ, et non avant : ce qui s'est ouvert est à
    // l'écran derrière le message, et l'on peut donc rapprocher les deux.
    if (!rienDePerduAuChargement(perte)) {
      const detail = rapportDuChargement(perte, {
        format: (v) => t("chargement.formatFutur").replace("{v}", String(v)).replace("{n}", String(FORMAT_PROJET)),
        fiches: (n) => t("chargement.fichesInconnues").replace("{nb}", String(n)),
        reglages: (n) => t("chargement.reglagesPerdus").replace("{nb}", String(n)),
        aretes: (n) => t("chargement.aretesRejetees").replace("{nb}", String(n)),
      });
      console.warn(`[attic] chargement : pertes\n${detail}`);
      if (typeof alert !== "undefined") alert(`${t("chargement.titre")}\n\n${detail}`);
    }
  }, [o]);

  return importer;
}
