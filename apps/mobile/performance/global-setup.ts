import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { compileNativeStyles } from "./compile-native-styles.mjs";

export default async function setup() {
  await compileNativeStyles();
  const directory = fileURLToPath(new URL("../.reassure/", import.meta.url));
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}current.perf`, "");
}
