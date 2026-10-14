import { useEffect } from "react";
import * as pc from "playcanvas";
import { usePlayCanvas } from "../game/GameCanvas";
import { InteractiveDoor } from "./InteractiveDoor";

export function AulaoRoom() {
  const app = usePlayCanvas();

  useEffect(() => {
    if (!app) return;

    const root = new pc.Entity("aulao-root");
    app.root.addChild(root);

    // Materiais
    const matFloor = new pc.StandardMaterial();
    matFloor.diffuse.set(0.18, 0.18, 0.22); // carpete escuro de cinema
    matFloor.update();

    const matWall = new pc.StandardMaterial();
    matWall.diffuse.set(0.24, 0.24, 0.28); // paredes escuras para refletir pouca luz
    matWall.update();

    const matCeiling = new pc.StandardMaterial();
    matCeiling.diffuse.set(0.15, 0.15, 0.18); // teto escuro
    matCeiling.update();

    const matStage = new pc.StandardMaterial();
    matStage.diffuse.set(0.42, 0.28, 0.18); // madeira do palco
    matStage.update();

    const matChairFabric = new pc.StandardMaterial();
    matChairFabric.diffuse.set(0.66, 0.12, 0.12); // vermelho escuro clássico de assentos de cinema
    matChairFabric.update();

    const matChairBase = new pc.StandardMaterial();
    matChairBase.diffuse.set(0.1, 0.1, 0.12); // suporte preto/cinza-escuro
    matChairBase.update();

    const matNeon = new pc.StandardMaterial();
    matNeon.diffuse.set(0.85, 0.54, 0.22); // laranja neon
    matNeon.emissive.set(0.85, 0.54, 0.22);
    matNeon.update();

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

    // Dimensões do auditório (x de -2 até 10, z de 15 até 27, largura 12, comprimento 12)
    const cx = 4.0;
    const cz = 21.0;
    const sizeX = 12.0;
    const sizeZ = 12.0;
    const h = 3.0; // altura do teto
    const t = 0.5; // espessura de paredes

    // Chão e Teto
    helperBox("aulao-floor", matFloor, [cx, -0.25, cz], [sizeX, 0.5, sizeZ]);
    helperBox("aulao-ceiling", matCeiling, [cx, h + 0.25, cz], [sizeX, 0.5, sizeZ]);

    // Parede Norte (com vão de porta entre x = 3.4 e 4.6)
    helperBox("aulao-wall-n-l", matWall, [0.7, h / 2, 15.0], [5.4, h, t]);
    helperBox("aulao-wall-n-r", matWall, [7.3, h / 2, 15.0], [5.4, h, t]);

    // Parede Sul (parede frontal do telão)
    helperBox("aulao-wall-s", matWall, [cx, h / 2, 27.0], [sizeX, h, t]);

    // Parede Oeste
    helperBox("aulao-wall-w", matWall, [-2.0, h / 2, cz], [t, h, sizeZ]);

    // Parede Leste
    helperBox("aulao-wall-e", matWall, [10.0, h / 2, cz], [t, h, sizeZ]);

    // Palco pequeno na frente (z de 24 até 26.8, altura 0.3)
    helperBox("aulao-stage", matStage, [cx, 0.15, 25.4], [sizeX, 0.3, 2.8]);

    // Placa decorativa "AULÃO" acima da tela
    const sign = new pc.Entity("aulao-decorative-sign");
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#a82828"; // vermelho escuro
      ctx.fillRect(0, 0, 256, 64);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 252, 60);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 32px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("AULÃO", 128, 32);
    }
    const texture = new pc.Texture(app.graphicsDevice, {
      width: 256,
      height: 64,
      format: pc.PIXELFORMAT_R8_G8_B8_A8,
      mipmaps: true,
    });
    texture.setSource(canvas);
    const matSign = new pc.StandardMaterial();
    matSign.diffuseMap = texture;
    matSign.update();

    sign.addComponent("render", {
      type: "box",
      material: matSign,
    });
    sign.setPosition(cx, 2.65, 26.78);
    sign.setLocalScale(1.8, 0.4, 0.04);
    root.addChild(sign);

    // Geração procedural de 18 cadeiras de cinema (3 fileiras, colunas esquerda e direita)
    const columnsLeft = [0.4, 1.2, 2.0];
    const columnsRight = [6.0, 6.8, 7.6];
    const rowsZ = [18.0, 20.0, 22.0];

    const spawnChair = (x: number, z: number, idStr: string) => {
      // Base sólida da cadeira
      helperBox(`chair-base-${idStr}`, matChairBase, [x, 0.2, z], [0.55, 0.4, 0.4]);
      // Assento (almofada vermelha)
      helperBox(`chair-seat-${idStr}`, matChairFabric, [x, 0.42, z], [0.58, 0.06, 0.52]);
      // Encosto (almofada traseira)
      helperBox(`chair-back-${idStr}`, matChairFabric, [x, 0.68, z + 0.22], [0.58, 0.52, 0.06]);
    };

    rowsZ.forEach((z, rIdx) => {
      columnsLeft.forEach((x, cIdx) => {
        spawnChair(x, z, `L-${rIdx}-${cIdx}`);
      });
      columnsRight.forEach((x, cIdx) => {
        spawnChair(x, z, `R-${rIdx}-${cIdx}`);
      });
    });

    // Luzes de rodapé (balizadoras neon no corredor central)
    // Localizadas no piso ao longo do corredor central
    for (const z of [17.0, 19.5, 22.0, 24.0]) {
      // Baliza da esquerda (x = 3.3)
      helperBox(`neon-l-${z}`, matNeon, [3.2, 0.01, z], [0.08, 0.02, 0.08]);
      // Baliza da direita (x = 4.7)
      helperBox(`neon-r-${z}`, matNeon, [4.8, 0.01, z], [0.08, 0.02, 0.08]);
    }

    // Iluminação do Auditório (luz ambiente muito baixa + luzes suaves no corredor)
    const ambientLight = new pc.Entity("aulao-ambient-light");
    ambientLight.addComponent("light", {
      type: "omni",
      color: new pc.Color(0.8, 0.85, 1.0),
      intensity: 0.25, // bem escura
      range: 18.0,
      castShadows: false,
    });
    ambientLight.setPosition(cx, 2.7, cz);
    root.addChild(ambientLight);

    // Duas luzes suaves no piso do corredor central
    for (const z of [18.5, 22.5]) {
      const pathLight = new pc.Entity(`aulao-path-light-${z}`);
      pathLight.addComponent("light", {
        type: "omni",
        color: new pc.Color(1.0, 0.6, 0.3), // laranja quente
        intensity: 0.5,
        range: 4.5,
        castShadows: false,
      });
      pathLight.setPosition(cx, 0.15, z);
      root.addChild(pathLight);
    }

    return () => {
      root.destroy();
    };
  }, [app]);

  return (
    <InteractiveDoor
      id="porta-aulao"
      position={[4.0, 0, 15.0]}
      width={1.2}
      height={2.2}
      thickness={0.08}
      hingeSide="left"
      openAngle={-90}
      label="AULÃO"
    />
  );
}
