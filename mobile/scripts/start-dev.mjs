import { fork, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const port = Number(process.env.UMBRA_COMPUTE_PORT ?? 8000);
let backend = null,
  metro = null,
  stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of [metro, backend])
    if (child && child.exitCode === null) child.kill("SIGTERM");
  const force = setTimeout(() => {
    for (const child of [metro, backend])
      if (child && child.exitCode === null) child.kill("SIGKILL");
  }, 5000);
  force.unref();
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
try {
  let existing = false;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(800),
    });
    const health = await response.json();
    if (health.service !== "umbra-compute" || health.schema_version !== 1)
      throw Error("Portul de calcul este ocupat de alt serviciu.");
    existing = true;
    console.log("Umbra: using the running compute server.");
  } catch (error) {
    if (error.message.includes("ocupat")) throw error;
  }
  if (!existing) {
    backend = fork(
      new URL("../../server/mobile-api.mjs", import.meta.url),
      [],
      {
        execArgv: ["--experimental-strip-types"],
        stdio: ["ignore", "inherit", "inherit", "ipc"],
        env: process.env,
      },
    );
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error("Server startup timed out")),
        10000,
      );
      backend.once("message", () => {
        clearTimeout(timeout);
        resolve();
      });
      backend.once("exit", () => {
        clearTimeout(timeout);
        reject(Error("Serverul de calcul nu a pornit. Verifică portul 8000."));
      });
      backend.once("error", reject);
    });
  }
  metro = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("node_modules/expo/bin/cli", root)),
      "start",
      ...process.argv.slice(2),
    ],
    { cwd: fileURLToPath(root), stdio: "inherit", env: process.env },
  );
  metro.on("error", (error) => {
    console.error(error.message);
    void stop(1);
  });
  metro.on("exit", (code) => void stop(code ?? 0));
  backend?.on("exit", (code) => {
    if (!stopping) {
      console.error("Umbra compute server stopped.");
      void stop(code || 1);
    }
  });
} catch (error) {
  console.error(error.message);
  await stop(1);
}
