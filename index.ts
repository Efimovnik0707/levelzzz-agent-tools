#!/usr/bin/env node
// Ascend agent-tools: один файл, stdio MCP-сервер, без фреймворков поверх SDK.
// stdout зарезервирован под JSON-RPC — всё логирование только через console.error.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

const VERSION = "0.1.0";

const apiUrl = (process.env.ASCEND_API_URL || "http://localhost:3000").replace(/\/+$/, "");
const apiKey = process.env.ASCEND_API_KEY;
if (!apiKey) {
  console.error(
    "[ascend-mcp] ASCEND_API_KEY не задан. Создай ключ в профиле Ascend " +
      "(Профиль -> Агентский доступ -> Создать) и передай его в env ASCEND_API_KEY."
  );
  process.exit(1);
}

// --- HTTP-клиент -----------------------------------------------------------

interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
  retryAfterSec: number | null;
}

async function request(method: "GET" | "POST", path: string, body?: unknown): Promise<ApiResponse> {
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Ascend-Client": `ascend-mcp/${VERSION}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  const retryAfter = Number(res.headers.get("retry-after"));
  return {
    status: res.status,
    body: json as Record<string, unknown>,
    retryAfterSec: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
  };
}

// Мутации (complete/add_task): 429 -> подождать Retry-After (HTTP-заголовок) и повторить один раз (G-RV4).
async function mutate(path: string, body: unknown): Promise<ApiResponse> {
  const first = await request("POST", path, body);
  if (first.status !== 429) return first;
  await new Promise((resolve) => setTimeout(resolve, (first.retryAfterSec ?? 2) * 1000));
  return request("POST", path, body);
}

// --- Форматирование ---------------------------------------------------------

const TIER_ROMAN: Record<number, string> = { 1: "I", 2: "II", 3: "III" };
const tierLabel = (tier: unknown) => TIER_ROMAN[Number(tier)] ?? String(tier);

function errorText(status: number, body: Record<string, unknown>): string {
  if (status === 401) return "Ключ Ascend недействителен или отозван. Проверь ASCEND_API_KEY.";
  if (status === 403) return "Это не твоя задача.";
  if (status === 404) return "Задача не найдена.";
  if (status === 429) return "Ascend временно ограничивает частоту запросов, попробуй ещё раз через пару секунд.";
  const msg = typeof body.error === "string" ? body.error : `HTTP ${status}`;
  return `Ошибка Ascend: ${msg}`;
}

function ok(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

function fail(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

// --- Инструменты -------------------------------------------------------------

interface TaskRow {
  contract_task_id: string;
  title: string;
  tier: number;
  schedule_type: string;
  schedule_count: number;
  done_today: boolean;
}

async function listTasks(): Promise<CallToolResult> {
  const res = await request("GET", "/api/agent/v1/tasks");
  if (res.status !== 200) return fail(errorText(res.status, res.body));
  const tasks = (res.body.tasks as TaskRow[]) ?? [];
  if (tasks.length === 0) return ok("На сегодня задач в контракте нет.");
  const lines = tasks.map(
    (t) =>
      `${tierLabel(t.tier)} · ${t.title} — ${t.done_today ? "выполнена" : "не выполнена"} (id: ${t.contract_task_id})`
  );
  return ok(lines.join("\n"));
}

async function completeTask(args: { contract_task_id?: string; proof_text?: string }): Promise<CallToolResult> {
  if (!args.contract_task_id) return fail("Нужен contract_task_id (см. list_tasks).");
  const res = await mutate("/api/agent/v1/complete", {
    contract_task_id: args.contract_task_id,
    proof_text: args.proof_text,
  });
  if (res.status === 409) return ok("Уже отмечена сегодня.");
  if (res.status !== 200) return fail(errorText(res.status, res.body));

  const b = res.body;
  const parts: string[] = [];
  const xp = Number(b.xp_gained ?? 0);
  parts.push(`+${xp} XP${b.xp_capped ? " (капнуто)" : ""}`);
  const streakMult = Number(b.streak_mult ?? 1);
  if (streakMult > 1) parts.push(`стрик ×${streakMult}`);
  let text = parts.join(", ");
  const dmg = Number(b.boss_damage ?? 0);
  if (dmg > 0) text += `, боссу −${dmg}${b.damage_capped ? " (капнуто)" : ""}`;
  text += `. Уровень ${b.new_level}`;
  if (b.leveled_up) text += " (новый уровень!)";
  if (b.guild_boss_killed) text += ". Гильдейский босс повержен!";
  if (b.solo_boss_killed) text += ". Соло-босс повержен!";
  const achievements = (b.achievements_unlocked as string[]) ?? [];
  if (achievements.length > 0) text += `. Ачивки: ${achievements.join(", ")}`;
  return ok(text);
}

async function addTask(args: {
  preset_id?: string;
  title?: string;
  tier?: number;
  schedule_type?: string;
  schedule_count?: number;
}): Promise<CallToolResult> {
  if (!args.preset_id && !args.title?.trim()) {
    return fail("Нужен либо preset_id, либо title (с tier и schedule_type/schedule_count).");
  }
  const res = await mutate("/api/agent/v1/tasks", args);
  if (res.status === 409) return fail("В контракте уже 7 задач — лимит достигнут.");
  if (res.status !== 200) return fail(errorText(res.status, res.body));
  return ok(`Задача добавлена в контракт (id: ${res.body.contract_task_id}).`);
}

interface BossRow {
  scope: string;
  name: string;
  hp: number;
  hp_max: number;
}

async function getProgress(): Promise<CallToolResult> {
  const res = await request("GET", "/api/agent/v1/status");
  if (res.status !== 200) return fail(errorText(res.status, res.body));
  const b = res.body;
  const lines: string[] = [];
  lines.push(`Уровень ${b.level} (${b.title}). XP: ${b.xp}/${b.xp_to_next}.`);
  lines.push(`Стрик: ${b.streak} дней (×${b.streak_mult}).`);
  const bosses = (b.bosses as BossRow[]) ?? [];
  if (bosses.length > 0) {
    const scopeLabel = (s: string) => (s === "guild" ? "гильдия" : s === "solo" ? "соло" : s);
    lines.push(
      "Боссы: " + bosses.map((boss) => `${boss.name} (${scopeLabel(boss.scope)}) — ${Math.round(boss.hp)}/${Math.round(boss.hp_max)} HP`).join("; ")
    );
  }
  if (b.cohort_position !== null && b.cohort_position !== undefined) {
    lines.push(`Позиция в лиге: ${b.cohort_position}.`);
  }
  return ok(lines.join("\n"));
}

// --- Сервер -------------------------------------------------------------

const server = new Server({ name: "ascend-mcp", version: VERSION }, { capabilities: { tools: {} } });

const TOOLS: Tool[] = [
  {
    name: "list_tasks",
    description: "Список задач сегодняшнего контракта Ascend (с отметкой, выполнена ли уже).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "complete_task",
    description: "Отметить задачу Ascend выполненной. Требует contract_task_id из list_tasks.",
    inputSchema: {
      type: "object",
      properties: {
        contract_task_id: { type: "string", description: "id задачи из list_tasks" },
        proof_text: { type: "string", description: "необязательное текстовое подтверждение" },
      },
      required: ["contract_task_id"],
      additionalProperties: false,
    },
  },
  {
    name: "add_task",
    description: "Добавить новую задачу в контракт Ascend. Либо preset_id, либо title+tier+schedule_type.",
    inputSchema: {
      type: "object",
      properties: {
        preset_id: { type: "string" },
        title: { type: "string" },
        tier: { type: "integer", enum: [1, 2, 3], description: "1=быстрая, 2=основная, 3=ключевая" },
        schedule_type: { type: "string", enum: ["daily", "weekly_n", "oneshot"] },
        schedule_count: { type: "integer" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_progress",
    description: "Прогресс игрока Ascend: уровень, XP, стрик, боссы, позиция в лиге.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
  const { name, arguments: args } = req.params;
  try {
    switch (name) {
      case "list_tasks":
        return await listTasks();
      case "complete_task":
        return await completeTask((args ?? {}) as { contract_task_id?: string; proof_text?: string });
      case "add_task":
        return await addTask(
          (args ?? {}) as {
            preset_id?: string;
            title?: string;
            tier?: number;
            schedule_type?: string;
            schedule_count?: number;
          }
        );
      case "get_progress":
        return await getProgress();
      default:
        return fail(`Неизвестный инструмент: ${name}`);
    }
  } catch (err) {
    return fail(`Не удалось связаться с Ascend (${apiUrl}): ${err instanceof Error ? err.message : String(err)}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
