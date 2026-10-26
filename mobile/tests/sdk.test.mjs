import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const json = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

test("Umbra only enables native platforms and does not start a web target", () => {
  const config = json("../app.json");
  const manifest = json("../package.json");
  assert.deepEqual(config.expo.platforms, ["ios", "android"]);
  assert.equal(manifest.scripts.web, undefined);
  assert.equal(manifest.dependencies["react-native-web"], undefined);
});

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
    "react-native-webview",
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
