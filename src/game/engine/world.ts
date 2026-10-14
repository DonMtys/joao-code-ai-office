/**
 * Descrição "lógica" do cenário: usada pela física simples do jogador,
 * pela colisão da câmera e pelo sistema de interação por proximidade.
 * A parte visual correspondente é montada em level.ts.
 *
 * Sistema de coordenadas do PlayCanvas: Y para cima, "frente" = -Z.
 */

/** Caixa de colisão no plano XZ (paredes, móveis). */
export interface WallAABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
}

// Sala de estudos: 12 x 10 (menor e mais aconchegante que o galpão de testes)
export const ROOM_HALF_X = 6;
export const ROOM_HALF_Z = 5;
export const WALL_HEIGHT = 3;
export const WALL_THICKNESS = 0.5;
export const CEILING_Y = WALL_HEIGHT;

export const SPAWN = { x: 0, y: 0, z: 3 };

/** Raio do "corpo" do personagem para colisão horizontal. */
export const PLAYER_RADIUS = 0.4;

/** Altura máxima de degrau que o personagem sobe sem ser bloqueado. */
export const STEP_LIMIT = 0.25;

export const GRAVITY = -22;
export const WALK_SPEED = 3.6;
export const RUN_SPEED = 6.8;

// A sala tem piso plano — nenhuma rampa/plataforma nesta versão.
export function groundHeightAt(x: number, z: number, currentY = 0): number {
  // Escada e patamar
  if (x >= 0.4 && x <= 2.4) {
    if (z >= 7.0 && z <= 15.0) {
      return (3.0 * (15.0 - z)) / 8.0;
    }
    if (z >= 5.0 && z < 7.0) {
      return 3.0; // Patamar superior
    }
  }

  // Se o jogador estiver acima de 1.5, consideramos que ele está no primeiro andar
  if (currentY > 1.5) {
    if (
      // Direito Administrativo
      (x >= -6.0 && x <= 6.0 && z >= -5.0 && z <= 5.0) ||
      // Direito Constitucional
      (x >= -4.0 && x <= 2.8 && z >= 5.0 && z <= 15.0) ||
      // Gestão de Materiais
      (x >= 5.2 && x <= 12.0 && z >= 5.0 && z <= 15.0) ||
      // Arena de Simulados
      (x >= -2.0 && x <= 10.0 && z >= 15.0 && z <= 27.0) ||
      // Corredor central + landing
      (x >= 0.4 && x <= 5.2 && z >= 5.0 && z <= 15.0)
    ) {
      return 3.0;
    }
  }

  // Térreo por padrão
  return 0.0;
}

// ---- Móveis (colisão horizontal, cheios até o teto para o raycast da câmera) ----
export const DESK = { minX: -5.3, maxX: -3.3, minZ: -4.6, maxZ: -3.7, height: 0.78 };
export const CHAIR = { minX: -4.6, maxX: -3.9, minZ: -3.5, maxZ: -2.9, height: 0.85 };
export const BOOKSHELF = { minX: 4.3, maxX: 5.6, minZ: -4.7, maxZ: -3.9, height: 2.3 };
// quadro de missões: fino, encostado na parede (não atrapalha o caminho)
export const MISSION_BOARD = { minX: -1.1, maxX: 1.1, minZ: -5.15, maxZ: -4.85, height: 1.6 };
// porta de saída: decorativa, embutida na parede sul
export const DOOR = { minX: 3.4, maxX: 4.6, minZ: 4.75, maxZ: 5.25, height: 2.2 };

/** Paredes externas + móveis, como AABBs de colisão horizontal (bloqueiam sempre). */
export const WALLS: WallAABB[] = [
  // --- PAREDES COMPARTILHADAS QUE VÃO DO CHÃO ATÉ O TETO DO 1º ANDAR (y: 0 a 6) ---
  // Arquivologia / Direito Adm (Norte)
  { minX: -ROOM_HALF_X, maxX: ROOM_HALF_X, minZ: -ROOM_HALF_Z - WALL_THICKNESS, maxZ: -ROOM_HALF_Z + WALL_THICKNESS, minY: 0, maxY: 6 },
  { minX: -ROOM_HALF_X, maxX: 3.4, minZ: ROOM_HALF_Z - WALL_THICKNESS, maxZ: ROOM_HALF_Z + WALL_THICKNESS, minY: 0, maxY: 6 },
  { minX: 4.6, maxX: ROOM_HALF_X, minZ: ROOM_HALF_Z - WALL_THICKNESS, maxZ: ROOM_HALF_Z + WALL_THICKNESS, minY: 0, maxY: 6 },
  { minX: -ROOM_HALF_X - WALL_THICKNESS, maxX: -ROOM_HALF_X + WALL_THICKNESS, minZ: -ROOM_HALF_Z, maxZ: ROOM_HALF_Z, minY: 0, maxY: 6 },
  { minX: ROOM_HALF_X - WALL_THICKNESS, maxX: ROOM_HALF_X + WALL_THICKNESS, minZ: -ROOM_HALF_Z, maxZ: ROOM_HALF_Z, minY: 0, maxY: 6 },

  // Português / Direito Const (Oeste)
  { minX: -3.2 - WALL_THICKNESS, maxX: -3.2 + WALL_THICKNESS, minZ: 5.0, maxZ: 15.0, minY: 0, maxY: 6 },
  { minX: -3.2, maxX: 2.8, minZ: 5.0 - WALL_THICKNESS, maxZ: 5.0 + WALL_THICKNESS, minY: 0, maxY: 6 },
  { minX: -3.2, maxX: 2.8, minZ: 15.0 - WALL_THICKNESS, maxZ: 15.0 + WALL_THICKNESS, minY: 0, maxY: 6 },

  // Assistência Social / Gestão de Mat (Leste)
  { minX: 11.2 - WALL_THICKNESS, maxX: 11.2 + WALL_THICKNESS, minZ: 5.0, maxZ: 15.0, minY: 0, maxY: 6 },
  { minX: 5.2, maxX: 11.2, minZ: 5.0 - WALL_THICKNESS, maxZ: 5.0 + WALL_THICKNESS, minY: 0, maxY: 6 },
  { minX: 5.2, maxX: 11.2, minZ: 15.0 - WALL_THICKNESS, maxZ: 15.0 + WALL_THICKNESS, minY: 0, maxY: 6 },
  // Parede leste do corredor (compartilhada)
  { minX: 5.1, maxX: 5.3, minZ: 5.0, maxZ: 9.4, minY: 0, maxY: 6 },
  { minX: 5.1, maxX: 5.3, minZ: 10.6, maxZ: 15.0, minY: 0, maxY: 6 },

  // Cinema Aulão / Arena de Simulados (Sul)
  { minX: -2.0, maxX: 3.4, minZ: 15.0 - WALL_THICKNESS, maxZ: 15.0 + WALL_THICKNESS, minY: 0, maxY: 6 },
  { minX: 4.6, maxX: 10.0, minZ: 15.0 - WALL_THICKNESS, maxZ: 15.0 + WALL_THICKNESS, minY: 0, maxY: 6 },
  { minX: -2.0, maxX: 10.0, minZ: 27.0 - WALL_THICKNESS, maxZ: 27.0 + WALL_THICKNESS, minY: 0, maxY: 6 },
  { minX: -2.0 - WALL_THICKNESS, maxX: -2.0 + WALL_THICKNESS, minZ: 15.0, maxZ: 27.0, minY: 0, maxY: 6 },
  { minX: 10.0 - WALL_THICKNESS, maxX: 10.0 + WALL_THICKNESS, minZ: 15.0, maxZ: 27.0, minY: 0, maxY: 6 },

  // --- PAREDES ESPECÍFICAS DE CADA ANDAR ---
  // Parede oeste do corredor (compartilhada com Português no Térreo, aberta de 13 a 15)
  { minX: 2.7, maxX: 2.9, minZ: 5.0, maxZ: 9.4, minY: 0, maxY: 3 },
  { minX: 2.7, maxX: 2.9, minZ: 10.6, maxZ: 13.0, minY: 0, maxY: 3 },

  // Parede oeste do corredor (compartilhada com Direito Const no 1º Andar, aberta de 5 a 7)
  { minX: 2.7, maxX: 2.9, minZ: 7.0, maxZ: 9.4, minY: 3, maxY: 6 },
  { minX: 2.7, maxX: 2.9, minZ: 10.6, maxZ: 15.0, minY: 3, maxY: 6 },

  // Guarda-corpo da escada (proteção na lateral leste da escada)
  { minX: 2.4, maxX: 2.6, minZ: 7.0, maxZ: 15.0, minY: 0, maxY: 6 },

  // --- MÓVEIS E ELEMENTOS DE CENA COM COLISÃO ---
  // Térreo (Arquivologia)
  { minX: DESK.minX, maxX: DESK.maxX, minZ: DESK.minZ, maxZ: DESK.maxZ, minY: 0, maxY: 0.8 },
  { minX: CHAIR.minX, maxX: CHAIR.maxX, minZ: CHAIR.minZ, maxZ: CHAIR.maxZ, minY: 0, maxY: 0.9 },
  { minX: BOOKSHELF.minX, maxX: BOOKSHELF.maxX, minZ: BOOKSHELF.minZ, maxZ: BOOKSHELF.maxZ, minY: 0, maxY: 2.3 },
  
  // Térreo (Cinema Aulão)
  { minX: -2.0, maxX: 10.0, minZ: 24.0, maxZ: 26.8, minY: 0, maxY: 0.3 }, // Palco
  { minX: 0.0, maxX: 2.8, minZ: 17.5, maxZ: 22.5, minY: 0, maxY: 0.85 },  // Cadeiras esq
  { minX: 5.2, maxX: 8.0, minZ: 17.5, maxZ: 22.5, minY: 0, maxY: 0.85 },  // Cadeiras dir
];

/** Empurra um círculo (jogador) para fora de uma AABB no plano XZ. */
export function pushCircleOutOfAABB(
  px: number,
  pz: number,
  radius: number,
  box: WallAABB
): { x: number; z: number } {
  const cx = Math.max(box.minX, Math.min(px, box.maxX));
  const cz = Math.max(box.minZ, Math.min(pz, box.maxZ));
  const dx = px - cx;
  const dz = pz - cz;
  const distSq = dx * dx + dz * dz;
  if (distSq >= radius * radius) return { x: px, z: pz };

  if (distSq > 1e-9) {
    const dist = Math.sqrt(distSq);
    const push = (radius - dist) / dist;
    return { x: px + dx * push, z: pz + dz * push };
  }

  const left = px - (box.minX - radius);
  const right = box.maxX + radius - px;
  const back = pz - (box.minZ - radius);
  const front = box.maxZ + radius - pz;
  const m = Math.min(left, right, back, front);
  if (m === left) return { x: box.minX - radius, z: pz };
  if (m === right) return { x: box.maxX + radius, z: pz };
  if (m === back) return { x: px, z: box.minZ - radius };
  return { x: px, z: box.maxZ + radius };
}

// ------------------------------------------------------------------
// Obstáculos 3D e raycast — usados pela câmera para não atravessar
// paredes e móveis.
// ------------------------------------------------------------------

export interface Box3 {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

export const CAMERA_OBSTACLES: Box3[] = [
  // Mapeamos todas as paredes estáticas do prédio para obstáculo de câmera
  ...WALLS.map((w) => ({
    minX: w.minX,
    maxX: w.maxX,
    minY: w.minY !== undefined ? w.minY : 0.0,
    maxY: w.maxY !== undefined ? w.maxY : WALL_HEIGHT,
    minZ: w.minZ,
    maxZ: w.maxZ,
  })),
];

/**
 * Raio × AABB (método dos "slabs").
 * Retorna a menor distância t > 0 até a caixa, ou Infinity se não acerta.
 */
export function rayBoxDistance(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  b: Box3
): number {
  let tMin = 0;
  let tMax = Infinity;

  const axes: Array<[number, number, number, number]> = [
    [ox, dx, b.minX, b.maxX],
    [oy, dy, b.minY, b.maxY],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return Infinity;
    }
  }
  return tMin > 0 ? tMin : Infinity;
}

/** Menor distância do ponto de origem até qualquer obstáculo, na direção dada. */
export function nearestObstacleDistance(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number
): number {
  let nearest = Infinity;
  for (const b of CAMERA_OBSTACLES) {
    const t = rayBoxDistance(ox, oy, oz, dx, dy, dz, b);
    if (t < nearest) nearest = t;
  }
  for (const dc of dynamicColliders) {
    if (dc.enabled) {
      const t = rayBoxDistance(ox, oy, oz, dx, dy, dz, dc.cameraBox);
      if (t < nearest) nearest = t;
    }
  }
  return nearest;
}

// ------------------------------------------------------------------
// Pontos de interação (computador, estante, quadro) — usados pelo
// sistema de proximidade em interactions.ts.
// ------------------------------------------------------------------

export type InteractionId = string;

export interface InteractionPoint {
  id: InteractionId;
  x: number;
  z: number;
  radius: number;
  prompt: string;
}

export const INTERACTION_POINTS: InteractionPoint[] = [
  {
    id: "computador",
    x: (DESK.minX + DESK.maxX) / 2,
    z: DESK.maxZ + 1.5, // além da cadeira, em espaço livre
    radius: 1.9,
    prompt: "Pressione E para estudar Arquivologia",
  },
  {
    id: "estante",
    x: (BOOKSHELF.minX + BOOKSHELF.maxX) / 2,
    z: BOOKSHELF.maxZ + 0.9,
    radius: 1.8,
    prompt: "Pressione E para abrir os resumos",
  },
  {
    id: "quadro",
    x: (MISSION_BOARD.minX + MISSION_BOARD.maxX) / 2,
    z: MISSION_BOARD.maxZ + 1.1,
    radius: 2.0,
    prompt: "Pressione E para ver a missão do dia",
  },
];

// ---- Registro Dinâmico de Colisores e Interações ----
export interface DynamicCollider {
  id: string;
  box: WallAABB;
  cameraBox: Box3;
  enabled: boolean;
}

export const dynamicColliders: DynamicCollider[] = [];

export function addDynamicCollider(collider: DynamicCollider) {
  dynamicColliders.push(collider);
}

export function removeDynamicCollider(id: string) {
  const index = dynamicColliders.findIndex((c) => c.id === id);
  if (index !== -1) dynamicColliders.splice(index, 1);
}

export const dynamicInteractions: InteractionPoint[] = [];

export function addDynamicInteraction(point: InteractionPoint) {
  dynamicInteractions.push(point);
}

export function removeDynamicInteraction(id: string) {
  const index = dynamicInteractions.findIndex((p) => p.id === id);
  if (index !== -1) dynamicInteractions.splice(index, 1);
}
