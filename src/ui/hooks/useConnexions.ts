// ui/hooks/useConnexions.ts — Poser une arête à la souris : ce qui est permis au survol, et ce qui se
// pose au relâchement.
//
// Sorti d'`App.tsx` le 2026-11-01, à l'identique : même traduction par les bulles, même refus d'un
// cycle aux deux endroits, même remplacement d'une connexion sur un port non dynamique, même
// couleur. Une dépendance a changé de nom sans changer de valeur : `isValidConnection` se refaisait
// avec `nomDeNoeud`, qui ne dépendait que de la langue ; il se refait avec la langue.
import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Connection, Edge, OnConnect } from "@xyflow/react";

import { estSubstitution, fermeraitUnCycle, traduireConnexion, type AreteG, type NoeudG } from "../../core";
import type { Langue } from "../../i18n";
import { couleurArete, trouverDef } from "../ports-canevas";
import { validerArete } from "../validerGraphe";

export interface OptionsConnexions {
  noeudsRef: MutableRefObject<any[]>;
  aretesRef: MutableRefObject<Edge[]>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  pushHistorique: () => void;
  lang: Langue;
}

export function useConnexions({ noeudsRef, aretesRef, setEdges, pushHistorique, lang }: OptionsConnexions) {
  const isValidConnection = useCallback((conn: Connection | Edge) => {
    // La validité se juge sur la connexion TRADUITE : sur une poignée de bulle, ce sont les types du
    // port réel qui comptent, jamais ceux d'un port de façade.
    const traduite = traduireConnexion(
      noeudsRef.current as unknown as NoeudG[], aretesRef.current as unknown as AreteG[],
      conn as any, trouverDef,
    );
    if (!traduite) return false;
    // AUCUNE ARÊTE NE SE POSE SANS QUE LE CYCLE SOIT CHERCHÉ. Le moteur n'exécute qu'un graphe
    // acyclique : un cycle n'a pas d'ordre topologique, et les nœuds qu'il contient ne seraient
    // jamais lancés — sans erreur, sans message, une branche entière qui ne calcule rien. Le refus
    // se fait ici, où il ne coûte rien à personne : la connexion ne se dépose simplement pas.
    //
    // SUR LES ARÊTES RÉELLES, ET NON SUR LES SUBSTITUTIONS. Une bulle repliée porte des arêtes de
    // remplacement qui ramènent à elle celles de ses membres : deux membres sans rapport y
    // paraissent reliés par elle, et une arête licite se ferait refuser. Les vraies arêtes sont
    // gardées sous ces substituts, seulement cachées, et ce sont elles qui disent la topologie.
    const reelles = (aretesRef.current as unknown as AreteG[]).filter((a) => !estSubstitution(a));
    if (fermeraitUnCycle(traduite.source, traduite.target, reelles)) return false;
    const source = noeudsRef.current.find((n) => n.id === traduite.source);
    const target = noeudsRef.current.find((n) => n.id === traduite.target);
    return validerArete(source, target, { ...conn, ...traduite });
  }, [lang]);

  const onConnect: OnConnect = useCallback((connBrute) => {
    if (!connBrute.sourceHandle || !connBrute.targetHandle) return;
    // UNE POIGNÉE DE BULLE EST CONNECTABLE, et la vraie arête va au membre qu'elle représente : c'est
    // lui qui calcule. Traduite d'abord, la connexion suit ensuite le chemin ordinaire — même
    // remplacement d'un port non dynamique, même couleur, même historique. Refusée si la poignée ne
    // désigne rien, plutôt que devinée.
    const traduite = traduireConnexion(
      noeudsRef.current as unknown as NoeudG[], aretesRef.current as unknown as AreteG[],
      connBrute as any, trouverDef,
    );
    if (!traduite) return;
    const conn = { ...connBrute, ...traduite };
    const ficheSource = noeudsRef.current.find((n) => n.id === conn.source)?.data.ficheId;
    const ficheTarget = noeudsRef.current.find((n) => n.id === conn.target)?.data.ficheId;
    if (ficheSource === "comment" || ficheTarget === "comment") return;
    // LE MÊME REFUS QU'AU SURVOL, ET CE N'EST PAS UN DOUBLON. `isValidConnection` garde le geste à
    // la souris ; celui-ci garde la pose elle-même, quel que soit le chemin qui y mène. Une seule
    // arête qui referme un cycle suffit à rendre muette une branche entière.
    if (fermeraitUnCycle(conn.source, conn.target,
      (aretesRef.current as unknown as AreteG[]).filter((a) => !estSubstitution(a)))) {
      console.warn(`[attic] Arête refusée : ${conn.source} → ${conn.target} refermerait un cycle.`);
      return;
    }
    pushHistorique();
    const defT = trouverDef(noeudsRef.current.find((n) => n.id === conn.target)?.data.ficheId ?? "");
    const ti = parseInt(conn.targetHandle.split(":")[1]);
    const portTarget = defT?.entrees[ti];
    const c = couleurArete(noeudsRef.current, conn.source, conn.sourceHandle);
    setEdges((eds) => {
      // Remplacer une connexion existante sur un port d'entrée non dynamique.
      const nettoyees = portTarget && !portTarget.dynamique
        ? eds.filter((e) => !(e.target === conn.target && e.targetHandle === conn.targetHandle))
        : eds;
      return [...nettoyees, { ...conn, id: `e-${conn.source}-${conn.target}-${Date.now()}`, type: "arete-personnalisee", style: { stroke: c, strokeWidth: 2.5 } }];
    });
  }, [setEdges, pushHistorique]);

  return { isValidConnection, onConnect };
}
