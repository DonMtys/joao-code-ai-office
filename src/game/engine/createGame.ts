import * as pc from "playcanvas";
import { buildLevel } from "./level";
import { createInput } from "./input";
import { createPlayer } from "./player";
import { createThirdPersonCamera } from "./camera";
import { findNearbyInteraction } from "./interactions";
import type { InteractionPoint } from "./world";

export interface Game {
  app: pc.Application;
  resetPlayer(): void;
  /** Trava/destrava o movimento e o mouse (usado ao abrir/fechar um painel React). */
  setLocked(locked: boolean): void;
  /** Tenta recapturar o mouse (chamar a partir de um clique/tecla do usuário). */
  recaptureMouse(): void;
  destroy(): void;
}

export interface GameCallbacks {
  /** Chamado sempre que o ponto de interação mais próximo muda (ou fica nulo). */
  onNearbyChange?: (point: InteractionPoint | null) => void;
}

/** Cria e inicia o jogo dentro do canvas fornecido. */
export function createGame(canvas: HTMLCanvasElement, callbacks: GameCallbacks = {}): Game {
  const app = new pc.Application(canvas, {
    graphicsDeviceOptions: { antialias: true },
  });
  app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);

  const input = createInput();
  buildLevel(app);
  const player = createPlayer(app);
  const camera = createThirdPersonCamera(app, canvas);
  camera.snapTo(player);

  let locked = false;
  let lastNearbyId: string | null = null;

  const onUpdate = (dt: number) => {
    // limita dt (aba em segundo plano) para a física não "explodir"
    const step = Math.min(dt, 1 / 30);
    player.update(step, input.state, camera.yawRad, locked);
    camera.update(step, player);

    const nearby = locked ? null : findNearbyInteraction(player.pos.x, player.pos.z);
    const nearbyId = nearby?.id ?? null;
    if (nearbyId !== lastNearbyId) {
      lastNearbyId = nearbyId;
      callbacks.onNearbyChange?.(nearby);
    }
  };
  app.on("update", onUpdate);

  const onResize = () => app.resizeCanvas();
  window.addEventListener("resize", onResize);

  app.start();

  return {
    app,
    resetPlayer() {
      player.reset();
      camera.snapTo(player);
    },
    setLocked(value: boolean) {
      locked = value;
      if (value) {
        camera.release();
        if (lastNearbyId !== null) {
          lastNearbyId = null;
          callbacks.onNearbyChange?.(null);
        }
      } else {
        camera.resume();
      }
    },
    recaptureMouse() {
      camera.recapture();
    },
    destroy() {
      window.removeEventListener("resize", onResize);
      app.off("update", onUpdate);
      camera.destroy();
      input.destroy();
      app.destroy();
    },
  };
}

