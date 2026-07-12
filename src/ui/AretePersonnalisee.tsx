// ui/AretePersonnalisee.tsx — Arête visuelle personnalisée
import { BaseEdge, getSimpleBezierPath, type EdgeProps } from "@xyflow/react";

export function AretePersonnalisee({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style,
}: EdgeProps) {
  const [edgePath] = getSimpleBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return <BaseEdge id={id} path={edgePath} style={style ?? { stroke: "#999", strokeWidth: 2 }} />;
}
