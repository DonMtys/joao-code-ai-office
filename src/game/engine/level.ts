import * as pc from "playcanvas";
import {
  BOOKSHELF,
  CEILING_Y,
  MISSION_BOARD,
  ROOM_HALF_X,
  ROOM_HALF_Z,
  WALL_HEIGHT,
  WALL_THICKNESS,
} from "./world";
import { buildComputer } from "./computer";

function makeMaterial(hex: number, opacity = 1): pc.StandardMaterial {
  const m = new pc.StandardMaterial();
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  m.diffuse.set(r, g, b);
  if (opacity < 1) {
    m.opacity = opacity;
    m.blendType = pc.BLEND_NORMAL;
    m.emissive.set(r * 0.5, g * 0.5, b * 0.5);
  }
  m.update();
  return m;
}

function box(
  app: pc.Application,
  name: string,
  mat: pc.StandardMaterial,
  pos: [number, number, number],
  scale: [number, number, number],
  angles: [number, number, number] = [0, 0, 0]
): pc.Entity {
  const e = new pc.Entity(name);
  e.addComponent("render", {
    type: "box",
    material: mat,
    castShadows: true,
    receiveShadows: true,
  });
  e.setLocalScale(scale[0], scale[1], scale[2]);
  e.setPosition(pos[0], pos[1], pos[2]);
  e.setEulerAngles(angles[0], angles[1], angles[2]);
  app.root.addChild(e);
  return e;
}

/** Constrói o cenário visual do prédio. A colisão vive em world.ts. */
export function buildLevel(app: pc.Application): void {
  // luz direcional suave (sol)
  const sun = new pc.Entity("luz-sol");
  sun.addComponent("light", {
    type: "directional",
    color: new pc.Color(0.9, 0.94, 1),
    intensity: 0.65,
    castShadows: false,
  });
  sun.setEulerAngles(35, -70, 0);
  app.root.addChild(sun);

  app.scene.ambientLight = new pc.Color(0.4, 0.4, 0.42);
}
