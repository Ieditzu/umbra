import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { HeightStore } from "./store.mjs";

// Moderation and export for the shared heights database (§6.8).
// Usage (from the repository root):
//   node --experimental-strip-types server/heights/admin.mjs queue
//   node --experimental-strip-types server/heights/admin.mjs accept <measurement-id>
//   node --experimental-strip-types server/heights/admin.mjs reject <measurement-id>
//   node --experimental-strip-types server/heights/admin.mjs building way/123
//   node --experimental-strip-types server/heights/admin.mjs export heights.json
const path =
  process.env.UMBRA_HEIGHTS_DB ??
  fileURLToPath(new URL("../../.umbra-data/heights.sqlite3", import.meta.url));
const [command, arg] = process.argv.slice(2);
const store = new HeightStore(path);
try {
  if (command === "queue") {
    const queue = store.queue();
    if (!queue.length) console.log("No measurements need review.");
    for (const m of queue)
      console.log(
        `${m.id}  ${m.osm_building}  ${m.method}  ${m.height_m} ± ${m.sigma_m} m  ` +
          `sun ${m.sun_elevation_deg}°  ${m.measured_on}  ${m.reason}` +
          `${m.levels ? `  levels ${m.levels}` : ""}`,
      );
  } else if (command === "accept" || command === "reject") {
    if (!arg) throw Error("Missing measurement id");
    if (!store.review(arg, command === "accept" ? "accepted" : "rejected"))
      throw Error(`Unknown measurement ${arg}`);
    console.log(`${arg}: ${command}ed`);
  } else if (command === "building") {
    console.log(JSON.stringify(store.building(arg), null, 2));
  } else if (command === "export") {
    const file = JSON.stringify(store.exportFile(), null, 2);
    if (arg) writeFileSync(arg, file);
    else console.log(file);
  } else {
    console.log(
      "Commands: queue | accept <id> | reject <id> | building <osm id> | export [file]",
    );
    process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  store.close();
}
