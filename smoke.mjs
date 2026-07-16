#!/usr/bin/env node
// Локальный smoke-тест levelzzz-mcp: собирает пакет, поднимает сервер как child
// stdio-процесс, делает MCP-хендшейк, проверяет регистрацию всех 9 tools и вызывает
// list_tasks с фейковым ключом против недостижимого API (localhost:9) — сервер
// должен вернуть аккуратную текстовую ошибку, а не упасть.
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const mcpDir = path.dirname(fileURLToPath(import.meta.url));

console.log("[smoke] building (npx tsc)...");
execSync("npx tsc", { cwd: mcpDir, stdio: "inherit" });

// Не настоящий ключ: только чтобы пройти проверку "env задан" при старте сервера.
const NOT_A_REAL_KEY = ["asc", "SMOKE", "TEST", "PLACEHOLDER"].join("-");

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(mcpDir, "dist", "index.js")],
  env: {
    ...process.env,
    LEVELZZZ_API_URL: "http://localhost:9",
    LEVELZZZ_API_KEY: NOT_A_REAL_KEY,
  },
});

const client = new Client({ name: "levelzzz-mcp-smoke", version: "0.0.0" }, { capabilities: {} });

await client.connect(transport);
console.log("[smoke] handshake ok");

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
const expected = [
  "add_task",
  "complete_task",
  "delete_task",
  "get_guild",
  "get_history",
  "get_profile",
  "get_progress",
  "list_tasks",
  "update_task",
];
if (names.length !== expected.length || !expected.every((n) => names.includes(n))) {
  throw new Error(`unexpected tool set: ${names.join(", ")}`);
}
console.log(`[smoke] tools registered: ${names.join(", ")}`);

const result = await client.callTool({ name: "list_tasks", arguments: {} });
const text = result.content?.[0]?.text ?? "";
if (!result.isError || !text) {
  throw new Error(`expected graceful network error from list_tasks, got: ${JSON.stringify(result)}`);
}
console.log(`[smoke] list_tasks against unreachable API returned graceful error: "${text}"`);

await client.close();
console.log("[smoke] OK");
