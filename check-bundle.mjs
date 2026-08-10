#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const normalize = (file) => readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");

const mirroredFiles = [
  ["skills/levelzzz-tracker/SKILL.md", "plugin/skills/levelzzz-tracker/SKILL.md"],
  [".app.json", "plugin/.app.json"],
];

for (const [source, bundled] of mirroredFiles) {
  if (normalize(source) !== normalize(bundled)) {
    throw new Error(`${bundled} is out of sync with ${source}`);
  }
}

console.log("[bundle] mirrored plugin files are in sync");
