import { INTERACTION_POINTS, dynamicInteractions, type InteractionId, type InteractionPoint } from "./world";

/** Ponto de interação atualmente ao alcance, se houver. */
export function findNearbyInteraction(
  px: number,
  pz: number
): InteractionPoint | null {
  let best: InteractionPoint | null = null;
  let bestDist = Infinity;

  // Pontos estáticos
  for (const p of INTERACTION_POINTS) {
    const dx = px - p.x;
    const dz = pz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= p.radius && dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }

  // Pontos dinâmicos
  for (const p of dynamicInteractions) {
    const dx = px - p.x;
    const dz = pz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= p.radius && dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }

  return best;
}

export type { InteractionId };
