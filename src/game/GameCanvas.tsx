import { forwardRef, useEffect, useImperativeHandle, useRef, useState, createContext, useContext, type ReactNode } from "react";
import * as pc from "playcanvas";
import { createGame, type Game } from "./engine/createGame";
import type { InteractionPoint } from "./engine/world";

export const PlayCanvasContext = createContext<pc.Application | null>(null);
export const usePlayCanvas = () => useContext(PlayCanvasContext);

export interface GameCanvasHandle {
  resetPlayer(): void;
  setLocked(locked: boolean): void;
  recaptureMouse(): void;
}

interface Props {
  /** Chamado sempre que o ponto de interação mais próximo do jogador muda. */
  onNearbyChange?: (point: InteractionPoint | null) => void;
  children?: ReactNode;
}

/**
 * Hospeda o canvas do PlayCanvas dentro do React.
 * O ciclo de vida do jogo acompanha o do componente.
 */
export const GameCanvas = forwardRef<GameCanvasHandle, Props>(function GameCanvas(
  { onNearbyChange, children },
  ref
) {
  const [app, setApp] = useState<pc.Application | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  // ref sempre atualizada, para o callback do loop do jogo nunca ficar "velho"
  const onNearbyChangeRef = useRef(onNearbyChange);
  onNearbyChangeRef.current = onNearbyChange;

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = createGame(canvasRef.current, {
      onNearbyChange: (point) => onNearbyChangeRef.current?.(point),
    });
    gameRef.current = game;
    setApp(game.app);
    return () => {
      gameRef.current = null;
      setApp(null);
      game.destroy();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    resetPlayer() {
      gameRef.current?.resetPlayer();
    },
    setLocked(locked: boolean) {
      gameRef.current?.setLocked(locked);
    },
    recaptureMouse() {
      gameRef.current?.recaptureMouse();
    },
  }));

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", touchAction: "none" }}
      />
      <PlayCanvasContext.Provider value={app}>
        {app && children}
      </PlayCanvasContext.Provider>
    </div>
  );
});
