import { createComputeServer } from "./compute/http.mjs";
const port = Number(process.env.UMBRA_COMPUTE_PORT ?? 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error("Invalid UMBRA_COMPUTE_PORT");
const app = createComputeServer();
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
  });
