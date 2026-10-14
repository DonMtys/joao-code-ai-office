import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as pc from "playcanvas";
import { usePlayCanvas } from "../game/GameCanvas";
import { createHumanoid, type Humanoid } from "../game/engine/humanoid";

export const AGENT_MESSAGE_EVENT = "joao-code-agent-message";

export type AgentId =
  | "pesquisador"
  | "analista"
  | "comercial"
  | "executor"
  | "supervisor";

export interface AgentMessage {
  from: AgentId;
  to: AgentId;
  text: string;
  task?: string;
}

interface AgentDefinition {
  id: AgentId;
  name: string;
  role: string;
  color: string;
  shirtHex: number;
  home: [number, number];
}

type AgentStatus = "available" | "walking" | "waiting" | "talking" | "returning";
type TransportStatus = "connecting" | "live" | "offline";
type RunStatus = "idle" | "starting" | "running" | "completed" | "error";

interface OfficeStatusEvent {
  type: "office_status";
  status: "running" | "completed" | "error";
  text: string;
}

interface AgentRuntime extends AgentDefinition {
  entity: pc.Entity;
  humanoid: Humanoid;
  target: pc.Vec3;
  status: AgentStatus;
  bubble: string;
  yaw: number;
}

interface AgentOverlay {
  id: AgentId;
  name: string;
  role: string;
  color: string;
  status: AgentStatus;
  bubble: string;
  x: number;
  y: number;
  visible: boolean;
}

interface ActivityItem {
  id: number;
  from: string;
  to: string;
  text: string;
  task?: string;
}

interface ActiveExchange {
  message: AgentMessage;
  sender: AgentRuntime;
  receiver: AgentRuntime;
  phase: "walking" | "talking";
  finishAt: number;
}

const AGENTS: AgentDefinition[] = [
  {
    id: "pesquisador",
    name: "Pesquisador",
    role: "Mercado e inteligência",
    color: "#38bdf8",
    shirtHex: 0x0284c7,
    home: [-4, 3.8],
  },
  {
    id: "analista",
    name: "Analista",
    role: "Estratégia e marketing",
    color: "#a78bfa",
    shirtHex: 0x7c3aed,
    home: [-2, 4],
  },
  {
    id: "comercial",
    name: "Comercial",
    role: "Vendas e propostas",
    color: "#f59e0b",
    shirtHex: 0xd97706,
    home: [0.8, 4.2],
  },
  {
    id: "executor",
    name: "Executor",
    role: "Operações e suporte",
    color: "#34d399",
    shirtHex: 0x059669,
    home: [2, 4],
  },
  {
    id: "supervisor",
    name: "Supervisor",
    role: "Decisão e coordenação",
    color: "#fb7185",
    shirtHex: 0xe11d48,
    home: [4, 3.8],
  },
];

const DEMO_MESSAGES: AgentMessage[] = [
  {
    from: "pesquisador",
    to: "analista",
    task: "Pesquisa concluída",
    text: "Encontrei três oportunidades e os dados já estão na memória compartilhada.",
  },
  {
    from: "analista",
    to: "comercial",
    task: "Estratégia pronta",
    text: "A melhor oferta combina demonstração curta, prova social e entrada de baixo risco.",
  },
  {
    from: "comercial",
    to: "executor",
    task: "Proposta aprovada",
    text: "Prepare o fluxo de entrega e o checklist do cliente para a proposta escolhida.",
  },
  {
    from: "executor",
    to: "supervisor",
    task: "Operação validada",
    text: "Prazo, responsáveis e critérios de qualidade foram validados sem bloqueios.",
  },
  {
    from: "supervisor",
    to: "pesquisador",
    task: "Nova rodada",
    text: "Decisão registrada. Monitore o resultado e traga novos sinais para o time.",
  },
];

const MAX_EXTERNAL_QUEUE = 50;

const STATUS_LABEL: Record<AgentStatus, string> = {
  available: "Disponível",
  walking: "Indo conversar",
  waiting: "Aguardando",
  talking: "Trocando informação",
  returning: "Voltando",
};

export function sendAgentMessage(message: AgentMessage) {
  window.dispatchEvent(new CustomEvent<AgentMessage>(AGENT_MESSAGE_EVENT, { detail: message }));
}

function lerpAngle(current: number, target: number, amount: number) {
  let delta = ((target - current + 540) % 360) - 180;
  if (delta < -180) delta += 360;
  return current + delta * amount;
}

function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && AGENTS.some((agent) => agent.id === value);
}

function isOfficeStatusEvent(value: unknown): value is OfficeStatusEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<OfficeStatusEvent>;
  return (
    event.type === "office_status" &&
    (event.status === "running" || event.status === "completed" || event.status === "error") &&
    typeof event.text === "string"
  );
}

export function AgentOffice() {
  const app = usePlayCanvas();
  const [overlays, setOverlays] = useState<AgentOverlay[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [running, setRunning] = useState(true);
  const [transportStatus, setTransportStatus] = useState<TransportStatus>("connecting");
  const [objective, setObjective] = useState("");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runMessage, setRunMessage] = useState("");
  const runningRef = useRef(running);
  runningRef.current = running;
  const bridgeUrl =
    import.meta.env.VITE_AGENT_OFFICE_EVENTS_URL?.trim() ||
    "http://127.0.0.1:8765/events";
  const taskUrl = bridgeUrl.replace(/\/events(?:\?.*)?$/, "/tasks");

  const startRealTask = async () => {
    const cleanObjective = objective.trim();
    if (transportStatus !== "live" || cleanObjective.length < 3) return;
    setRunStatus("starting");
    setRunMessage("Iniciando os cinco agentes…");
    try {
      const response = await fetch(taskUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Joao-Code": "office-ui",
        },
        body: JSON.stringify({ objective: cleanObjective }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível iniciar a missão.");
      setRunStatus("running");
      setRunMessage("Missão enviada. Aguardando a primeira entrega…");
    } catch (error) {
      setRunStatus("error");
      setRunMessage(error instanceof Error ? error.message : "Falha ao iniciar a missão.");
    }
  };

  useEffect(() => {
    if (!app) return;

    const root = new pc.Entity("joao-code-agent-office");
    app.root.addChild(root);
    const runtimes: AgentRuntime[] = AGENTS.map((definition) => {
      const entity = new pc.Entity(`agent-${definition.id}`);
      root.addChild(entity);
      const humanoid = createHumanoid(entity, {
        shirtHex: definition.shirtHex,
        pantsHex: 0x1f2937,
      });
      humanoid.root.setLocalScale(0.9, 0.9, 0.9);
      entity.setPosition(definition.home[0], 0, definition.home[1]);
      return {
        ...definition,
        entity,
        humanoid,
        target: new pc.Vec3(definition.home[0], 0, definition.home[1]),
        status: "available",
        bubble: "",
        yaw: 0,
      };
    });

    const byId = new Map(runtimes.map((agent) => [agent.id, agent]));
    const externalQueue: AgentMessage[] = [];
    let active: ActiveExchange | null = null;
    let elapsed = 0;
    let nextExchangeAt = 1.5;
    let demoIndex = 0;
    let overlayAccumulator = 0;
    let activityId = 0;
    let bridgeConnected = false;

    const enqueueMessage = (detail: Partial<AgentMessage> | null | undefined) => {
      if (
        !detail ||
        !isAgentId(detail.from) ||
        !isAgentId(detail.to) ||
        detail.from === detail.to ||
        typeof detail.text !== "string" ||
        !detail.text.trim()
      ) {
        return;
      }
      externalQueue.push({
        from: detail.from,
        to: detail.to,
        text: detail.text.trim().slice(0, 180),
        task: typeof detail.task === "string" ? detail.task.trim().slice(0, 80) : undefined,
      });
      if (externalQueue.length > MAX_EXTERNAL_QUEUE) externalQueue.shift();
    };

    const onExternalMessage = (event: Event) => {
      enqueueMessage((event as CustomEvent<Partial<AgentMessage>>).detail);
    };
    window.addEventListener(AGENT_MESSAGE_EVENT, onExternalMessage);

    const eventSource = new EventSource(bridgeUrl);
    eventSource.onopen = () => {
      bridgeConnected = true;
      setTransportStatus("live");
    };
    eventSource.onerror = () => {
      bridgeConnected = false;
      setTransportStatus("offline");
    };
    eventSource.onmessage = (event) => {
      try {
        const message: unknown = JSON.parse(event.data);
        if (isOfficeStatusEvent(message)) {
          setRunStatus(message.status);
          setRunMessage(message.text);
          return;
        }
        enqueueMessage(message as Partial<AgentMessage>);
      } catch {
        // Eventos inválidos são ignorados sem interromper a animação.
      }
    };

    const nextMessage = () => {
      if (externalQueue.length) return externalQueue.shift()!;
      if (bridgeConnected) return null;
      const message = DEMO_MESSAGES[demoIndex % DEMO_MESSAGES.length];
      demoIndex += 1;
      return message;
    };

    const faceAgent = (agent: AgentRuntime, other: AgentRuntime) => {
      const position = agent.entity.getPosition();
      const target = other.entity.getPosition();
      agent.yaw = (Math.atan2(-(target.x - position.x), -(target.z - position.z)) * 180) / Math.PI;
      agent.entity.setEulerAngles(0, agent.yaw, 0);
    };

    const startExchange = (message: AgentMessage) => {
      const sender = byId.get(message.from);
      const receiver = byId.get(message.to);
      if (!sender || !receiver) return;
      const receiverPosition = receiver.entity.getPosition();
      const senderPosition = sender.entity.getPosition();
      const dx = senderPosition.x - receiverPosition.x;
      const dz = senderPosition.z - receiverPosition.z;
      const length = Math.hypot(dx, dz) || 1;
      sender.target.set(
        receiverPosition.x + (dx / length) * 0.85,
        0,
        receiverPosition.z + (dz / length) * 0.85
      );
      sender.status = "walking";
      receiver.status = "waiting";
      active = { message, sender, receiver, phase: "walking", finishAt: 0 };
    };

    const moveAgent = (agent: AgentRuntime, dt: number) => {
      const position = agent.entity.getPosition();
      const dx = agent.target.x - position.x;
      const dz = agent.target.z - position.z;
      const distance = Math.hypot(dx, dz);
      const moving = distance > 0.04;
      if (moving) {
        const speed = 1.05;
        const step = Math.min(distance, speed * dt);
        agent.entity.setPosition(
          position.x + (dx / distance) * step,
          0,
          position.z + (dz / distance) * step
        );
        const targetYaw = (Math.atan2(-dx, -dz) * 180) / Math.PI;
        agent.yaw = lerpAngle(agent.yaw, targetYaw, 1 - Math.exp(-10 * dt));
        agent.entity.setEulerAngles(0, agent.yaw, 0);
      } else if (agent.status === "returning") {
        agent.status = "available";
      }
      agent.humanoid.animate(dt, moving ? 0.58 : 0, false);
      return distance;
    };

    const updateOverlays = () => {
      const cameraEntity = app.root.findByName("camera") as pc.Entity | null;
      const camera = cameraEntity?.camera;
      const canvas = app.graphicsDevice.canvas as HTMLCanvasElement;
      if (!camera || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const deviceWidth = Math.max(1, app.graphicsDevice.width);
      const deviceHeight = Math.max(1, app.graphicsDevice.height);
      setOverlays(
        runtimes.map((agent) => {
          const world = agent.entity.getPosition().clone();
          world.y += 2.05;
          const screen = camera.worldToScreen(world);
          const x = (screen.x / deviceWidth) * rect.width;
          const y = (screen.y / deviceHeight) * rect.height;
          return {
            id: agent.id,
            name: agent.name,
            role: agent.role,
            color: agent.color,
            status: agent.status,
            bubble: agent.bubble,
            x,
            y,
            visible:
              screen.z > 0 &&
              x > -100 &&
              x < rect.width + 100 &&
              y > -100 &&
              y < rect.height + 100,
          };
        })
      );
    };

    const onUpdate = (rawDt: number) => {
      const dt = Math.min(rawDt, 1 / 30);

      if (runningRef.current) {
        elapsed += dt;
        if (!active && elapsed >= nextExchangeAt) {
          const message = nextMessage();
          if (message) startExchange(message);
          else nextExchangeAt = elapsed + 0.75;
        }
        runtimes.forEach((agent) => moveAgent(agent, dt));

        if (active?.phase === "walking") {
          const distance = active.sender.entity.getPosition().distance(active.sender.target);
          if (distance < 0.08) {
            active.phase = "talking";
            active.finishAt = elapsed + 3.6;
            active.sender.status = "talking";
            active.receiver.status = "talking";
            active.sender.bubble = active.message.text;
            active.receiver.bubble = "Recebido. Vou usar essa informação.";
            faceAgent(active.sender, active.receiver);
            faceAgent(active.receiver, active.sender);
            const delivered = active;
            setActivities((current) => [
              {
                id: ++activityId,
                from: delivered.sender.name,
                to: delivered.receiver.name,
                text: delivered.message.text,
                task: delivered.message.task,
              },
              ...current,
            ].slice(0, 5));
          }
        } else if (active?.phase === "talking" && elapsed >= active.finishAt) {
          active.sender.bubble = "";
          active.receiver.bubble = "";
          for (const agent of [active.sender, active.receiver]) {
            agent.target.set(agent.home[0], 0, agent.home[1]);
            agent.status = "returning";
          }
          active = null;
          nextExchangeAt = elapsed + 1.8;
        }
      } else {
        runtimes.forEach((agent) => agent.humanoid.animate(dt, 0, false));
      }

      overlayAccumulator += dt;
      if (overlayAccumulator >= 0.1) {
        overlayAccumulator = 0;
        updateOverlays();
      }
    };

    app.on("update", onUpdate);
    updateOverlays();
    return () => {
      eventSource.close();
      window.removeEventListener(AGENT_MESSAGE_EVENT, onExternalMessage);
      app.off("update", onUpdate);
      root.destroy();
    };
  }, [app]);

  return (
    <div style={overlayRootStyle}>
      {overlays.filter((agent) => agent.visible).map((agent) => (
        <div
          key={agent.id}
          style={{
            ...agentLabelStyle,
            left: agent.x,
            top: agent.y,
            borderColor: agent.color,
          }}
        >
          {agent.bubble && <div style={speechBubbleStyle}>{agent.bubble}</div>}
          <strong>{agent.name}</strong>
          <small style={agentRoleStyle}>{agent.role}</small>
          <span style={{ color: agent.color }}>{STATUS_LABEL[agent.status]}</span>
        </div>
      ))}

      <aside style={activityPanelStyle}>
        <div style={panelHeaderStyle}>
          <div>
            <strong>JOÃO CODE</strong>
            <small style={panelSubtitleStyle}>Agentes em atividade</small>
          </div>
          <button
            type="button"
            onClick={() => setRunning((value) => !value)}
            style={toggleButtonStyle}
          >
            {running ? "Pausar" : "Continuar"}
          </button>
        </div>
        <div style={agentCountStyle}>
          <span
            style={{
              ...onlineDotStyle,
              background: transportStatus === "live" ? "#34d399" : "#f59e0b",
              boxShadow: transportStatus === "live" ? "0 0 12px #34d399" : "0 0 12px #f59e0b",
            }}
          />{" "}
          {transportStatus === "live"
            ? `Canal real conectado · ${AGENTS.length} agentes visuais`
            : transportStatus === "connecting"
              ? "Conectando ao fluxo dos agentes…"
              : `${AGENTS.length} agentes visuais · demonstração local`}
        </div>
        <div style={missionFormStyle}>
          <label htmlFor="agent-office-objective" style={missionLabelStyle}>
            Missão para os agentes reais
          </label>
          <textarea
            id="agent-office-objective"
            value={objective}
            onChange={(event) => setObjective(event.target.value.slice(0, 2000))}
            placeholder="Ex.: analisem uma oportunidade e criem um plano de venda"
            rows={3}
            style={missionInputStyle}
            disabled={runStatus === "starting" || runStatus === "running"}
          />
          <button
            type="button"
            onClick={startRealTask}
            disabled={
              transportStatus !== "live" ||
              objective.trim().length < 3 ||
              runStatus === "starting" ||
              runStatus === "running"
            }
            style={{
              ...missionButtonStyle,
              opacity:
                transportStatus !== "live" ||
                objective.trim().length < 3 ||
                runStatus === "starting" ||
                runStatus === "running"
                  ? 0.5
                  : 1,
            }}
          >
            {runStatus === "starting"
              ? "Iniciando…"
              : runStatus === "running"
                ? "Agentes trabalhando…"
                : "Iniciar missão real"}
          </button>
          <small style={missionHintStyle}>
            {runMessage || "Usa o modelo configurado no AI Gateway e respeita o orçamento."}
          </small>
        </div>
        <div style={feedStyle}>
          {activities.length === 0 ? (
            <div style={emptyFeedStyle}>
              {transportStatus === "live"
                ? "Aguardando uma entrega real dos agentes…"
                : "A primeira troca demonstrativa começa em instantes…"}
            </div>
          ) : activities.map((activity) => (
            <div key={activity.id} style={activityStyle}>
              <small>{activity.task ?? "Informação compartilhada"}</small>
              <strong>{activity.from} → {activity.to}</strong>
              <span>{activity.text}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

const overlayRootStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  zIndex: 8,
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
};

const agentLabelStyle: CSSProperties = {
  position: "absolute",
  transform: "translate(-50%, -100%)",
  display: "grid",
  gap: 2,
  minWidth: 105,
  padding: "5px 9px",
  color: "white",
  fontSize: 11,
  textAlign: "center",
  background: "rgba(8, 15, 28, 0.9)",
  border: "1px solid",
  borderRadius: 10,
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.28)",
};

const speechBubbleStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "calc(100% + 8px)",
  width: 220,
  transform: "translateX(-50%)",
  padding: "9px 11px",
  color: "#102033",
  lineHeight: 1.35,
  background: "white",
  borderRadius: 12,
  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.22)",
};

const agentRoleStyle: CSSProperties = {
  maxWidth: 140,
  overflow: "hidden",
  color: "#cbd5e1",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const activityPanelStyle: CSSProperties = {
  position: "absolute",
  top: 18,
  right: 18,
  width: 310,
  overflow: "hidden",
  color: "#e5eefb",
  background: "rgba(7, 13, 24, 0.88)",
  border: "1px solid rgba(148, 163, 184, 0.24)",
  borderRadius: 16,
  boxShadow: "0 18px 50px rgba(0, 0, 0, 0.32)",
  backdropFilter: "blur(14px)",
  pointerEvents: "auto",
};

const panelHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 14px 10px",
};

const panelSubtitleStyle: CSSProperties = { display: "block", marginTop: 2, color: "#94a3b8" };
const agentCountStyle: CSSProperties = { padding: "0 14px 12px", color: "#a7f3d0", fontSize: 12 };
const missionFormStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  padding: "0 14px 14px",
};
const missionLabelStyle: CSSProperties = { color: "#dbeafe", fontSize: 11, fontWeight: 700 };
const missionInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  resize: "vertical",
  padding: "8px 9px",
  color: "#e5eefb",
  background: "rgba(15, 23, 42, 0.82)",
  border: "1px solid rgba(148, 163, 184, 0.3)",
  borderRadius: 8,
  font: "inherit",
};
const missionButtonStyle: CSSProperties = {
  padding: "8px 10px",
  color: "white",
  background: "#2563eb",
  border: 0,
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 700,
};
const missionHintStyle: CSSProperties = { color: "#94a3b8", lineHeight: 1.35 };
const onlineDotStyle: CSSProperties = {
  display: "inline-block",
  width: 8,
  height: 8,
  marginRight: 6,
  background: "#34d399",
  borderRadius: "50%",
  boxShadow: "0 0 12px #34d399",
};
const toggleButtonStyle: CSSProperties = {
  padding: "6px 10px",
  color: "#dbeafe",
  background: "rgba(59, 130, 246, 0.18)",
  border: "1px solid rgba(96, 165, 250, 0.38)",
  borderRadius: 8,
  cursor: "pointer",
};
const feedStyle: CSSProperties = { display: "grid", gap: 1, maxHeight: 310, overflowY: "auto" };
const emptyFeedStyle: CSSProperties = { padding: 14, color: "#94a3b8", fontSize: 12 };
const activityStyle: CSSProperties = {
  display: "grid",
  gap: 3,
  padding: "10px 14px",
  background: "rgba(15, 23, 42, 0.66)",
  borderTop: "1px solid rgba(148, 163, 184, 0.12)",
  fontSize: 11,
};
