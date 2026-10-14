import { useEffect } from "react";
import * as pc from "playcanvas";
import { usePlayCanvas } from "../game/GameCanvas";

export function Staircase() {
  const app = usePlayCanvas();

  useEffect(() => {
    if (!app) return;

    const root = new pc.Entity("staircase-root");
    app.root.addChild(root);

    // Materiais
    const matStep = new pc.StandardMaterial();
    matStep.diffuse.set(0.45, 0.3, 0.2); // madeira escura clássica para os degraus
    matStep.update();

    const matRailing = new pc.StandardMaterial();
    matRailing.diffuse.set(0.12, 0.12, 0.15); // metal escuro para o corrimão
    matRailing.update();

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

    // Parâmetros da escada (z de 15.0 a 7.0, x de 0.4 a 2.4, y de 0 a 3)
    const startZ = 15.0;
    const endZ = 7.0;
    const lenZ = startZ - endZ; // 8.0
    const stepCount = 15;
    const stepWidth = 2.0;
    const stepHeight = 3.0 / stepCount; // 0.2
    const stepDepth = lenZ / stepCount;  // 0.533

    const cx = 1.4; // centro X da escada (média entre 0.4 e 2.4)

    // Degraus procedurais
    for (let i = 0; i < stepCount; i++) {
      const sY = i * stepHeight + stepHeight / 2;
      const sZ = startZ - i * stepDepth - stepDepth / 2;
      helperBox(
        `stair-step-${i}`,
        matStep,
        [cx, sY, sZ],
        [stepWidth, stepHeight, stepDepth]
      );
    }

    // Corrimão / Guarda-corpo na lateral leste (x = 2.4)
    // Dividido em 4 painéis que sobem diagonalmente
    const panelCount = 4;
    const panelLenZ = lenZ / panelCount; // 2.0
    const panelHeightY = 3.0 / panelCount; // 0.75
    const railingHeight = 0.9; // altura do corrimão a partir dos degraus

    for (let j = 0; j < panelCount; j++) {
      const pZ = startZ - j * panelLenZ - panelLenZ / 2;
      const pY = j * panelHeightY + panelHeightY / 2 + railingHeight / 2;
      
      // Painel visual do corrimão (placa metálica escura)
      helperBox(
        `stair-railing-panel-${j}`,
        matRailing,
        [2.4, pY, pZ],
        [0.06, railingHeight, panelLenZ]
      );

      // Barra superior do corrimão (apoio para mão)
      helperBox(
        `stair-railing-topbar-${j}`,
        matRailing,
        [2.4, pY + railingHeight / 2, pZ],
        [0.08, 0.05, panelLenZ]
      );
    }

    return () => {
      root.destroy();
    };
  }, [app]);

  return null;
}
