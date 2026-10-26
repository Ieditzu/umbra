import { DecodeUTF8, Gunzip } from "fflate";
import type { RawDataset } from "./data.ts";
import type { Task } from "./task.ts";

export type PackedDataset = {
  format: "umbra-gzip-json-v1";
  raw_bytes: number;
  payload: string;
};
const alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const lookup = new Int16Array(128).fill(-1);
for (let i = 0; i < alphabet.length; i++) lookup[alphabet.charCodeAt(i)] = i;

// No Buffer, atob, native module or network dependency on the phone.
function decodeBase64(part: string): Uint8Array {
  const padding = part.endsWith("==") ? 2 : part.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array((part.length / 4) * 3 - padding);
  let at = 0;
  for (let i = 0; i < part.length; i += 4) {
    const a = lookup[part.charCodeAt(i)] ?? -1,
      b = lookup[part.charCodeAt(i + 1)] ?? -1;
    const c =
      part[i + 2] === "=" && i + 2 >= part.length - padding
        ? 0
        : (lookup[part.charCodeAt(i + 2)] ?? -1);
    const d =
      part[i + 3] === "=" && i + 3 >= part.length - padding
        ? 0
        : (lookup[part.charCodeAt(i + 3)] ?? -1);
    if (a < 0 || b < 0 || c < 0 || d < 0)
      throw new Error("Codificarea datelor locale nu este validă.");
    const value = (a << 18) | (b << 12) | (c << 6) | d;
    if (at < bytes.length) bytes[at++] = (value >>> 16) & 255;
    if (at < bytes.length) bytes[at++] = (value >>> 8) & 255;
    if (at < bytes.length) bytes[at++] = value & 255;
  }
  return bytes;
}

/** Stream the bundled gzip in short slices instead of compiling 40 MB of literals. */
export async function unpackDataset(
  packed: PackedDataset,
  work: Task,
): Promise<RawDataset> {
  work.check();
  if (
    !packed ||
    packed.format !== "umbra-gzip-json-v1" ||
    !Number.isSafeInteger(packed.raw_bytes) ||
    packed.raw_bytes < 1 ||
    packed.raw_bytes > 100_000_000 ||
    typeof packed.payload !== "string" ||
    !packed.payload.length ||
    packed.payload.length % 4 !== 0 ||
    packed.payload.length > 40_000_000
  )
    throw new Error("Pachetul de date locale nu este valid.");
  const text: string[] = [];
  let bytes = 0,
    complete = false;
  const utf8 = new DecodeUTF8((part) => text.push(part));
  const inflater = new Gunzip((part, final) => {
    bytes += part.length;
    if (bytes > packed.raw_bytes)
      throw new Error("Pachetul local depășește dimensiunea declarată.");
    utf8.push(part, final);
    if (final) complete = true;
  });
  for (let i = 0; i < packed.payload.length; i += 16384) {
    await work.checkpoint();
    const end = Math.min(i + 16384, packed.payload.length);
    inflater.push(
      decodeBase64(packed.payload.slice(i, end)),
      end === packed.payload.length,
    );
  }
  work.check();
  if (!complete || bytes !== packed.raw_bytes)
    throw new Error("Pachetul local este incomplet.");
  const result = JSON.parse(text.join("")) as RawDataset;
  work.check();
  return result;
}
