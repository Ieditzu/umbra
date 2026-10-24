import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const json = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

test("project and installed runtime match the iPhone Expo Go SDK 58", () => {
  const manifest = json("../package.json");
  const installedExpo = json("../node_modules/expo/package.json");
  const bundled = json("../node_modules/expo/bundledNativeModules.json");
  assert.match(manifest.dependencies.expo, /^[~^]?58\./);
  assert.match(installedExpo.version, /^58\./);
  assert.equal(manifest.main, "expo-router/entry");
  for (const name of [
    "react",
    "react-dom",
    "react-native",
    "react-native-maps",
    "react-native-reanimated",
    "react-native-worklets",
    "@react-native-community/datetimepicker",
  ]) {
    assert.equal(
      manifest.dependencies[name],
      bundled[name],
      `${name} must use the SDK's bundled version`,
    );
  }
});
