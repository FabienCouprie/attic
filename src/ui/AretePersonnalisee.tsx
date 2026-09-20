// ui/AretePersonnalisee.tsx — Arête visuelle personnalisée
import { BaseEdge, getSimpleBezierPath, type EdgeProps, useStore } from "@xyflow/react";
import { useStatut } from "./statuts";
import type { StatutNoeud } from "./flux-arete";
import { useCallback, useState } from "react";
import { registre } from "../audio/adaptateur";
import { validerArete } from "./validerGraphe";
import { areteEnFlux } from "./flux-arete";

function libellePort(node: any, handleId: string | null | undefined, kind: "source" | "target") {
  const ficheId = node?.data?.ficheId;
  if (!ficheId || !handleId) return undefined;
  const def = registre.trouverDef(ficheId);
  if (!def) return undefined;
  const idx = parseInt(handleId.split(":")[1] ?? "0", 10);
  if (kind === "source") return def.sorties[idx]?.nom;
  return def.entrees[idx]?.nom;
}

export function AretePersonnalisee({
  id, source, target, sourceHandleId, targetHandleId,
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSimpleBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });
  // Les deux statuts viennent du magasin d'exécution, plus du magasin de React Flow : l'état
  // d'exécution a quitté `node.data` pour que le poser ne coûte plus un passage sur tous les nœuds
  // (voir `statuts.ts`). La règle du flux, elle, ne change pas — elle lit toujours les deux
  // ensemble, ce qui est la raison d'être de `areteEnFlux`.
  const enFlux = areteEnFlux(useStatut(source).statut as StatutNoeud, useStatut(target).statut as StatutNoeud);
  const label = useStore(useCallback(
    (state: any) => {
      const src = state.nodeLookup.get(source);
      const tgt = state.nodeLookup.get(target);
      const srcNom = libellePort(src, sourceHandleId, "source");
      const tgtNom = libellePort(tgt, targetHandleId, "target");
      if (srcNom && tgtNom) return `${srcNom} → ${tgtNom}`;
      return "";
    },
    [source, target, sourceHandleId, targetHandleId]
  ));
  const isValid = useStore(useCallback(
    (state: any) => {
      const src = state.nodeLookup.get(source);
      const tgt = state.nodeLookup.get(target);
      return validerArete(src, tgt, { source, target, sourceHandle: sourceHandleId, targetHandle: targetHandleId } as any);
    },
    [source, target, sourceHandleId, targetHandleId]
  ));
  const [hover, setHover] = useState(false);
  const baseStyle = style ?? { stroke: "#999", strokeWidth: 2 };
  const edgeStyle = isValid ? baseStyle : { ...baseStyle, stroke: "#e44", strokeWidth: 2.5 };
  const dotColor = String(edgeStyle.stroke ?? "#999");
  return (
    <g onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <BaseEdge
        id={id}
        path={edgePath}
        style={edgeStyle}
        labelX={labelX}
        labelY={labelY}
        label={hover ? label : null}
        labelStyle={{ fill: "var(--text-primary)", fontSize: 11 }}
        labelShowBg
        labelBgStyle={{ fill: "var(--bg-surface)", stroke: "var(--border)", strokeWidth: 1 }}
        labelBgPadding={[5, 3]}
        labelBgBorderRadius={4}
      />
      {enFlux && (
        <circle r="3" fill={dotColor}>
          <animateMotion dur="1.2s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
    </g>
  );
}
