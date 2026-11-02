// ui/AretePersonnalisee.tsx — Arête visuelle personnalisée
import { BaseEdge, getSimpleBezierPath, type EdgeProps, useStore } from "@xyflow/react";
import { useStatut } from "./statuts";
import type { StatutNoeud } from "./flux-arete";
import { useCallback, useState } from "react";

import { validerArete } from "./validerGraphe";
import { areteEnFlux } from "./flux-arete";
import { registreUI } from "./registre-actif";

function libellePort(node: any, handleId: string | null | undefined, kind: "source" | "target") {
  const ficheId = node?.data?.ficheId;
  if (!ficheId || !handleId) return undefined;
  const def = registreUI().trouverDef(ficheId);
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
      {/* Le flux se montre de deux façons, et le thème choisit laquelle dans `atelier.css` : la
          boule qui court sur le lien, ou le filé, un trait de lumière qui glisse avec sa traînée.
          `pathLength` ramène toute arête à cent unités, si bien que le même pointillé fait la même
          traînée sur un câble court et sur un long. */}
      {enFlux && (
        <>
          <circle className="attic-arete-boule" r="3" fill={dotColor}>
            <animateMotion dur="1.2s" repeatCount="indefinite" path={edgePath} />
          </circle>
          <path className="attic-arete-file-trainee" d={edgePath} pathLength={100} style={{ stroke: dotColor }} />
          <path className="attic-arete-file-tete" d={edgePath} pathLength={100} style={{ stroke: dotColor, color: dotColor }} />
        </>
      )}
    </g>
  );
}
