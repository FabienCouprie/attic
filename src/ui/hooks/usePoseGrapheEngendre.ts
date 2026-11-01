// ui/hooks/usePoseGrapheEngendre.ts — Poser sur le canevas le graphe qu'un composant a demandé.
//
// Sorti d'`App.tsx` le 2026-11-01, à l'identique : même plan, mêmes positions, mêmes avertissements.
// Le calcul du plan vit dans `ui/graphe-engendre.ts`, qui porte aussi son histoire ; ce crochet ne
// fait qu'en construire les objets et appeler les deux poseurs.
//
// LE PLAN SE CALCULE HORS DES POSEURS, et les deux updaters qui suivent ne font qu'ajouter. Créer
// les arêtes DANS l'updater de `setNodes` les posait deux fois sous `StrictMode`, qui appelle un
// updater deux fois pour débusquer exactement cet effet de bord.
//
// LES GESTIONNAIRES DE NŒUD SONT LUS PAR LEUR RÉFÉRENCE au moment de la pose, et non à la
// construction du crochet : `App.tsx` les définit après l'avoir appelé.
import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Edge } from "@xyflow/react";

import { defautCanoniqueChoix, defautParametre, type Langue } from "../../i18n";
import { premierLienCompatible } from "../dictee/pose-dictee";
import { planDeGrapheEngendre, type SpecGrapheEngendre } from "../graphe-engendre";
import { couleurArete, portsDeFiche, trouverDef } from "../ports-canevas";
import { registreUI } from "../registre-actif";
import { tailleDefaut } from "../tailles-noeuds";

export interface OptionsPoseGrapheEngendre {
  noeudsRef: MutableRefObject<any[]>;
  /** Les gestionnaires attachés au `data` de chaque nœud, définis une seule fois dans App. */
  callbacksNoeudRef: MutableRefObject<(() => Record<string, unknown>) | null>;
  setNodes: Dispatch<SetStateAction<any[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  lang: Langue;
}

export function usePoseGrapheEngendre({ noeudsRef, callbacksNoeudRef, setNodes, setEdges, lang }: OptionsPoseGrapheEngendre) {
  return useCallback((nodeId: string, spec: SpecGrapheEngendre) => {
    const baseX = noeudsRef.current.find((n) => n.id === nodeId)?.position?.x ?? 200;
    const baseY = noeudsRef.current.find((n) => n.id === nodeId)?.position?.y ?? 200;
    const cbs = callbacksNoeudRef.current?.() ?? {};
    const plan = planDeGrapheEngendre(spec, noeudsRef.current, `${nodeId}-${Date.now()}`,
      (s, c) => premierLienCompatible(portsDeFiche(s), portsDeFiche(c),
        (a, b) => registreUI().fluxCompatibles(a.type, b.type, a.sousType, b.sousType)));
    for (const c of plan.cycles) {
      console.warn(`[attic] Prompt → graphe : arête ${c.source} → ${c.target} écartée, elle refermerait un cycle.`);
    }
    // LE MÊME SORT QU'UN CYCLE, ET POUR LA MÊME RAISON : un modèle de langue peut demander un
    // lien que les ports refusent. L'arête est écartée plutôt que posée en rouge, et le nom des
    // deux composants est dit — le reste du graphe reste utilisable.
    for (const x of plan.incompatibles) {
      console.warn(`[attic] Prompt → graphe : arête écartée, « ${spec.nodes[x.source]?.ficheId} » `
        + `et « ${spec.nodes[x.target]?.ficheId} » n'ont aucun couple de ports qui s'accorde.`);
    }
    const idsNouveaux: string[] = plan.ids;
    const nouveauxNodes = spec.nodes.map((specNode, i) => {
      const def = trouverDef(specNode.ficheId);
      const { width, height } = def ? tailleDefaut(def) : { width: 230, height: 200 };
      const parametres: Record<string, number | string> = {};
      if (def) for (const p of def.parametres) {
        // Tout paramètre « choix » passe par la forme canonique (indépendante de la langue), y
        // compris SANS optionIds : la valeur stockée doit correspondre à l'`<option value>` du
        // menu, qui reste le terme français. Restreindre ce traitement aux seuls optionIds créait,
        // en anglais, des nœuds dont le paramètre valait par ex. "Center" — absent du menu (donc
        // affiché comme « Left ») et refusé par l'exécution.
        parametres[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p) : defautParametre(p, lang);
      }
      return {
        id: idsNouveaux[i], type: "atelier" as const,
        position: { x: baseX + 250 + i * 260, y: baseY + 40 },
        width, height,
        data: {
          ficheId: specNode.ficheId, parametres, statut: "attente",
          ...cbs,
        },
      };
    });
    const nouveauxEdges: Edge[] = plan.aretes.map(({ sortie, entree, ...a }) => ({
      ...a,
      sourceHandle: `out:${sortie}`,
      targetHandle: `in:${entree}`,
      type: "arete-personnalisee" as const,
      style: { stroke: couleurArete(nouveauxNodes, a.source, `out:${sortie}`), strokeWidth: 2.5 },
    }));
    setNodes((nds) => [...nds, ...nouveauxNodes]);
    setEdges((eds) => [...eds, ...nouveauxEdges]);
  }, [noeudsRef, callbacksNoeudRef, setNodes, setEdges, lang]);
}
