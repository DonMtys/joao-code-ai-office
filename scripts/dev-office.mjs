import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const bridge = spawn(process.execPath, ["server/agent-office-bridge.mjs"], {
  stdio: "inherit",
});
const vite = spawn(npmCommand, ["run", "dev"], { stdio: "inherit" });

function stop() {
  bridge.kill();
  vite.kill();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
bridge.on("exit", (code) => {
  if (code && !vite.killed) vite.kill();
});
vite.on("exit", (code) => {
  if (!bridge.killed) bridge.kill();
  process.exit(code ?? 0);
});

