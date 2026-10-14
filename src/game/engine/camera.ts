import * as pc from "playcanvas";
import type { Player } from "./player";
import { CEILING_Y, groundHeightAt, nearestObstacleDistance } from "./world";

const MAX_DISTANCE = 5.5;
const MIN_DISTANCE = 1.2;
const WALL_MARGIN = 0.3;
const TARGET_HEIGHT = 1.45;
const MOUSE_SENS = 0.0028;
const PITCH_MIN = -0.25; // olhar um pouco de baixo
const PITCH_MAX = 1.1;   // olhar bem de cima
const DEFAULT_PITCH = 0.32;

export interface ThirdPersonCamera {
  entity: pc.Entity;
  /** yaw atual da câmera em radianos (usado para o movimento relativo à câmera) */
  yawRad: number;
  /** true enquanto o mouse está capturado (pointer lock) */
  readonly mouseCaptured: boolean;
  update(dt: number, player: Player): void;
  snapTo(player: Player): void;
  /** Solta o pointer lock (usado ao abrir um painel React sobre o jogo). */
  release(): void;
  /** Permite capturar o mouse de novo (usado ao fechar o painel). */
  resume(): void;
  /** Tenta recapturar o mouse imediatamente (chamar a partir de um gesto do usuário). */
  recapture(): void;
  destroy(): void;
}

export function createThirdPersonCamera(
  app: pc.Application,
  canvas: HTMLCanvasElement
): ThirdPersonCamera {
  const entity = new pc.Entity("camera");
  entity.addComponent("camera", {
    clearColor: new pc.Color(0.72, 0.78, 0.86),
    farClip: 120,
    fov: 55,
  });
  app.root.addChild(entity);

  let yawRad = Math.PI;
  let pitchRad = DEFAULT_PITCH;
  let distance = MAX_DISTANCE;

  const smoothTarget = new pc.Vec3();
  const camPos = new pc.Vec3();
  let initialized = false;

  // ---- captura do mouse (pointer lock) ----
  // Clique no cenário captura; Esc libera (comportamento nativo do navegador).
  let locked = false;

  const onClick = () => {
    if (locked) return;
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
  };
  const onMouseMove = (e: MouseEvent) => {
    if (locked) return;
    if (document.pointerLockElement !== canvas) return;
    yawRad -= e.movementX * MOUSE_SENS;
    pitchRad += e.movementY * MOUSE_SENS;
    pitchRad = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitchRad));
  };
  canvas.addEventListener("click", onClick);
  window.addEventListener("mousemove", onMouseMove);

  const cam: ThirdPersonCamera = {
    entity,
    get yawRad() {
      return yawRad;
    },
    set yawRad(v: number) {
      yawRad = v;
    },
    get mouseCaptured() {
      return document.pointerLockElement === canvas;
    },

    update(dt: number, player: Player) {
      if (!initialized) {
        this.snapTo(player);
        return;
      }

      // alvo (peito do personagem) com leve atraso => sensação de câmera "viva"
      const k = 1 - Math.exp(-10 * dt);
      smoothTarget.x += (player.pos.x - smoothTarget.x) * k;
      smoothTarget.y += (player.pos.y + TARGET_HEIGHT - smoothTarget.y) * k;
      smoothTarget.z += (player.pos.z - smoothTarget.z) * k;

      // direção alvo->câmera em coordenadas esféricas (yaw + pitch)
      const cosP = Math.cos(pitchRad);
      const dirX = Math.sin(yawRad) * cosP;
      const dirY = Math.sin(pitchRad);
      const dirZ = Math.cos(yawRad) * cosP;

      // não deixa a câmera atravessar paredes/móveis: raycast até o obstáculo
      const hit = nearestObstacleDistance(
        smoothTarget.x, smoothTarget.y, smoothTarget.z,
        dirX, dirY, dirZ
      );
      const allowed = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, hit - WALL_MARGIN));

      // aproxima rápido (obstáculo), afasta devagar (conforto)
      const rate = allowed < distance ? 20 : 4;
      distance += (allowed - distance) * (1 - Math.exp(-rate * dt));

      camPos.set(
        smoothTarget.x + dirX * distance,
        smoothTarget.y + dirY * distance,
        smoothTarget.z + dirZ * distance
      );

      // nunca abaixo do chão nem acima do teto
      const floorY = groundHeightAt(camPos.x, camPos.z, camPos.y) + 0.3;
      if (camPos.y < floorY) camPos.y = floorY;
      const currentCeilingY = player.pos.y > 1.5 ? 6.0 : CEILING_Y;
      const ceilY = currentCeilingY - 0.25;
      if (camPos.y > ceilY) camPos.y = ceilY;

      entity.setPosition(camPos);
      entity.lookAt(smoothTarget);
    },

    snapTo(player: Player) {
      yawRad = (player.yawDeg * Math.PI) / 180;
      pitchRad = DEFAULT_PITCH;
      distance = MAX_DISTANCE;
      smoothTarget.set(player.pos.x, player.pos.y + TARGET_HEIGHT, player.pos.z);
      const cosP = Math.cos(pitchRad);
      camPos.set(
        smoothTarget.x + Math.sin(yawRad) * cosP * distance,
        smoothTarget.y + Math.sin(pitchRad) * distance,
        smoothTarget.z + Math.cos(yawRad) * cosP * distance
      );
      entity.setPosition(camPos);
      entity.lookAt(smoothTarget);
      initialized = true;
    },

    destroy() {
      canvas.removeEventListener("click", onClick);
      window.removeEventListener("mousemove", onMouseMove);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },

    release() {
      locked = true;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },

    resume() {
      locked = false;
    },

    recapture() {
      if (locked || document.pointerLockElement === canvas) return;
      // requestPointerLock pode devolver uma Promise (e ser rejeitada se o
      // navegador não considerar o momento um "gesto do usuário") — falha em silêncio;
      // nesse caso o jogador só precisa clicar no cenário para capturar de novo.
      try {
        const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        p?.catch(() => {});
      } catch {
        /* sem pointer lock disponível */
      }
    },
  };

  return cam;
}
