import { useCallback, useEffect, useRef, useState } from "react";
import { GameCanvas, type GameCanvasHandle } from "./game/GameCanvas";
import type { InteractionPoint, InteractionId } from "./game/engine/world";
import { ControlsOverlay } from "./ui/ControlsOverlay";
import { AgentOffice } from "./ui/AgentOffice";
import { InteractionPrompt } from "./ui/InteractionPrompt";
import { StudyPanel } from "./ui/StudyPanel";
import { LibraryPanel } from "./ui/LibraryPanel";
import { MissionPanel } from "./ui/MissionPanel";
import { SchoolBuilding } from "./ui/SchoolBuilding";
import { RoomInteractionPanel } from "./ui/RoomInteractionPanel";
import { AulaoPanel } from "./ui/AulaoPanel";

export default function App() {
  const gameRef = useRef<GameCanvasHandle>(null);
  const [nearby, setNearby] = useState<InteractionPoint | null>(null);
  const [openPanel, setOpenPanel] = useState<InteractionId | null>(null);

  // refs espelhando o estado, para os handlers de teclado não ficarem "velhos"
  const nearbyRef = useRef(nearby);
  nearbyRef.current = nearby;
  const openPanelRef = useRef(openPanel);
  openPanelRef.current = openPanel;

  const closePanel = useCallback(() => {
    setOpenPanel(null);
    gameRef.current?.setLocked(false);
    // devolve o cursor ao jogo imediatamente (fechamento é um gesto do usuário)
    gameRef.current?.recaptureMouse();
  }, []);

  // tecla E abre o painel do objeto próximo ou abre portas; Esc fecha o painel aberto
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "KeyE" && openPanelRef.current === null && nearbyRef.current) {
        const id = nearbyRef.current.id;
        if (id.startsWith("porta")) {
          // Trata interações com portas (dispara evento sem pausar o jogo)
          window.dispatchEvent(new CustomEvent("interact", { detail: { id } }));
        } else {
          setOpenPanel(id);
          gameRef.current?.setLocked(true);
        }
      } else if (e.code === "Escape" && openPanelRef.current !== null) {
        closePanel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePanel]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <GameCanvas ref={gameRef} onNearbyChange={setNearby}>
        <SchoolBuilding />
        <AgentOffice />
      </GameCanvas>

      <ControlsOverlay onReset={() => gameRef.current?.resetPlayer()} />

      {nearby && openPanel === null && <InteractionPrompt text={nearby.prompt} />}

      {openPanel === "computador" && <StudyPanel onClose={closePanel} />}
      {openPanel === "estante" && <LibraryPanel onClose={closePanel} />}
      {openPanel === "quadro" && <MissionPanel onClose={closePanel} />}
      {openPanel === "telao" && <AulaoPanel onClose={closePanel} />}
      {openPanel && openPanel.startsWith("sala-") && (
        <RoomInteractionPanel onClose={closePanel} subjectId={openPanel} />
      )}
    </div>
  );
}
