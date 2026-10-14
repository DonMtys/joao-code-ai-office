import { InteractiveDoor } from "./InteractiveDoor";

export function ExitDoor() {
  return (
    <InteractiveDoor
      id="porta-saida"
      position={[4.0, 0, 5.0]}
      width={1.2}
      height={2.2}
      thickness={0.08}
      hingeSide="left"
      openAngle={90}
      label="CORREDOR"
    />
  );
}
