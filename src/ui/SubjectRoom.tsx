import { useEffect } from "react";
import * as pc from "playcanvas";
import { usePlayCanvas } from "../game/GameCanvas";
import { InteractiveDoor } from "./InteractiveDoor";
import { addDynamicInteraction, removeDynamicInteraction, type InteractionPoint } from "../game/engine/world";
import { buildComputer } from "../game/engine/computer";

interface Props {
  id: string;
  title: string;
  position: [number, number, number]; // [cx, cy, cz]
  width: number;
  length: number;
  height?: number;
  accentColor: number; // hex color
  doorPosition: [number, number, number];
  doorHingeSide: "left" | "right";
  doorOpenAngle: number;
  decorations?: "portugues" | "arquivologia" | "assistencia_social" | "direito_adm" | "direito_const" | "gestao_mat";
  hasEstante?: boolean;
  hasComputer?: boolean;
  hasQuadro?: boolean;
}

export function SubjectRoom({
  id,
  title,
  position,
  width,
  length,
  height = 3.0,
  accentColor,
  doorPosition,
  doorHingeSide,
  doorOpenAngle,
  decorations,
  hasEstante = false,
  hasComputer = false,
  hasQuadro = false,
}: Props) {
  const app = usePlayCanvas();

  // Registra ponto de interação para estudar a matéria (exceto Arquivologia, que mantém computador)
  useEffect(() => {
    if (!app || hasComputer) return;

    const interactionId = `sala-${id}`;
    const point: InteractionPoint = {
      id: interactionId,
      x: position[0],
      z: position[2],
      radius: 1.8,
      prompt: `Pressione E para estudar ${title.replace("Sala de ", "")}`,
    };

    addDynamicInteraction(point);

    return () => {
      removeDynamicInteraction(interactionId);
    };
  }, [app, id, position, title, hasComputer]);

  // Monta a geometria 3D no PlayCanvas
  useEffect(() => {
    if (!app) return;

    const root = new pc.Entity(`room-root-${id}`);
    app.root.addChild(root);

    // Helpers
    const hexToColor = (hex: number) => {
      const r = ((hex >> 16) & 0xff) / 255;
      const g = ((hex >> 8) & 0xff) / 255;
      const b = (hex & 0xff) / 255;
      return new pc.Color(r, g, b);
    };

    const makeMaterial = (hex: number, opacity = 1) => {
      const m = new pc.StandardMaterial();
      m.diffuse = hexToColor(hex);
      if (opacity < 1) {
        m.opacity = opacity;
        m.blendType = pc.BLEND_NORMAL;
      }
      m.update();
      return m;
    };

    const box = (
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

    // Materiais
    const matFloor = makeMaterial(0xcdbfa6); // madeira clara
    const matWall = makeMaterial(0xede7da); // bege neutro
    const matCeiling = makeMaterial(0xf5f2ea); // teto claro
    const matAccent = makeMaterial(accentColor);
    const matSlate = makeMaterial(0x1e2530); // quadro negro/verde
    const matWood = makeMaterial(0x8a5a3b); // moveis
    const matMetal = makeMaterial(0xcccccc);

    const [cx, cy, cz] = position;
    const t = 0.5; // espessura de parede

    // Floor and Ceiling
    box(`room-floor-${id}`, matFloor, [cx, cy - 0.25, cz], [width, 0.5, length]);
    box(`room-ceiling-${id}`, matCeiling, [cx, cy + height + 0.25, cz], [width, 0.5, length]);

    // Lógica para desenhar paredes deixando o vão para a porta
    // Identifica em qual parede a porta está localizada comparando coordenadas
    const doorX = doorPosition[0];
    const doorZ = doorPosition[2];

    const isDoorOnNorth = Math.abs(doorZ - (cz - length / 2)) < 0.2;
    const isDoorOnSouth = Math.abs(doorZ - (cz + length / 2)) < 0.2;
    const isDoorOnWest = Math.abs(doorX - (cx - width / 2)) < 0.2;
    const isDoorOnEast = Math.abs(doorX - (cx + width / 2)) < 0.2;

    const doorW = 1.2;

    // Parede Norte (z = cz - length/2)
    if (isDoorOnNorth) {
      const leftW = (doorX - doorW / 2) - (cx - width / 2);
      box(`room-wall-n-1-${id}`, matWall, [cx - width / 2 + leftW / 2, cy + height / 2, cz - length / 2], [leftW, height, t]);
      const rightW = (cx + width / 2) - (doorX + doorW / 2);
      box(`room-wall-n-2-${id}`, matWall, [cx + width / 2 - rightW / 2, cy + height / 2, cz - length / 2], [rightW, height, t]);
    } else {
      box(`room-wall-n-${id}`, matWall, [cx, cy + height / 2, cz - length / 2], [width, height, t]);
    }

    // Parede Sul (z = cz + length/2)
    if (isDoorOnSouth) {
      const leftW = (doorX - doorW / 2) - (cx - width / 2);
      box(`room-wall-s-1-${id}`, matWall, [cx - width / 2 + leftW / 2, cy + height / 2, cz + length / 2], [leftW, height, t]);
      const rightW = (cx + width / 2) - (doorX + doorW / 2);
      box(`room-wall-s-2-${id}`, matWall, [cx + width / 2 - rightW / 2, cy + height / 2, cz + length / 2], [rightW, height, t]);
    } else {
      box(`room-wall-s-${id}`, matWall, [cx, cy + height / 2, cz + length / 2], [width, height, t]);
    }

    // Parede Oeste (x = cx - width/2)
    if (isDoorOnWest) {
      const northW = (doorZ - doorW / 2) - (cz - length / 2);
      box(`room-wall-w-1-${id}`, matWall, [cx - width / 2, cy + height / 2, cz - length / 2 + northW / 2], [t, height, northW]);
      const southW = (cz + length / 2) - (doorZ + doorW / 2);
      box(`room-wall-w-2-${id}`, matWall, [cx - width / 2, cy + height / 2, cz + length / 2 - southW / 2], [t, height, southW]);
    } else {
      box(`room-wall-w-${id}`, matWall, [cx - width / 2, cy + height / 2, cz], [t, height, length]);
    }

    // Parede Leste (x = cx + width/2)
    if (isDoorOnEast) {
      const northW = (doorZ - doorW / 2) - (cz - length / 2);
      box(`room-wall-e-1-${id}`, matWall, [cx + width / 2, cy + height / 2, cz - length / 2 + northW / 2], [t, height, northW]);
      const southW = (cz + length / 2) - (doorZ + doorW / 2);
      box(`room-wall-e-2-${id}`, matWall, [cx + width / 2, cy + height / 2, cz + length / 2 - southW / 2], [t, height, southW]);
    } else {
      box(`room-wall-e-${id}`, matWall, [cx + width / 2, cy + height / 2, cz], [t, height, length]);
    }

    // ---- Iluminação Própria ----
    const lamp = new pc.Entity(`room-lamp-${id}`);
    lamp.addComponent("light", {
      type: "omni",
      color: new pc.Color(1, 0.97, 0.88),
      intensity: 1.2,
      range: 8.0,
      castShadows: false, // Otimização: desativa sombras em salas menores
    });
    lamp.setPosition(cx, cy + height - 0.3, cz);
    root.addChild(lamp);

    // ---- Elemento Comum: Lousa / Quadro-Negro na parede norte ----
    box(`room-blackboard-frame-${id}`, matWood, [cx, cy + 1.5, cz - length / 2 + 0.08], [3.2, 1.4, 0.04]);
    box(`room-blackboard-slate-${id}`, matSlate, [cx, cy + 1.5, cz - length / 2 + 0.10], [3.0, 1.2, 0.02]);

    // ---- Decoração Específica / Preservação de Objetos ----
    if (decorations === "arquivologia" && hasComputer && hasEstante && hasQuadro) {
      // Preservar itens originais da Sala de Estudos (mesa, computador, cadeira)
      // Usando o módulo original de buildComputer
      const oldDeskCx = -4.3; // original desk center
      const oldDeskCz = -4.15; // original desk center
      
      // Mesa visual da Arquivologia
      box("mesa-tampo", matWood, [-4.3, 0.78, -4.15], [2.0, 0.08, 0.9]);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        box(`mesa-pe-${sx}-${sz}`, matWood, [-4.3 + sx * 0.84, 0.39, -4.15 + sz * 0.27], [0.08, 0.78, 0.08]);
      }
      // PC visual
      box("pc-teclado", matSlate, [-4.3, 0.83, -4.03], [0.5, 0.04, 0.2]);
      box("pc-pe", matSlate, [-4.3, 0.9, -4.37], [0.06, 0.14, 0.06]);
      box("pc-tela", makeMaterial(0x2f6fb3), [-4.3, 1.12, -4.37], [0.52, 0.34, 0.04]);
      box("pc-moldura", matSlate, [-4.3, 1.12, -4.39], [0.56, 0.38, 0.02]);

      // Cadeira visual
      box("cadeira-assento", matWood, [-4.25, 0.45, -3.2], [0.55, 0.06, 0.55]);
      box("cadeira-encosto", matWood, [-4.25, 0.75, -2.95], [0.55, 0.6, 0.06]);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        box(`cadeira-pe-${sx}-${sz}`, matWood, [-4.25 + sx * 0.22, 0.22, -3.2 + sz * 0.22], [0.06, 0.45, 0.06]);
      }

      // Estante
      box("estante-corpo", matWood, [4.95, 1.15, -4.3], [1.3, 2.3, 0.8]);
      const matBook = [0xb03a3a, 0x3a7d44, 0x3a5db0, 0xc9a227].map((c) => makeMaterial(c));
      for (let i = 0; i < 3; i++) {
        const shelfY = 0.55 + i * 0.65;
        box(`estante-prateleira-${i}`, makeMaterial(0x5c3b26), [4.95, shelfY, -3.88], [1.25, 0.04, 0.5]);
        for (let b = 0; b < 5; b++) {
          box(`livro-${i}-${b}`, matBook[(i + b) % matBook.length], [4.95 - 0.4 + b * 0.2, shelfY + 0.13, -3.88], [0.09, 0.26 + (b % 2) * 0.05, 0.4]);
        }
      }

      // Quadro
      box("quadro-moldura", makeMaterial(0xffffff), [0, 1.6, -4.94], [2.3, 1.7, 0.06]);
      box("quadro-fundo", makeMaterial(0xdb8a3a), [0, 1.6, -4.91], [2.2, 1.6, 0.03]);

    } else {
      // Móveis genéricos simples e decorativos para outras salas
      // Mesa do professor
      box(`room-teacher-desk-${id}`, matWood, [cx - width * 0.2, cy + 0.35, cz - length * 0.2], [1.4, 0.7, 0.7]);
      box(`room-teacher-chair-${id}`, matSlate, [cx - width * 0.2, cy + 0.4, cz - length * 0.28], [0.45, 0.8, 0.45]);

      // Carteira de aluno
      box(`room-student-desk-${id}`, matWood, [cx + width * 0.15, cy + 0.35, cz + length * 0.15], [0.8, 0.7, 0.6]);
      box(`room-student-chair-${id}`, matSlate, [cx + width * 0.15, cy + 0.4, cz + length * 0.22], [0.4, 0.8, 0.4]);

      // Elementos estéticos baseados na matéria
      if (decorations === "portugues") {
        // Livro gigante aberto sobre a mesa (decorativo)
        box(`room-decor-book-${id}`, matAccent, [cx - width * 0.2, cy + 0.72, cz - length * 0.2], [0.35, 0.04, 0.45]);
        box(`room-decor-page-${id}`, makeMaterial(0xffffff), [cx - width * 0.2, cy + 0.75, cz - length * 0.2], [0.32, 0.02, 0.42]);
      } else if (decorations === "assistencia_social") {
        // Corações decorativos ou símbolo sutil (usando cubos coloridos rosa/azul)
        box(`room-decor-social-${id}`, matAccent, [cx + width * 0.3, cy + 1.2, cz - length * 0.3], [0.3, 0.3, 0.3]);
      } else if (decorations === "direito_adm") {
        // Balança simples de cubos metalizados (Balança da Justiça)
        box(`room-decor-scale-base-${id}`, matSlate, [cx - width * 0.2, cy + 0.72, cz - length * 0.2], [0.2, 0.02, 0.2]);
        box(`room-decor-scale-v-${id}`, matMetal, [cx - width * 0.2, cy + 0.9, cz - length * 0.2], [0.04, 0.35, 0.04]);
        box(`room-decor-scale-h-${id}`, matMetal, [cx - width * 0.2, cy + 1.05, cz - length * 0.2], [0.3, 0.04, 0.04]);
      } else if (decorations === "direito_const") {
        // Uma Constituição gigante na parede (livro 3D azul e verde)
        box(`room-decor-const-cover-${id}`, matAccent, [cx - width * 0.35, cy + 1.5, cz - length * 0.35], [0.45, 0.6, 0.06]);
      } else if (decorations === "gestao_mat") {
        // Caixas de papelão empilhadas no canto (Gestão de Materiais!)
        const matCardboard = makeMaterial(0xcca37a); // cor papelão
        box(`room-decor-box-1-${id}`, matCardboard, [cx + width * 0.3, cy + 0.2, cz - length * 0.3], [0.4, 0.4, 0.4]);
        box(`room-decor-box-2-${id}`, matCardboard, [cx + width * 0.3, cy + 0.6, cz - length * 0.28], [0.35, 0.35, 0.35]);
        box(`room-decor-box-3-${id}`, matCardboard, [cx + width * 0.25, cy + 0.2, cz - length * 0.25], [0.38, 0.38, 0.38]);
      }
    }

    return () => {
      root.destroy();
    };
  }, [app, id, position, width, length, height, accentColor, doorPosition, decorations, hasComputer, hasEstante, hasQuadro]);

  return (
    <InteractiveDoor
      id={`porta-${id}`}
      position={doorPosition}
      width={1.2}
      height={2.2}
      thickness={0.08}
      hingeSide={doorHingeSide}
      openAngle={doorOpenAngle}
      label={title.replace("Sala de ", "").toUpperCase()}
    />
  );
}
