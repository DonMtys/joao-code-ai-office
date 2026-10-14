import { GroundFloor } from "./GroundFloor";
import { FirstFloor } from "./FirstFloor";
import { Staircase } from "./Staircase";

export function SchoolBuilding() {
  return (
    <>
      <GroundFloor />
      <FirstFloor />
      <Staircase />
    </>
  );
}
