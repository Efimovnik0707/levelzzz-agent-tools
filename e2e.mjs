// E2E goal 5 (G4.1): реальный прогон MCP-инструментов против dev-сервера.
// Запуск: node e2e.mjs  (env LEVELZZZ_API_URL + LEVELZZZ_API_KEY обязательны).
// Ключ НЕ печатается. Скрипт: list_tasks → complete_task(первая невыполненная)
// → повторный complete_task (ожидаем «уже отмечена») → get_progress.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const url = process.env.LEVELZZZ_API_URL;
const key = process.env.LEVELZZZ_API_KEY;
if (!url || !key) {
  console.error("[e2e] нужны LEVELZZZ_API_URL и LEVELZZZ_API_KEY");
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js"],
  env: { ...process.env, LEVELZZZ_API_URL: url, LEVELZZZ_API_KEY: key },
});
const client = new Client({ name: "levelzzz-e2e", version: "0.0.1" });
await client.connect(transport);
console.log("[e2e] handshake ok");

const text = (r) => r.content?.map((c) => c.text).join("\n") ?? "";

const list = await client.callTool({ name: "list_tasks", arguments: {} });
console.log("[e2e] list_tasks:\n" + text(list));

// Вытащить id первой невыполненной задачи из человекочитаемого вывода (id: <uuid>).
const m = text(list).match(/не выполнена[^\n]*\(id:\s*([0-9a-f-]{36})\)/i) ||
          text(list).match(/\(id:\s*([0-9a-f-]{36})\)/i);
if (!m) {
  console.error("[e2e] не нашёл id задачи в выводе list_tasks");
  process.exit(1);
}
const taskId = m[1];
console.log("[e2e] беру задачу", taskId);

const done = await client.callTool({ name: "complete_task", arguments: { contract_task_id: taskId } });
console.log("[e2e] complete_task #1:\n" + text(done));

const again = await client.callTool({ name: "complete_task", arguments: { contract_task_id: taskId } });
console.log("[e2e] complete_task #2 (дубль):\n" + text(again));

const prog = await client.callTool({ name: "get_progress", arguments: {} });
console.log("[e2e] get_progress:\n" + text(prog));

await client.close();
console.log("[e2e] OK");
