import { useEffect } from "react";
import * as pc from "playcanvas";
import { usePlayCanvas } from "../game/GameCanvas";
import { addDynamicInteraction, removeDynamicInteraction, type InteractionPoint } from "../game/engine/world";

export function CinemaScreen() {
  const app = usePlayCanvas();

  useEffect(() => {
    if (!app) return;

    // Registra ponto de interação para o telão
    // Localizado na frente do palco (x = 4.0, z = 23.2), com alcance para cobrir o corredor central frontal
    const pointId = "telao";
    const interactionPoint: InteractionPoint = {
      id: pointId,
      x: 4.0,
      z: 23.2,
      radius: 2.2,
      prompt: "Pressione E para escolher uma aula",
    };

    addDynamicInteraction(interactionPoint);

    return () => {
      removeDynamicInteraction(pointId);
    };
  }, [app]);

  useEffect(() => {
    if (!app) return;

    const root = new pc.Entity("cinema-screen-root");
    app.root.addChild(root);

    // Materiais
    const matFrame = new pc.StandardMaterial();
    matFrame.diffuse.set(0.1, 0.1, 0.12); // moldura preta fosca
    matFrame.update();

    // Cria tela de apresentação brilhante desenhada no canvas
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Gradiente azul escuro premium de cinema
      const grad = ctx.createLinearGradient(0, 0, 512, 256);
      grad.addColorStop(0, "#0f172a");
      grad.addColorStop(1, "#1e3a8a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 256);

      // Elementos gráficos decorativos (círculos brilhantes sutis)
      ctx.fillStyle = "rgba(59, 130, 246, 0.12)";
      ctx.beginPath();
      ctx.arc(256, 128, 160, 0, Math.PI * 2);
      ctx.fill();

      // Borda interna brilhante
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, 496, 240);

      // Texto Principal
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 32px sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
      ctx.shadowBlur = 8;
      ctx.fillText("AULÃO PREPARATÓRIO", 256, 100);

      // Subtexto explicativo
      ctx.fillStyle = "#93c5fd";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText("Selecione sua matéria e bons estudos", 256, 150);

      // Botão indicador animado no telão
      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(156, 185, 200, 36);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px monospace";
      ctx.fillText("[ PRESSIONE E ]", 256, 208);
    }

    const texture = new pc.Texture(app.graphicsDevice, {
      width: 512,
      height: 256,
      format: pc.PIXELFORMAT_R8_G8_B8_A8,
      mipmaps: true,
    });
    texture.setSource(canvas);

    const matScreen = new pc.StandardMaterial();
    matScreen.diffuseMap = texture;
    matScreen.emissiveMap = texture; // Emite luz própria (glowing screen)
    matScreen.emissive = new pc.Color(0.8, 0.85, 1.0);
    matScreen.update();

    // Moldura do telão
    const frame = new pc.Entity("screen-frame");
    frame.addComponent("render", {
      type: "box",
      material: matFrame,
      castShadows: false,
      receiveShadows: true,
    });
    frame.setPosition(4.0, 1.7, 26.85);
    frame.setLocalScale(8.2, 4.2, 0.1);
    root.addChild(frame);

    // Folha da tela
    const screen = new pc.Entity("screen-sheet");
    screen.addComponent("render", {
      type: "box",
      material: matScreen,
      castShadows: false,
      receiveShadows: false,
    });
    screen.setPosition(4.0, 1.7, 26.78);
    screen.setLocalScale(8.0, 4.0, 0.04);
    root.addChild(screen);

    return () => {
      root.destroy();
    };
  }, [app]);

  return null;
}
