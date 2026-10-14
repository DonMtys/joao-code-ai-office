import * as pc from "playcanvas";

/**
 * Personagem humanoide low-poly montado só com caixas — nenhum modelo externo.
 * Braços e pernas têm pivôs no ombro/quadril para a animação de passada.
 */

export interface Humanoid {
  root: pc.Entity;
  /**
   * @param dt        delta de tempo
   * @param moveAmount 0 = parado … 1 = velocidade máxima de corrida
   * @param running   segurando Shift
   */
  animate(dt: number, moveAmount: number, running: boolean): void;
}

export interface HumanoidStyle {
  skinHex?: number;
  shirtHex?: number;
  pantsHex?: number;
  shoesHex?: number;
  hairHex?: number;
}

function mat(r: number, g: number, b: number): pc.StandardMaterial {
  const m = new pc.StandardMaterial();
  m.diffuse.set(r, g, b);
  m.update();
  return m;
}

function styledMat(hex: number | undefined, fallback: [number, number, number]) {
  if (hex === undefined) return mat(...fallback);
  return mat(
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255
  );
}

function part(
  parent: pc.Entity,
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
    receiveShadows: false,
  });
  e.setLocalScale(scale[0], scale[1], scale[2]);
  e.setLocalPosition(pos[0], pos[1], pos[2]);
  parent.addChild(e);
  return e;
}

/** Pivô vazio (para rotacionar membros pelo ombro/quadril). */
function pivot(parent: pc.Entity, name: string, pos: [number, number, number]): pc.Entity {
  const e = new pc.Entity(name);
  e.setLocalPosition(pos[0], pos[1], pos[2]);
  parent.addChild(e);
  return e;
}

export function createHumanoid(parent: pc.Entity, style: HumanoidStyle = {}): Humanoid {
  const skin = styledMat(style.skinHex, [0.87, 0.68, 0.53]);
  const shirt = styledMat(style.shirtHex, [0.2, 0.4, 0.82]);
  const pants = styledMat(style.pantsHex, [0.2, 0.22, 0.3]);
  const shoes = styledMat(style.shoesHex, [0.12, 0.12, 0.14]);
  const hair = styledMat(style.hairHex, [0.25, 0.17, 0.1]);

  // raiz do modelo (origem nos pés, frente = -Z)
  const root = new pc.Entity("humanoide");
  parent.addChild(root);

  // corpo superior balança levemente ao respirar/correr
  const upperBody = pivot(root, "corpo-superior", [0, 0.86, 0]);

  // tronco (0.86 → 1.36)
  part(upperBody, "tronco", shirt, [0, 0.25, 0], [0.46, 0.5, 0.26]);
  // quadril
  part(root, "quadril", pants, [0, 0.8, 0], [0.42, 0.16, 0.25]);

  // cabeça + cabelo (indica a frente)
  part(upperBody, "cabeca", skin, [0, 0.66, 0], [0.26, 0.26, 0.26]);
  part(upperBody, "cabelo", hair, [0, 0.78, 0.02], [0.28, 0.1, 0.28]);
  part(upperBody, "franja", hair, [0, 0.7, -0.12], [0.28, 0.08, 0.06]);

  // braços: pivô no ombro (y = 1.32 do chão => 0.46 acima do corpo-superior)
  const shoulderL = pivot(upperBody, "ombro-esq", [-0.31, 0.44, 0]);
  const shoulderR = pivot(upperBody, "ombro-dir", [0.31, 0.44, 0]);
  part(shoulderL, "braco-esq", shirt, [0, -0.18, 0], [0.13, 0.36, 0.13]);
  part(shoulderL, "mao-esq", skin, [0, -0.42, 0], [0.12, 0.14, 0.12]);
  part(shoulderR, "braco-dir", shirt, [0, -0.18, 0], [0.13, 0.36, 0.13]);
  part(shoulderR, "mao-dir", skin, [0, -0.42, 0], [0.12, 0.14, 0.12]);

  // pernas: pivô no quadril (y = 0.78)
  const hipL = pivot(root, "quadril-esq", [-0.13, 0.78, 0]);
  const hipR = pivot(root, "quadril-dir", [0.13, 0.78, 0]);
  part(hipL, "perna-esq", pants, [0, -0.32, 0], [0.16, 0.6, 0.16]);
  part(hipL, "pe-esq", shoes, [0, -0.66, -0.04], [0.16, 0.12, 0.26]);
  part(hipR, "perna-dir", pants, [0, -0.32, 0], [0.16, 0.6, 0.16]);
  part(hipR, "pe-dir", shoes, [0, -0.66, -0.04], [0.16, 0.12, 0.26]);

  let phase = 0; // fase da passada
  let idleT = 0; // tempo do idle (respiração)
  let blend = 0; // 0 = idle … 1 = andando (suaviza a transição)

  const animate = (dt: number, moveAmount: number, running: boolean) => {
    idleT += dt;

    // transição suave entre parado e andando
    const target = Math.min(1, moveAmount * 1.4);
    blend += (target - blend) * (1 - Math.exp(-10 * dt));

    // frequência da passada: mais rápida correndo
    const freq = running ? 11 : 7;
    phase += dt * freq * (0.35 + 0.65 * blend);

    // amplitude dos membros (graus)
    const legAmp = (running ? 42 : 28) * blend;
    const armAmp = (running ? 36 : 22) * blend;
    const swing = Math.sin(phase);

    hipL.setLocalEulerAngles(swing * legAmp, 0, 0);
    hipR.setLocalEulerAngles(-swing * legAmp, 0, 0);
    shoulderL.setLocalEulerAngles(-swing * armAmp, 0, 4 * blend + 2);
    shoulderR.setLocalEulerAngles(swing * armAmp, 0, -4 * blend - 2);

    // idle: respiração sutil + leve inclinação ao correr
    const breathe = Math.sin(idleT * 2.2) * 0.008 * (1 - blend);
    const bob = Math.abs(Math.cos(phase)) * 0.035 * blend;
    const lean = (running ? 8 : 4) * blend;
    upperBody.setLocalPosition(0, 0.86 + breathe + bob, 0);
    upperBody.setLocalEulerAngles(lean, 0, 0);
  };

  return { root, animate };
}
