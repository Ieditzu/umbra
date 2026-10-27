import { fork, spawn } from "node:child_process";
import { watch } from "node:fs";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const port = Number(process.env.UMBRA_COMPUTE_PORT ?? 8000);
let backend = null,
  metro = null,
  stopping = false,
  restarting = false,
  queued = false,
  debounce;
const watchers = [];
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  clearTimeout(debounce);
  for (const watcher of watchers) watcher.close();
  for (const child of [metro, backend])
    if (child && child.exitCode === null) child.kill("SIGTERM");
  setTimeout(() => {
    for (const child of [metro, backend])
      if (child && child.exitCode === null) child.kill("SIGKILL");
  }, 5000).unref();
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
async function startBackend() {
  if (stopping) return;
  const child = fork(
    new URL("../../server/mobile-api.mjs", import.meta.url),
    [],
    {
      execArgv: ["--experimental-strip-types"],
      stdio: ["ignore", "inherit", "inherit", "ipc"],
      env: process.env,
    },
  );
  backend = child;
  await new Promise((resolve, reject) => {
    let ready = false;
    const timeout = setTimeout(
      () => reject(Error("Server startup timed out")),
      10000,
    );
    child.once("message", () => {
      ready = true;
      clearTimeout(timeout);
      resolve();
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", () => {
      clearTimeout(timeout);
      if (!ready)
        reject(
          Error(
            "Serverul de calcul nu a pornit. Verifică portul și dependențele.",
          ),
        );
      else if (!stopping && child === backend && !restarting) {
        console.error("Backend stopped; restarting.");
        scheduleRestart();
      }
    });
  });
}
async function restartBackend() {
  if (stopping) return;
  if (restarting) {
    queued = true;
    return;
  }
  restarting = true;
  try {
    do {
      queued = false;
      const previous = backend;
      backend = null;
      console.log("Umbra: reloading backend calculations.");
      if (
        previous &&
        previous.exitCode === null &&
        previous.signalCode === null
      )
        await new Promise((resolve) => {
          const timer = setTimeout(() => previous.kill("SIGKILL"), 5000);
          previous.once("exit", () => {
            clearTimeout(timer);
            resolve();
          });
          previous.kill("SIGTERM");
        });
      await startBackend();
    } while (queued && !stopping);
  } catch (error) {
    console.error(error.message);
  } finally {
    restarting = false;
  }
}
function scheduleRestart() {
  clearTimeout(debounce);
  debounce = setTimeout(() => void restartBackend(), 600);
}
try {
  let existing = false;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(800),
    });
    const health = await response.json();
    if (health.service !== "umbra-compute" || health.schema_version !== 1)
      throw Error("Portul de calcul este ocupat de alt serviciu.");
    if (!health.capabilities?.includes("shadow_measurement"))
      throw Error(
        "Rulează o versiune veche a serverului. Oprește comanda veche cu Ctrl+C și repornește npm start.",
      );
    existing = true;
    console.log("Umbra: using the running compute server.");
  } catch (error) {
    if (
      error.message.includes("ocupat") ||
      error.message.includes("versiune veche")
    )
      throw error;
  }
  if (!existing) {
    await startBackend();
    for (const folder of ["../../server/", "../src/engine/", "../src/domain/"])
      watchers.push(
        watch(
          new URL(folder, import.meta.url),
          { recursive: true },
          (_, name) => {
            const file = String(name ?? "");
            if (/\.(mjs|ts)$/.test(file) && !file.includes(".test."))
              scheduleRestart();
          },
        ),
      );
  }
  if (!stopping) {
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
  }
} catch (error) {
  console.error(error.message);
  await stop(1);
}
