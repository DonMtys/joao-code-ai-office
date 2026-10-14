import { Hallway } from "./Hallway";
import { SubjectRoom } from "./SubjectRoom";
import { AulaoRoom } from "./AulaoRoom";
import { CinemaScreen } from "./CinemaScreen";

export function GroundFloor() {
  return (
    <>
      {/* Corredor do Térreo */}
      <Hallway
        id="terreo"
        position={[4.0, 0.0, 10.0]}
        width={2.4}
        length={10.0}
        yFloor={0.0}
        westWallSegments={[
          [5.0, 9.4],
          [10.6, 13.0],
        ]}
        eastWallSegments={[
          [5.0, 9.4],
          [10.6, 15.0],
        ]}
        signs={[
          { text: "➔ PORTUGUÊS", z: 8.5, side: "west", borderHex: 0x3b82f6 },
          { text: "ASSIST. SOCIAL ➔", z: 11.5, side: "east", borderHex: 0xdb8a3a },
          { text: "➔ ESCADA (1º ANDAR)", z: 13.8, side: "west", borderHex: 0xeab308 },
          { text: "⬅ ARQUIVOLOGIA", z: 6.5, side: "west", borderHex: 0x8a5a3b },
        ]}
      />

      {/* 1. Sala de Arquivologia (Térreo - Sala de estudos original preservada) */}
      <SubjectRoom
        id="arquivologia"
        title="Sala de Arquivologia"
        position={[0, 0, 0]}
        width={12}
        length={10}
        accentColor={0x8a5a3b}
        doorPosition={[4.0, 0, 5.0]}
        doorHingeSide="left"
        doorOpenAngle={90}
        decorations="arquivologia"
        hasEstante={true}
        hasComputer={true}
        hasQuadro={true}
      />

      {/* 2. Sala de Português (Térreo - Lado Oeste) */}
      <SubjectRoom
        id="portugues"
        title="Sala de Português"
        position={[-0.2, 0, 10.0]}
        width={6.0}
        length={10.0}
        accentColor={0x3b82f6}
        doorPosition={[2.8, 0, 10.0]}
        doorHingeSide="left"
        doorOpenAngle={90}
        decorations="portugues"
      />

      {/* 3. Sala de Assistência Social (Térreo - Lado Leste) */}
      <SubjectRoom
        id="assistencia_social"
        title="Sala de Assistência Social"
        position={[8.2, 0, 10.0]}
        width={6.0}
        length={10.0}
        accentColor={0xe28a3a}
        doorPosition={[5.2, 0, 10.0]}
        doorHingeSide="right"
        doorOpenAngle={-90}
        decorations="assistencia_social"
      />

      {/* 4. Cinema AULÃO (Térreo - Lado Sul) */}
      <AulaoRoom />
      <CinemaScreen />
    </>
  );
}
