import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const host = process.env.AGENT_OFFICE_HOST || "127.0.0.1";
const port = Number(process.env.AGENT_OFFICE_PORT || 8765);
const eventFile = resolve(
  process.env.AGENT_OFFICE_EVENT_FILE ||
    "empresa-agentes-ia/storage/agent_office_events.jsonl"
);
const clients = new Set();
const seenIds = new Set();
let history = [];
let lastSignature = "";
let activeRun = null;

const projectRoot = resolve(".");
const agentsDirectory = resolve(projectRoot, "backend");
const defaultWindowsPython = resolve(agentsDirectory, "venv/Scripts/python.exe");
const pythonExecutable =
  process.env.AGENT_OFFICE_PYTHON ||
  (existsSync(defaultWindowsPython)
    ? defaultWindowsPython
    : process.platform === "win32"
      ? "python"
      : "python3");
const taskRunner = resolve(
  process.env.AGENT_OFFICE_RUNNER ||
    resolve(agentsDirectory, "run_agent_office_task.py")
);

function validEvent(event) {
  const agents = new Set(["pesquisador", "analista", "comercial", "executor", "supervisor"]);
  if (
    event?.type === "office_status" &&
    ["running", "completed", "error"].includes(event.status) &&
    typeof event.text === "string"
  ) {
    return true;
  }
  return (
    event &&
    event.type === "agent_handoff" &&
    agents.has(event.from) &&
    agents.has(event.to) &&
    event.from !== event.to &&
    typeof event.text === "string"
  );
}

function localOriginAllowed(origin) {
  return !origin || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 16_384) reject(new Error("payload_too_large"));
    });
    request.on("end", () => {
      try {
        resolveBody(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    request.on("error", reject);
  });
}

function broadcastRunnerError(text) {
  broadcast({
    version: 1,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type: "office_status",
    status: "error",
    text,
    source: "joao_code_bridge",
  });
}

function sendEvent(response, event) {
  response.write(`id: ${event.id}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function broadcast(event) {
  history = [...history, event].slice(-30);
  for (const client of clients) sendEvent(client, event);
}

async function readNewEvents() {
  try {
    const info = await stat(eventFile);
    const signature = `${info.size}:${info.mtimeMs}`;
    if (signature === lastSignature) return;
    lastSignature = signature;
    const lines = (await readFile(eventFile, "utf8")).split(/\r?\n/).filter(Boolean);
    for (const line of lines.slice(-500)) {
      try {
        const event = JSON.parse(line);
        if (!validEvent(event) || seenIds.has(event.id)) continue;
        seenIds.add(event.id);
        broadcast(event);
      } catch {
        // Uma linha parcial será relida depois da próxima gravação.
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") console.error("[agent-office]", error.message);
  }
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (localOriginAllowed(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin || "http://127.0.0.1:5173");
  }
  response.setHeader("Cache-Control", "no-store");

  if (request.method === "OPTIONS") {
    if (!localOriginAllowed(origin)) {
      response.statusCode = 403;
      response.end();
      return;
    }
    response.writeHead(204, {
      "Access-Control-Allow-Headers": "Content-Type, X-Joao-Code",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(
      JSON.stringify({ status: "ok", clients: clients.size, taskRunning: Boolean(activeRun) })
    );
    return;
  }

  if (request.method === "POST" && request.url === "/tasks") {
    if (
      !localOriginAllowed(origin) ||
      request.headers["x-joao-code"] !== "office-ui" ||
      !request.headers["content-type"]?.startsWith("application/json")
    ) {
      sendJson(response, 403, { error: "Origem ou cabeçalho inválido." });
      return;
    }
    if (activeRun) {
      sendJson(response, 409, { error: "Os agentes já estão executando uma missão." });
      return;
    }

    try {
      const body = await readJsonBody(request);
      const objective = typeof body.objective === "string" ? body.objective.trim() : "";
      if (objective.length < 3 || objective.length > 2000) {
        sendJson(response, 400, { error: "A missão precisa ter entre 3 e 2.000 caracteres." });
        return;
      }

      const child = spawn(pythonExecutable, [taskRunner, objective], {
        cwd: agentsDirectory,
        env: { ...process.env, PYTHONUTF8: "1" },
        stdio: "ignore",
        windowsHide: true,
      });
      activeRun = child;
      child.once("error", () => {
        activeRun = null;
        broadcastRunnerError("Não foi possível iniciar o processo dos agentes.");
      });
      child.once("exit", () => {
        if (activeRun === child) activeRun = null;
      });
      sendJson(response, 202, { status: "started" });
    } catch (error) {
      const statusCode = error?.message === "payload_too_large" ? 413 : 400;
      sendJson(response, statusCode, { error: "Não foi possível ler a missão." });
    }
    return;
  }

  if (request.method === "GET" && request.url?.startsWith("/events")) {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.write(": joao-code-agent-office\n\n");
    clients.add(response);
    for (const event of history.slice(-10)) sendEvent(response, event);
    request.on("close", () => clients.delete(response));
    return;
  }

  response.statusCode = 404;
  response.end("Not found");
});

await readNewEvents();
const poller = setInterval(readNewEvents, 400);
const keepAlive = setInterval(() => {
  for (const client of clients) client.write(": keep-alive\n\n");
}, 15000);

server.listen(port, host, () => {
  console.log(`[agent-office] bridge local em http://${host}:${port}/events`);
});

function shutdown() {
  clearInterval(poller);
  clearInterval(keepAlive);
  for (const client of clients) client.end();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

