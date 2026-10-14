import { useEffect } from "react";
import * as pc from "playcanvas";
import { usePlayCanvas } from "../game/GameCanvas";

export function Corridor() {
  const app = usePlayCanvas();

  useEffect(() => {
    if (!app) return;

    const root = new pc.Entity("corridor-root");
    app.root.addChild(root);

    // Materiais
    const matFloor = new pc.StandardMaterial();
    matFloor.diffuse.set(0.65, 0.6, 0.52); // cinza-castanho para o chão
    matFloor.update();

    const matWall = new pc.StandardMaterial();
    matWall.diffuse.set(0.8, 0.8, 0.76); // bege claro neutro para as paredes
    matWall.update();

    const matCeiling = new pc.StandardMaterial();
    matCeiling.diffuse.set(0.85, 0.85, 0.82);
    matCeiling.update();

    const matDark = new pc.StandardMaterial();
    matDark.diffuse.set(0.15, 0.15, 0.18);
    matDark.update();

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

    // Chão do corredor (z de 5 até 15, x de 2.8 até 5.2)
    helperBox("corridor-floor", matFloor, [4.0, -0.25, 10.0], [2.4, 0.5, 10.0]);

    // Teto
    helperBox("corridor-ceiling", matCeiling, [4.0, 3.25, 10.0], [2.4, 0.5, 10.0]);

    // Paredes Laterais
    helperBox("corridor-wall-w", matWall, [2.7, 1.5, 10.0], [0.2, 3.0, 10.0]);
    helperBox("corridor-wall-e", matWall, [5.3, 1.5, 10.0], [0.2, 3.0, 10.0]);

    // Iluminação do Corredor (duas lâmpadas omni)
    for (const z of [7.5, 12.5]) {
      // Suporte visual da lâmpada no teto
      helperBox(`corridor-lamp-${z}`, matDark, [4.0, 2.9, z], [0.3, 0.08, 0.3]);

      const light = new pc.Entity(`corridor-light-${z}`);
      light.addComponent("light", {
        type: "omni",
        color: new pc.Color(1, 0.93, 0.82),
        intensity: 1.1,
        range: 6.0,
        castShadows: true,
        shadowResolution: 512,
      });
      light.setPosition(4.0, 2.7, z);
      root.addChild(light);
    }

    // Placa indicativa "AULÃO" na parede oeste (olhando do começo do corredor)
    const signA = new pc.Entity("corridor-sign-aulao");
    const canvasA = document.createElement("canvas");
    canvasA.width = 256;
    canvasA.height = 64;
    const ctxA = canvasA.getContext("2d");
    if (ctxA) {
      ctxA.fillStyle = "#1b212c";
      ctxA.fillRect(0, 0, 256, 64);
      ctxA.strokeStyle = "#4caf6b"; // borda verde
      ctxA.lineWidth = 4;
      ctxA.strokeRect(2, 2, 252, 60);
      ctxA.fillStyle = "#ffffff";
      ctxA.font = "bold 26px sans-serif";
      ctxA.textAlign = "center";
      ctxA.textBaseline = "middle";
      ctxA.fillText("AULÃO ➔", 128, 32);
    }
    const texA = new pc.Texture(app.graphicsDevice, {
      width: 256,
      height: 64,
      format: pc.PIXELFORMAT_R8_G8_B8_A8,
      mipmaps: true,
    });
    texA.setSource(canvasA);
    const matSignA = new pc.StandardMaterial();
    matSignA.diffuseMap = texA;
    matSignA.update();

    signA.addComponent("render", {
      type: "box",
      material: matSignA,
    });
    signA.setPosition(2.82, 2.0, 7.0);
    signA.setLocalScale(0.04, 0.3, 0.9);
    root.addChild(signA);

    // Placa indicativa "ESTUDOS" na parede oeste (olhando do final do corredor)
    const signS = new pc.Entity("corridor-sign-estudos");
    const canvasS = document.createElement("canvas");
    canvasS.width = 256;
    canvasS.height = 64;
    const ctxS = canvasS.getContext("2d");
    if (ctxS) {
      ctxS.fillStyle = "#1b212c";
      ctxS.fillRect(0, 0, 256, 64);
      ctxS.strokeStyle = "#3B6FB3"; // borda azul
      ctxS.lineWidth = 4;
      ctxS.strokeRect(2, 2, 252, 60);
      ctxS.fillStyle = "#ffffff";
      ctxS.font = "bold 22px sans-serif";
      ctxS.textAlign = "center";
      ctxS.textBaseline = "middle";
      ctxS.fillText("⬅ ESTUDOS", 128, 32);
    }
    const texS = new pc.Texture(app.graphicsDevice, {
      width: 256,
      height: 64,
      format: pc.PIXELFORMAT_R8_G8_B8_A8,
      mipmaps: true,
    });
    texS.setSource(canvasS);
    const matSignS = new pc.StandardMaterial();
    matSignS.diffuseMap = texS;
    matSignS.update();

    signS.addComponent("render", {
      type: "box",
      material: matSignS,
    });
    signS.setPosition(2.82, 2.0, 13.0);
    signS.setLocalScale(0.04, 0.3, 0.9);
    root.addChild(signS);

    return () => {
      root.destroy();
    };
  }, [app]);

  return null;
}
