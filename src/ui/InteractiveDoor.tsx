import { useEffect, useState } from "react";
import * as pc from "playcanvas";
import { usePlayCanvas } from "../game/GameCanvas";
import {
  addDynamicCollider,
  removeDynamicCollider,
  addDynamicInteraction,
  removeDynamicInteraction,
  type WallAABB,
  type Box3,
  type InteractionPoint,
} from "../game/engine/world";

interface Props {
  id: string;
  position: [number, number, number];
  width: number;
  height: number;
  thickness: number;
  hingeSide: "left" | "right";
  openAngle: number;
  label: string;
  initialOpen?: boolean;
}

export function InteractiveDoor({
  id,
  position,
  width,
  height,
  thickness,
  hingeSide,
  openAngle,
  label,
  initialOpen = false,
}: Props) {
  const app = usePlayCanvas();
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [hingeEntity, setHingeEntity] = useState<pc.Entity | null>(null);

  // Escuta o evento customizado "interact" disparado pela tecla E no App.tsx
  useEffect(() => {
    const handleInteract = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      if (customEvent.detail.id === id) {
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener("interact", handleInteract);
    return () => window.removeEventListener("interact", handleInteract);
  }, [id]);

  // Registra / Atualiza o colisor dinâmico dependendo do estado da porta
  useEffect(() => {
    if (!app) return;

    const halfW = width / 2;
    const halfT = thickness / 2;

    const colliderBox: WallAABB = {
      minX: position[0] - halfW,
      maxX: position[0] + halfW,
      minZ: position[2] - halfT,
      maxZ: position[2] + halfT,
      minY: position[1],
      maxY: position[1] + height,
    };

    const cameraBox: Box3 = {
      minX: position[0] - halfW,
      maxX: position[0] + halfW,
      minY: position[1],
      maxY: position[1] + height,
      minZ: position[2] - halfT,
      maxZ: position[2] + halfT,
    };

    const colliderId = `door-collider-${id}`;

    // Colisão ativa quando a porta está fechada
    addDynamicCollider({
      id: colliderId,
      box: colliderBox,
      cameraBox,
      enabled: !isOpen,
    });

    return () => {
      removeDynamicCollider(colliderId);
    };
  }, [app, id, isOpen, position, width, height, thickness]);

  // Registra / Atualiza o ponto de interação com base no estado da porta
  useEffect(() => {
    if (!app) return;

    const promptText = isOpen
      ? `Pressione E para fechar a porta (${label.toLowerCase()})`
      : `Pressione E para abrir a porta (${label.toLowerCase()})`;

    const point: InteractionPoint = {
      id,
      x: position[0],
      z: position[2],
      radius: 1.8,
      prompt: promptText,
    };

    addDynamicInteraction(point);

    return () => {
      removeDynamicInteraction(id);
    };
  }, [app, id, isOpen, position, label]);

  // Cria as entidades visuais 3D da porta no PlayCanvas
  useEffect(() => {
    if (!app) return;

    const root = new pc.Entity(`door-root-${id}`);
    app.root.addChild(root);

    // Hinge (Pivô da dobradiça) na lateral da porta
    const hinge = new pc.Entity(`door-hinge-${id}`);
    const hingeXOffset = hingeSide === "left" ? -width / 2 : width / 2;
    hinge.setLocalPosition(position[0] + hingeXOffset, position[1], position[2]);
    root.addChild(hinge);
    setHingeEntity(hinge);

    // Materiais
    const matWoodDark = new pc.StandardMaterial();
    matWoodDark.diffuse.set(0.36, 0.23, 0.15); // madeira escura
    matWoodDark.update();

    const matFrame = new pc.StandardMaterial();
    matFrame.diffuse.set(0.9, 0.9, 0.9); // batente claro
    matFrame.update();

    const matBrass = new pc.StandardMaterial();
    matBrass.diffuse.set(0.8, 0.65, 0.2); // maçaneta dourada
    matBrass.update();

    // Folha da porta (filha do pivô)
    const leaf = new pc.Entity(`door-leaf-${id}`);
    leaf.addComponent("render", {
      type: "box",
      material: matWoodDark,
      castShadows: true,
      receiveShadows: true,
    });
    // O offset local da folha em relação à dobradiça é metade da sua largura
    const leafXOffset = hingeSide === "left" ? width / 2 : -width / 2;
    leaf.setLocalPosition(leafXOffset, height / 2, 0);
    leaf.setLocalScale(width, height, thickness);
    hinge.addChild(leaf);

    // Maçaneta
    const handle = new pc.Entity(`door-handle-${id}`);
    handle.addComponent("render", {
      type: "box",
      material: matBrass,
      castShadows: false,
      receiveShadows: false,
    });
    // Posiciona no lado oposto à dobradiça
    const handleX = hingeSide === "left" ? width - 0.12 : -width + 0.12;
    handle.setLocalPosition(handleX, height / 2, 0.08);
    handle.setLocalScale(0.04, 0.12, 0.04);
    hinge.addChild(handle);

    // Maçaneta lado de trás
    const handleBack = new pc.Entity(`door-handle-back-${id}`);
    handleBack.addComponent("render", {
      type: "box",
      material: matBrass,
      castShadows: false,
      receiveShadows: false,
    });
    handleBack.setLocalPosition(handleX, height / 2, -0.08);
    handleBack.setLocalScale(0.04, 0.12, 0.04);
    hinge.addChild(handleBack);

    // Placa superior (indicativa)
    const sign = new pc.Entity(`door-sign-${id}`);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#1b212c";
      ctx.fillRect(0, 0, 256, 64);
      ctx.strokeStyle = "#db8a3a";
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 252, 60);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 26px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 128, 32);
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
      castShadows: false,
      receiveShadows: true,
    });
    sign.setLocalPosition(position[0], position[1] + height + 0.22, position[2]);
    sign.setLocalScale(0.8, 0.22, 0.06);
    root.addChild(sign);

    // Batentes (moldura da porta)
    const frameThickness = 0.1;
    const frameL = new pc.Entity(`door-frame-l-${id}`);
    frameL.addComponent("render", { type: "box", material: matFrame });
    frameL.setLocalPosition(position[0] - width / 2 - frameThickness / 2, position[1] + height / 2, position[2]);
    frameL.setLocalScale(frameThickness, height, thickness + 0.04);
    root.addChild(frameL);

    const frameR = new pc.Entity(`door-frame-r-${id}`);
    frameR.addComponent("render", { type: "box", material: matFrame });
    frameR.setLocalPosition(position[0] + width / 2 + frameThickness / 2, position[1] + height / 2, position[2]);
    frameR.setLocalScale(frameThickness, height, thickness + 0.04);
    root.addChild(frameR);

    const frameT = new pc.Entity(`door-frame-t-${id}`);
    frameT.addComponent("render", { type: "box", material: matFrame });
    frameT.setLocalPosition(position[0], position[1] + height + frameThickness / 2, position[2]);
    frameT.setLocalScale(width + frameThickness * 2, frameThickness, thickness + 0.04);
    root.addChild(frameT);

    // Preenchimento de parede acima da moldura até o teto (y = 3)
    const wallPlugHeight = 3.0 - (height + frameThickness);
    if (wallPlugHeight > 0.05) {
      const matWall = new pc.StandardMaterial();
      const hex = 0xede7da; // cor neutra da parede
      const r = ((hex >> 16) & 0xff) / 255;
      const g = ((hex >> 8) & 0xff) / 255;
      const b = (hex & 0xff) / 255;
      matWall.diffuse.set(r, g, b);
      matWall.update();

      const plug = new pc.Entity(`door-plug-${id}`);
      plug.addComponent("render", { type: "box", material: matWall });
      plug.setLocalPosition(position[0], position[1] + height + frameThickness + wallPlugHeight / 2, position[2]);
      plug.setLocalScale(width + frameThickness * 2, wallPlugHeight, 0.5); // espessura da parede da sala
      root.addChild(plug);
    }

    return () => {
      root.destroy();
    };
  }, [app, id, position, width, height, thickness, hingeSide, label]);

  // Loop de animação da porta (rotação da dobradiça no update)
  useEffect(() => {
    if (!app || !hingeEntity) return;

    const targetAngle = isOpen ? openAngle : 0;
    let currentAngle = hingeEntity.getLocalEulerAngles().y;
    if (currentAngle > 180) currentAngle -= 360;

    let active = true;

    const onUpdate = (dt: number) => {
      if (!active) return;
      const diff = targetAngle - currentAngle;
      if (Math.abs(diff) > 0.1) {
        currentAngle += diff * (1 - Math.exp(-8 * dt));
        hingeEntity.setLocalEulerAngles(0, currentAngle, 0);
      } else {
        currentAngle = targetAngle;
        hingeEntity.setLocalEulerAngles(0, currentAngle, 0);
      }
    };

    app.on("update", onUpdate);

    return () => {
      active = false;
      app.off("update", onUpdate);
    };
  }, [app, hingeEntity, isOpen, openAngle]);

  return null;
}
