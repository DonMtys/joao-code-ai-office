import { Hallway } from "./Hallway";
import { SubjectRoom } from "./SubjectRoom";
import { SimulationArena } from "./SimulationArena";

export function FirstFloor() {
  return (
    <>
      {/* Corredor do Primeiro Andar */}
      <Hallway
        id="superior"
        position={[4.0, 3.0, 10.0]}
        width={2.4}
        length={10.0}
        yFloor={3.0}
        westWallSegments={[
          [7.0, 9.4],
          [10.6, 15.0],
        ]}
        eastWallSegments={[
          [5.0, 9.4],
          [10.6, 15.0],
        ]}
        signs={[
          { text: "➔ D. CONSTITUCIONAL", z: 8.5, side: "west", borderHex: 0x10b981 },
          { text: "GESTÃO MATERIAIS ➔", z: 11.5, side: "east", borderHex: 0x6b7280 },
          { text: "➔ ESCADA (TÉRREO)", z: 6.5, side: "west", borderHex: 0xeab308 },
          { text: "⬅ D. ADMINISTRATIVO", z: 5.5, side: "west", borderHex: 0xa855f7 },
        ]}
      />

      {/* 1. Sala de Direito Administrativo (1º Andar - Lado Norte) */}
      <SubjectRoom
        id="direito_adm"
        title="Sala de Direito Administrativo"
        position={[0, 3.0, 0]}
        width={12}
        length={10}
        accentColor={0xa855f7}
        doorPosition={[4.0, 3.0, 5.0]}
        doorHingeSide="left"
        doorOpenAngle={90}
        decorations="direito_adm"
      />

      {/* 2. Sala de Direito Constitucional (1º Andar - Lado Oeste) */}
      <SubjectRoom
        id="direito_const"
        title="Sala de Direito Constitucional"
        position={[-0.2, 3.0, 10.0]}
        width={6.0}
        length={10.0}
        accentColor={0x10b981}
        doorPosition={[2.8, 3.0, 10.0]}
        doorHingeSide="left"
        doorOpenAngle={90}
        decorations="direito_const"
      />

      {/* 3. Sala de Gestão de Materiais (1º Andar - Lado Leste) */}
      <SubjectRoom
        id="gestao_mat"
        title="Sala de Gestão de Materiais"
        position={[8.2, 3.0, 10.0]}
        width={6.0}
        length={10.0}
        accentColor={0x6b7280}
        doorPosition={[5.2, 3.0, 10.0]}
        doorHingeSide="right"
        doorOpenAngle={-90}
        decorations="gestao_mat"
      />

      {/* 4. Arena de Simulados (1º Andar - Lado Sul) */}
      <SimulationArena />
    </>
  );
}
