// ui/InspecteurDuCanevas.tsx — L'inspecteur relié au canevas : le nœud sélectionné, ses ports
// branchés, et ce que ses boutons font au graphe.
//
// Sorti d'`App.tsx` le 2026-11-01, à l'identique : mêmes calculs, mêmes gestionnaires. L'inspecteur
// lui-même (`Inspector.tsx`) reste générique ; ce qui demande de connaître le domaine ou le graphe
// est calculé ici.
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Edge } from "@xyflow/react";

import { Inspector } from "./Inspector";
import type { NoeudAtelier } from "./noeud-atelier";
import { PanneauInspecteur } from "./PanneauInspecteur";
import { trouverDef } from "./ports-canevas";

export interface PropsInspecteurDuCanevas {
  nodes: NoeudAtelier[];
  edges: Edge[];
  sel: NoeudAtelier | null;
  setSel: Dispatch<SetStateAction<NoeudAtelier | null>>;
  setNodes: Dispatch<SetStateAction<NoeudAtelier[]>>;
  cacheExec: MutableRefObject<Map<string, any>>;
  changerReglage: (nid: string, nom: string, val: number | string) => Record<string, number | string> | null;
  pushHistorique: () => void;
  supprimerNoeud: (id: string) => void;
  reinitialiserNoeud: (id: string) => void;
}

export function InspecteurDuCanevas({
  nodes, edges, sel, setSel, setNodes, cacheExec, changerReglage, pushHistorique, supprimerNoeud, reinitialiserNoeud,
}: PropsInspecteurDuCanevas) {
  return (
    <PanneauInspecteur>
      <Inspector
        noeud={nodes.find((n) => n.id === sel?.id) ?? null}
        def={sel ? trouverDef(sel.data.ficheId) : undefined}
        // Calculé ici et non dans l'inspecteur : retrouver quels ports sont de type courbe demande
        // de connaître le domaine, et l'inspecteur doit rester générique. Chaque port de modulation
        // nomme sa cible ; on ne garde que celles dont le port est effectivement branché — un
        // réglage n'est « piloté » que quand une courbe y arrive vraiment.
        parametresModules={(() => {
          if (!sel) return [];
          const d = trouverDef(sel.data.ficheId);
          if (!d) return [];
          return d.entrees.flatMap((port, rang) =>
            port.module
            && edges.some((a) => a.target === sel.id && (a.targetHandle ?? `in:${rang}`) === `in:${rang}`)
              ? [port.module] : []);
        })()}
        portsBranches={sel ? edges.filter((a) => a.target === sel.id)
          .map((a) => parseInt(String(a.targetHandle ?? "in:0").split(":")[1], 10)).filter(Number.isFinite) : []}
        onChangerParametre={(nom, val) => {
          if (!sel) return;
          // LE MÊME CHEMIN QUE DEPUIS LE NŒUD, et c'est tout ce qui reste ici : l'inspecteur n'a
          // plus à refaire la règle, seulement à se remettre à jour sur ce qu'elle a produit.
          const suite = changerReglage(sel.id, nom, val);
          if (suite) setSel((prev) => (prev ? { ...prev, data: { ...prev.data, parametres: suite } } : null));
        }}
        onChargerFichier={(key, fichier) => {
          if (!sel) return;
          setNodes((nds) => nds.map((n) => n.id === sel.id ? { ...n, data: { ...n.data, [key]: fichier, audioNom: fichier.name } } : n));
        }}
        onSupprimer={() => {
          if (sel) {
            pushHistorique();
            supprimerNoeud(sel.id);
          }
        }}
        onReinitialiser={() => {
          if (sel) reinitialiserNoeud(sel.id);
        }}
        onEnregistrer={(id, blob) => {
          const url = URL.createObjectURL(blob);
          setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, enregistrementBlob: blob, enregistrementUrl: url } } : n));
        }}
        onEnregistrerMidi={(id, fichier) => {
          // Même contrat que onChargerMidi (AtelierNode) : vider le cache
          // AVANT de poser le nouveau fichier, sinon un ré-enregistrement
          // sans toucher aucun paramètre rejoue le résultat de la prise
          // précédente (empreinteParametres/empreinteEntrees ne voient pas
          // midiFichier, qui n'est pas dans `parametres`).
          cacheExec.current.delete(id);
          setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, midiFichier: fichier, midiNom: fichier.name } } : n));
        }}
      />
    </PanneauInspecteur>
  );
}
