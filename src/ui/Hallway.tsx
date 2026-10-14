import { useEffect } from "react";
import * as pc from "playcanvas";
import { usePlayCanvas } from "../game/GameCanvas";

interface SignInfo {
  text: string;
  z: number;
  side: "west" | "east";
  borderHex: number;
}

interface Props {
  id: string;
  position: [number, number, number]; // [cx, cy, cz]
  width: number;
  length: number;
  height?: number;
  yFloor: number;
  westWallSegments: Array<[number, number]>; // list of [startZ, endZ] wall pieces
  eastWallSegments: Array<[number, number]>;
  signs: SignInfo[];
}

export function Hallway({
  id,
  position,
  width,
  length,
  height = 3.0,
  yFloor,
  westWallSegments,
  eastWallSegments,
  signs,
}: Props) {
  const app = usePlayCanvas();

  useEffect(() => {
    if (!app) return;

    const root = new pc.Entity(`hallway-root-${id}`);
    app.root.addChild(root);

    // Materiais
    const matFloor = new pc.StandardMaterial();
    matFloor.diffuse.set(0.6, 0.58, 0.52); // cinza-castanho
    matFloor.update();

    const matWall = new pc.StandardMaterial();
    matWall.diffuse.set(0.8, 0.8, 0.76); // bege neutro
    matWall.update();

    const matCeiling = new pc.StandardMaterial();
    matCeiling.diffuse.set(0.85, 0.85, 0.82);
    matCeiling.update();

    const matDark = new pc.StandardMaterial();
    matDark.diffuse.set(0.15, 0.15, 0.18);
    matDark.update();

    const [cx, _cy, cz] = position;

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

    // Chão e Teto do Corredor
    helperBox(`hallway-floor-${id}`, matFloor, [cx, yFloor - 0.25, cz], [width, 0.5, length]);
    helperBox(`hallway-ceiling-${id}`, matCeiling, [cx, yFloor + height + 0.25, cz], [width, 0.5, length]);

    // Segmentos da Parede Oeste (x = cx - width/2 - 0.1 => 2.7 se cx=4.0 e width=2.4)
    westWallSegments.forEach(([startZ, endZ], idx) => {
      const segLen = endZ - startZ;
      const segCz = (startZ + endZ) / 2;
      helperBox(
        `hallway-wall-w-${idx}-${id}`,
        matWall,
        [cx - width / 2 - 0.1, yFloor + height / 2, segCz],
        [0.2, height, segLen]
      );
    });

    // Segmentos da Parede Leste (x = cx + width/2 + 0.1 => 5.3 se cx=4.0 e width=2.4)
    eastWallSegments.forEach(([startZ, endZ], idx) => {
      const segLen = endZ - startZ;
      const segCz = (startZ + endZ) / 2;
      helperBox(
        `hallway-wall-e-${idx}-${id}`,
        matWall,
        [cx + width / 2 + 0.1, yFloor + height / 2, segCz],
        [0.2, height, segLen]
      );
    });

    // Iluminação própria do corredor (duas lâmpadas omni)
    const zCoords = [cz - length * 0.25, cz + length * 0.25];
    zCoords.forEach((z) => {
      helperBox(`hallway-lamp-${z}-${id}`, matDark, [cx, yFloor + height - 0.1, z], [0.3, 0.08, 0.3]);

      const light = new pc.Entity(`hallway-light-${z}-${id}`);
      light.addComponent("light", {
        type: "omni",
        color: new pc.Color(1, 0.94, 0.85),
        intensity: 0.95,
        range: 6.0,
        castShadows: false, // Otimização: desativa sombras nos corredores para ganho de FPS
      });
      light.setPosition(cx, yFloor + height - 0.3, z);
      root.addChild(light);
    });

    // Renderiza as placas indicativas na parede (estilo Canvas 2D)
    signs.forEach((sInfo, sIdx) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.fillStyle = "#1e2330";
        ctx.fillRect(0, 0, 256, 64);

        // Borda colorida baseada na matéria
        const r = ((sInfo.borderHex >> 16) & 0xff).toString(16).padStart(2, "0");
        const g = ((sInfo.borderHex >> 8) & 0xff).toString(16).padStart(2, "0");
        const b = (sInfo.borderHex & 0xff).toString(16).padStart(2, "0");
        ctx.strokeStyle = `#${r}${g}${b}`;
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, 252, 60);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 20px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(sInfo.text, 128, 32);
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

      const signEntity = new pc.Entity(`hallway-sign-${sIdx}-${id}`);
      signEntity.addComponent("render", {
        type: "box",
        material: matSign,
      });

      // Se for placa oeste, encosta na parede oeste (x = cx - width/2).
      // Se for placa leste, encosta na parede leste (x = cx + width/2).
      const posX = sInfo.side === "west" ? cx - width / 2 + 0.02 : cx + width / 2 - 0.02;
      signEntity.setPosition(posX, yFloor + 2.0, sInfo.z);
      signEntity.setLocalScale(0.04, 0.3, 0.85);
      root.addChild(signEntity);
    });

    return () => {
      root.destroy();
    };
  }, [app, id, position, width, length, height, yFloor, westWallSegments, eastWallSegments, signs]);

  return null;
}
