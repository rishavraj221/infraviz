import { Position, type InternalNode } from "@xyflow/react";

// Adapted from xyflow's official "floating edges" pattern: instead of every
// edge leaving a node from one fixed handle (which is what was causing
// multiple edges to stack on the same dot), each edge computes exactly where
// the straight line between the two node centers crosses each node's actual
// rectangle — so every edge gets its own point on the boundary, angled
// toward its real target.

function getNodeIntersection(intersectionNode: InternalNode, targetNode: InternalNode) {
  const { width: iw = 0, height: ih = 0 } = intersectionNode.measured ?? {};
  const { width: tw = 0, height: th = 0 } = targetNode.measured ?? {};
  const intersectionPos = intersectionNode.internals.positionAbsolute;
  const targetPos = targetNode.internals.positionAbsolute;

  const w = iw / 2;
  const h = ih / 2;

  const x2 = intersectionPos.x + w;
  const y2 = intersectionPos.y + h;
  const x1 = targetPos.x + tw / 2;
  const y1 = targetPos.y + th / 2;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;

  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 };
}

function getEdgePosition(node: InternalNode, intersectionPoint: { x: number; y: number }) {
  const { x: nx, y: ny } = node.internals.positionAbsolute;
  const { width: w = 0, height: h = 0 } = node.measured ?? {};
  const px = Math.round(intersectionPoint.x);
  const py = Math.round(intersectionPoint.y);

  if (px <= Math.round(nx) + 1) return Position.Left;
  if (px >= Math.round(nx + w) - 1) return Position.Right;
  if (py <= Math.round(ny) + 1) return Position.Top;
  if (py >= Math.round(ny + h) - 1) return Position.Bottom;
  return Position.Top;
}

export function getEdgeParams(source: InternalNode, target: InternalNode) {
  const sourceIntersection = getNodeIntersection(source, target);
  const targetIntersection = getNodeIntersection(target, source);

  const sourcePos = getEdgePosition(source, sourceIntersection);
  const targetPos = getEdgePosition(target, targetIntersection);

  return {
    sx: sourceIntersection.x,
    sy: sourceIntersection.y,
    tx: targetIntersection.x,
    ty: targetIntersection.y,
    sourcePos,
    targetPos,
  };
}
