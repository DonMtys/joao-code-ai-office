import * as pc from "playcanvas";
import { CHAIR, DESK } from "./world";

/**
 * "Computador" como objeto do cenário: mesa + monitor + cadeira.
 * A colisão correspondente (mesa e cadeira) está declarada em world.ts
 * (WALLS e CAMERA_OBSTACLES), então o personagem e a câmera não atravessam.
 * O ponto de interação por proximidade também vive em world.ts
 * (INTERACTION_POINTS, id "computador").
 */

function mat(hex: number, emissiveBoost = 0): pc.StandardMaterial {
  const m = new pc.StandardMaterial();
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  m.diffuse.set(r, g, b);
  if (emissiveBoost > 0) m.emissive.set(r * emissiveBoost, g * emissiveBoost, b * emissiveBoost);
  m.update();
  return m;
}

function box(
  app: pc.Application,
  name: string,
  material: pc.StandardMaterial,
  pos: [number, number, number],
  scale: [number, number, number]
): pc.Entity {
  const e = new pc.Entity(name);
  e.addComponent("render", {
    type: "box",
    material,
    castShadows: true,
    receiveShadows: true,
  });
  e.setLocalScale(scale[0], scale[1], scale[2]);
  e.setPosition(pos[0], pos[1], pos[2]);
  app.root.addChild(e);
  return e;
}

/** Monta a mesa com o computador (e a cadeira) no cenário. */
export function buildComputer(app: pc.Application): void {
  const matWood = mat(0x8a5a3b);
  const matDark = mat(0x2b2b31);
  const matScreen = mat(0x2f6fb3, 0.55); // tela levemente "acesa"

  // ---- mesa ----
  const deskCx = (DESK.minX + DESK.maxX) / 2;
  const deskCz = (DESK.minZ + DESK.maxZ) / 2;
  const deskW = DESK.maxX - DESK.minX;
  const deskD = DESK.maxZ - DESK.minZ;
  box(app, "mesa-tampo", matWood, [deskCx, DESK.height, deskCz], [deskW, 0.08, deskD]);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    box(
      app,
      `mesa-pe-${sx}-${sz}`,
      matWood,
      [deskCx + sx * deskW * 0.42, DESK.height / 2, deskCz + sz * deskD * 0.3],
      [0.08, DESK.height, 0.08]
    );
  }

  // ---- computador ----
  box(app, "pc-teclado", matDark, [deskCx, DESK.height + 0.05, deskCz + 0.12], [0.5, 0.04, 0.2]);
  box(app, "pc-pe", matDark, [deskCx, DESK.height + 0.12, deskCz - 0.22], [0.06, 0.14, 0.06]);
  box(app, "pc-tela", matScreen, [deskCx, DESK.height + 0.34, deskCz - 0.22], [0.52, 0.34, 0.04]);
  box(app, "pc-moldura", matDark, [deskCx, DESK.height + 0.34, deskCz - 0.24], [0.56, 0.38, 0.02]);

  // ---- cadeira ----
  const chairCx = (CHAIR.minX + CHAIR.maxX) / 2;
  const chairCz = (CHAIR.minZ + CHAIR.maxZ) / 2;
  box(app, "cadeira-assento", matWood, [chairCx, 0.45, chairCz], [0.55, 0.06, 0.55]);
  box(app, "cadeira-encosto", matWood, [chairCx, 0.75, chairCz + 0.25], [0.55, 0.6, 0.06]);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    box(app, `cadeira-pe-${sx}-${sz}`, matWood, [chairCx + sx * 0.22, 0.22, chairCz + sz * 0.22], [0.06, 0.45, 0.06]);
  }
}
