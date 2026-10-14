import { useEffect } from "react";
import * as pc from "playcanvas";
import { usePlayCanvas } from "../game/GameCanvas";
import { InteractiveDoor } from "./InteractiveDoor";
import { addDynamicInteraction, removeDynamicInteraction, type InteractionPoint } from "../game/engine/world";

export function SimulationArena() {
  const app = usePlayCanvas();

  // Registra ponto de interação para iniciar o simulado
  useEffect(() => {
    if (!app) return;

    const interactionId = "sala-simulado";
    const point: InteractionPoint = {
      id: interactionId,
      x: 4.0,
      z: 21.0,
      radius: 2.2,
      prompt: "Pressione E para acessar a Arena de Simulados",
    };

    addDynamicInteraction(point);

    return () => {
      removeDynamicInteraction(interactionId);
    };
  }, [app]);

  useEffect(() => {
    if (!app) return;

    const root = new pc.Entity("simulation-arena-root");
    app.root.addChild(root);

    // Materiais
    const matFloor = new pc.StandardMaterial();
    matFloor.diffuse.set(0.1, 0.12, 0.18); // carpete metálico azul-escuro
    matFloor.update();

    const matWall = new pc.StandardMaterial();
    matWall.diffuse.set(0.15, 0.15, 0.22); // paredes escuras azuladas
    matWall.update();

    const matCeiling = new pc.StandardMaterial();
    matCeiling.diffuse.set(0.08, 0.08, 0.12);
    matCeiling.update();

    const matPlatform = new pc.StandardMaterial();
    matPlatform.diffuse.set(0.1, 0.4, 0.8); // azul futurista
    matPlatform.emissive.set(0.1, 0.4, 0.8);
    matPlatform.update();

    const matConsole = new pc.StandardMaterial();
    matConsole.diffuse.set(0.2, 0.2, 0.25);
    matConsole.update();

    const matCyanNeon = new pc.StandardMaterial();
    matCyanNeon.diffuse.set(0.2, 0.8, 0.8);
    matCyanNeon.emissive.set(0.2, 0.8, 0.8);
    matCyanNeon.update();

    const matPurpleNeon = new pc.StandardMaterial();
    matPurpleNeon.diffuse.set(0.8, 0.2, 0.8);
    matPurpleNeon.emissive.set(0.8, 0.2, 0.8);
    matPurpleNeon.update();

    const helperBox = (
      name: string,
      mat: pc.StandardMaterial,
      pos: [number, number, number],
      scale: [number, number, number]
    ) => {
      const e = new pc.Entity(name);
      e.addComponent("render", {
        type: "box",
        material: mat,
        castShadows: true,
        receiveShadows: true,
      });
      e.setPosition(pos[0], pos[1], pos[2]);
      e.setLocalScale(scale[0], scale[1], scale[2]);
      root.addChild(e);
      return e;
    };

    const cx = 4.0;
    const cy = 3.0; // Primeiro andar
    const cz = 21.0;
    const sizeX = 12.0;
    const sizeZ = 12.0;
    const h = 3.0;

    // Chão e Teto da Arena
    helperBox("arena-floor", matFloor, [cx, cy - 0.25, cz], [sizeX, 0.5, sizeZ]);
    helperBox("arena-ceiling", matCeiling, [cx, cy + h + 0.25, cz], [sizeX, 0.5, sizeZ]);

    // Plataforma Central Elevada (x = 4, z = 21, y = 3.15)
    helperBox("arena-platform", matPlatform, [cx, cy + 0.1, cz], [2.4, 0.2, 2.4]);
    // Detalhe de borda neon brilhante
    helperBox("arena-platform-neon", matCyanNeon, [cx, cy + 0.21, cz], [2.2, 0.02, 2.2]);

    // Console / Terminal de Controle (x = 4, z = 19.4)
    helperBox("arena-console-post", matConsole, [cx, cy + 0.4, cz - 1.6], [0.3, 0.8, 0.3]);
    // Tela inclinada do console
    const screenConsole = new pc.Entity("arena-console-screen");
    screenConsole.addComponent("render", {
      type: "box",
      material: matCyanNeon,
    });
    screenConsole.setPosition(cx, cy + 0.84, cz - 1.6);
    screenConsole.setLocalScale(0.4, 0.08, 0.3);
    screenConsole.setEulerAngles(25, 0, 0);
    root.addChild(screenConsole);

    // Placar Digital Luminoso na parede frontal (Sul, z = 26.9)
    const scoreboard = new pc.Entity("arena-scoreboard");
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Fundo escuro tecnológico
      ctx.fillStyle = "#0c0f1d";
      ctx.fillRect(0, 0, 512, 256);

      // Grade digital de fundo (sutil)
      ctx.strokeStyle = "rgba(0, 240, 255, 0.05)";
      ctx.lineWidth = 2;
      for (let x = 0; x < 512; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 256);
        ctx.stroke();
      }
      for (let y = 0; y < 256; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();
      }

      // Moldura neon ciano
      ctx.strokeStyle = "#00f0ff";
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, 500, 244);

      // Título
      ctx.fillStyle = "#00f0ff";
      ctx.font = "bold 26px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ARENA DE SIMULADOS", 256, 60);

      // Painel de dados (Recorde / Status)
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px monospace";
      ctx.fillText("STATUS: PRONTO PARA INICIAR", 256, 120);

      ctx.fillStyle = "#ff007f"; // rosa/magenta
      ctx.font = "bold 18px monospace";
      ctx.fillText("RECORDE GLOBAL: 95% (ARQ)", 256, 170);

      ctx.fillStyle = "#888899";
      ctx.font = "14px sans-serif";
      ctx.fillText("Aproxime-se do console central para interagir", 256, 220);
    }
    const texture = new pc.Texture(app.graphicsDevice, {
      width: 512,
      height: 256,
      format: pc.PIXELFORMAT_R8_G8_B8_A8,
      mipmaps: true,
    });
    texture.setSource(canvas);
    const matScoreboard = new pc.StandardMaterial();
    matScoreboard.diffuseMap = texture;
    matScoreboard.emissiveMap = texture;
    matScoreboard.emissive = new pc.Color(0.8, 0.95, 1.0);
    matScoreboard.update();

    scoreboard.addComponent("render", {
      type: "box",
      material: matScoreboard,
    });
    scoreboard.setPosition(cx, cy + 1.8, 26.78);
    scoreboard.setLocalScale(6.0, 2.0, 0.04);
    root.addChild(scoreboard);

    // Pilares neon decorativos nos cantos da sala
    const corners = [
      [cx - sizeX / 2 + 0.3, cz - sizeZ / 2 + 0.3],
      [cx + sizeX / 2 - 0.3, cz - sizeZ / 2 + 0.3],
      [cx - sizeX / 2 + 0.3, cz + sizeZ / 2 - 0.3],
      [cx + sizeX / 2 - 0.3, cz + sizeZ / 2 - 0.3],
    ];

    corners.forEach(([cornerX, cornerZ], idx) => {
      // Base do pilar
      helperBox(`arena-pillar-base-${idx}`, matConsole, [cornerX, cy + h / 2, cornerZ], [0.4, h, 0.4]);
      // Faixa brilhante vertical (alternando cores)
      helperBox(
        `arena-pillar-neon-${idx}`,
        idx % 2 === 0 ? matCyanNeon : matPurpleNeon,
        [cornerX, cy + h / 2, idx % 2 === 0 ? cornerZ + 0.21 : cornerZ - 0.21],
        [0.08, h - 0.4, 0.02]
      );
    });

    // Iluminação Futurista (Omni Light lilás com preenchimento ciano)
    const purpleLight = new pc.Entity("arena-purple-light");
    purpleLight.addComponent("light", {
      type: "omni",
      color: new pc.Color(0.8, 0.4, 1.0), // roxo/lilás
      intensity: 1.0,
      range: 12.0,
      castShadows: false,
    });
    purpleLight.setPosition(cx, cy + 2.5, cz);
    root.addChild(purpleLight);

    const cyanLight = new pc.Entity("arena-cyan-light");
    cyanLight.addComponent("light", {
      type: "omni",
      color: new pc.Color(0.2, 0.8, 0.8), // ciano suave sobre o console
      intensity: 0.8,
      range: 6.0,
      castShadows: false,
    });
    cyanLight.setPosition(cx, cy + 1.2, cz - 1.6);
    root.addChild(cyanLight);

    return () => {
      root.destroy();
    };
  }, [app]);

  return (
    <InteractiveDoor
      id="porta-simulados"
      position={[4.0, 3.0, 15.0]}
      width={1.2}
      height={2.2}
      thickness={0.08}
      hingeSide="left"
      openAngle={-90}
      label="SIMULADOS"
    />
  );
}
