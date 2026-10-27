import { fileURLToPath } from "node:url";
import { createComputeServer } from "./compute/http.mjs";
import { HeightStore } from "./heights/store.mjs";
const port = Number(process.env.UMBRA_COMPUTE_PORT ?? 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error("Invalid UMBRA_COMPUTE_PORT");
// Shared measurements live outside Git (.umbra-data/ is ignored). UMBRA_HEIGHTS=off disables them.
const heightsPath =
  process.env.UMBRA_HEIGHTS_DB ??
  fileURLToPath(new URL("../.umbra-data/heights.sqlite3", import.meta.url));
const heights =
  process.env.UMBRA_HEIGHTS === "off" ? null : new HeightStore(heightsPath);
const app = createComputeServer({ heights });
app.server.on("error", async (error) => {
  console.error(`Umbra server: ${error.message}`);
  await app.pool.close();
  process.exitCode = 1;
});
app.server.listen(port, "127.0.0.1", () => {
  console.log(`Umbra compute: http://127.0.0.1:${port} (city data warming up)`);
  process.send?.({ type: "listening" });
});
let stopping = false;
for (const event of ["SIGINT", "SIGTERM"])
  process.on(event, async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    heights?.close();
  });
