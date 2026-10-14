/**
 * Estado do teclado. Usa event.code (posição física da tecla),
 * então funciona em teclados ABNT2, QWERTY, AZERTY etc.
 */
export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
}

export function createInput() {
  const state: InputState = {
    forward: false,
    back: false,
    left: false,
    right: false,
    run: false,
  };

  const apply = (code: string, down: boolean) => {
    switch (code) {
      case "KeyW":
      case "ArrowUp":
        state.forward = down;
        break;
      case "KeyS":
      case "ArrowDown":
        state.back = down;
        break;
      case "KeyA":
      case "ArrowLeft":
        state.left = down;
        break;
      case "KeyD":
      case "ArrowRight":
        state.right = down;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        state.run = down;
        break;
    }
  };

  const onKeyDown = (e: KeyboardEvent) => apply(e.code, true);
  const onKeyUp = (e: KeyboardEvent) => apply(e.code, false);
  const onBlur = () => {
    // evita tecla "presa" ao trocar de janela
    state.forward = state.back = state.left = state.right = state.run = false;
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  return {
    state,
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    },
  };
}
