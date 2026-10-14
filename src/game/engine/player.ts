import * as pc from "playcanvas";
import type { InputState } from "./input";
import { createHumanoid, type Humanoid } from "./humanoid";
import {
  GRAVITY,
  PLAYER_RADIUS,
  RUN_SPEED,
  SPAWN,
  STEP_LIMIT,
  WALK_SPEED,
  WALLS,
  groundHeightAt,
  pushCircleOutOfAABB,
  dynamicColliders,
} from "./world";

export interface Player {
  entity: pc.Entity;
  /** posição lógica (origem nos pés) */
  pos: { x: number; y: number; z: number };
  yawDeg: number;
  update(dt: number, input: InputState, cameraYawRad: number, locked: boolean): void;
  reset(): void;
}

/** Interpola ângulos pelo caminho mais curto (graus). */
function lerpAngleDeg(a: number, b: number, t: number): number {
  let diff = (b - a) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return a + diff * t;
}

export function createPlayer(app: pc.Application): Player {
  // Entidade raiz com origem nos pés (facilita a física)
  const entity = new pc.Entity("jogador");
  app.root.addChild(entity);

  // ---- visual: humanoide low-poly ----
  const humanoid: Humanoid = createHumanoid(entity);

  // ---- colisão: cápsula invisível (a mesma forma usada pela física) ----
  // A física usa PLAYER_RADIUS + regra de degrau (world.ts). Esta entidade
  // materializa essa cápsula; fica invisível, mas pode ser ligada para debug.
  const debugMat = new pc.StandardMaterial();
  debugMat.diffuse.set(0.2, 1, 0.4);
  debugMat.opacity = 0.3;
  debugMat.blendType = pc.BLEND_NORMAL;
  debugMat.update();
  const collider = new pc.Entity("capsula-colisao");
  collider.addComponent("render", {
    type: "capsule",
    material: debugMat,
    castShadows: false,
    receiveShadows: false,
  });
  collider.setLocalScale(PLAYER_RADIUS * 2, 0.85, PLAYER_RADIUS * 2);
  collider.setLocalPosition(0, 0.85, 0);
  if (collider.render) collider.render.enabled = false; // true => visualizar a cápsula
  entity.addChild(collider);

  const pos = { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z };
  let vy = 0;
  let yawDeg = 180; // nasce olhando para a sala
  let smoothSpeed = 0; // para o blend da animação

  /** Move um eixo por vez: resolve paredes e regra de degrau, permitindo deslizar. */
  function moveAxis(dx: number, dz: number) {
    let nx = pos.x + dx;
    let nz = pos.z + dz;
    for (const w of WALLS) {
      if (w.minY !== undefined && pos.y + 1.8 < w.minY) continue;
      if (w.maxY !== undefined && pos.y > w.maxY) continue;
      const r = pushCircleOutOfAABB(nx, nz, PLAYER_RADIUS, w);
      nx = r.x;
      nz = r.z;
    }
    for (const dc of dynamicColliders) {
      if (dc.enabled) {
        if (dc.cameraBox.minY !== undefined && pos.y + 1.8 < dc.cameraBox.minY) continue;
        if (dc.cameraBox.maxY !== undefined && pos.y > dc.cameraBox.maxY) continue;
        const r = pushCircleOutOfAABB(nx, nz, PLAYER_RADIUS, dc.box);
        nx = r.x;
        nz = r.z;
      }
    }
    // Regra de degrau: se o chão do destino é alto demais, o eixo é bloqueado
    const g = groundHeightAt(nx, nz, pos.y);
    if (g > pos.y + STEP_LIMIT) return;
    pos.x = nx;
    pos.z = nz;
  }

  const player: Player = {
    entity,
    pos,
    get yawDeg() {
      return yawDeg;
    },
    set yawDeg(v: number) {
      yawDeg = v;
    },

    update(dt: number, input: InputState, cameraYawRad: number, locked: boolean) {
      // ---- direção de movimento relativa à câmera ----
      let ix = 0;
      let iz = 0;
      if (!locked) {
        if (input.forward) iz -= 1;
        if (input.back) iz += 1;
        if (input.left) ix -= 1;
        if (input.right) ix += 1;
      }

      const moving = ix !== 0 || iz !== 0;
      const speed = input.run ? RUN_SPEED : WALK_SPEED;

      if (moving) {
        const len = Math.hypot(ix, iz);
        ix /= len;
        iz /= len;

        // gira o vetor de entrada pelo yaw da câmera
        const sin = Math.sin(cameraYawRad);
        const cos = Math.cos(cameraYawRad);
        const wx = ix * cos + iz * sin;
        const wz = -ix * sin + iz * cos;

        moveAxis(wx * speed * dt, 0);
        moveAxis(0, wz * speed * dt);

        // rotaciona suavemente para a direção do movimento (-Z é a frente)
        const targetYaw = (Math.atan2(-wx, -wz) * 180) / Math.PI;
        const t = 1 - Math.exp(-12 * dt);
        yawDeg = lerpAngleDeg(yawDeg, targetYaw, t);
      }

      // ---- gravidade e chão ----
      vy += GRAVITY * dt;
      pos.y += vy * dt;
      const ground = groundHeightAt(pos.x, pos.z, pos.y);
      if (pos.y <= ground) {
        pos.y = ground;
        vy = 0;
      }

      entity.setPosition(pos.x, pos.y, pos.z);
      entity.setEulerAngles(0, yawDeg, 0);

      // ---- animação ----
      const targetSpeed = moving ? speed : 0;
      smoothSpeed += (targetSpeed - smoothSpeed) * (1 - Math.exp(-10 * dt));
      humanoid.animate(dt, smoothSpeed / RUN_SPEED, input.run && moving);
    },

    reset() {
      pos.x = SPAWN.x;
      pos.y = SPAWN.y;
      pos.z = SPAWN.z;
      vy = 0;
      yawDeg = 180;
      smoothSpeed = 0;
      entity.setPosition(pos.x, pos.y, pos.z);
      entity.setEulerAngles(0, yawDeg, 0);
    },
  };

  player.reset();
  return player;
}
