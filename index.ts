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

// Дефолт: прод Ascend — пользователю достаточно одного ключа. ASCEND_API_URL
// остаётся переопределением (self-host, локальная разработка); при смене
// домена прода меняем дефолт здесь и в публичном репо.
const DEFAULT_API_URL = "https://ascend-teal-nine.vercel.app";
const apiUrl = (process.env.ASCEND_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
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

async function request(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<ApiResponse> {
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

// Мутации (complete/add_task/delete_task/update_task): 429 -> подождать Retry-After
// (HTTP-заголовок) и повторить один раз (G-RV4).
async function mutate(path: string, body: unknown, method: "POST" | "PATCH" | "DELETE" = "POST"): Promise<ApiResponse> {
  const first = await request(method, path, body);
  if (first.status !== 429) return first;
  await new Promise((resolve) => setTimeout(resolve, (first.retryAfterSec ?? 2) * 1000));
  return request(method, path, body);
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

async function deleteTask(args: { contract_task_id?: string }): Promise<CallToolResult> {
  if (!args.contract_task_id) return fail("Нужен contract_task_id (см. list_tasks).");
  const res = await mutate(`/api/agent/v1/tasks/${args.contract_task_id}`, undefined, "DELETE");
  if (res.status === 409) return fail("У задачи уже есть выполнение на этой неделе — удалять нельзя, используй замену (update_task).");
  if (res.status !== 200) return fail(errorText(res.status, res.body));
  return ok("Задача удалена.");
}

async function updateTask(args: {
  contract_task_id?: string;
  title?: string;
  tier?: number;
  schedule_type?: string;
  schedule_count?: number;
  preset_id?: string;
}): Promise<CallToolResult> {
  if (!args.contract_task_id) return fail("Нужен contract_task_id (см. list_tasks).");
  if (!args.preset_id && !args.title?.trim()) return fail("Нужен либо preset_id, либо title.");
  const { contract_task_id, ...body } = args;
  const res = await mutate(`/api/agent/v1/tasks/${contract_task_id}`, body, "PATCH");
  if (res.status !== 200) return fail(errorText(res.status, res.body));
  const charged = Number(res.body.charged ?? 0);
  return ok(`Задача обновлена${charged > 0 ? ` (списано ${charged} кристаллов)` : " (бесплатно)"}.`);
}

async function getProfile(): Promise<CallToolResult> {
  const res = await request("GET", "/api/agent/v1/profile");
  if (res.status !== 200) return fail(errorText(res.status, res.body));
  const b = res.body;
  const lines: string[] = [];
  lines.push(`${b.handle} (${b.display_name}) — уровень ${b.level} (${b.title}), ранг ${b.rank}.`);
  lines.push(`XP всего: ${b.total_xp}, до следующего уровня: ${b.xp}/${b.xp_to_next}.`);
  lines.push(`Стрик: ${b.streak} дней (×${b.streak_mult}). Кристаллы: ${b.crystals}.`);
  return ok(lines.join("\n"));
}

interface GuildMemberRow {
  handle: string;
  level: number;
  role: string;
}

async function getGuild(): Promise<CallToolResult> {
  const res = await request("GET", "/api/agent/v1/guild");
  if (res.status !== 200) return fail(errorText(res.status, res.body));
  const b = res.body;
  if (!b.in_guild) return ok("Ты не состоишь в гильдии.");
  const lines: string[] = [];
  lines.push(`Гильдия «${b.name}». Код приглашения: ${b.invite_code ?? "нет"}.`);
  const members = (b.members as GuildMemberRow[]) ?? [];
  if (members.length > 0) {
    lines.push(
      "Состав: " + members.map((m) => `${m.handle} (ур. ${m.level}${m.role === "owner" ? ", глава" : ""})`).join(", ")
    );
  }
  const boss = b.boss as { name: string; current_hp: number; max_hp: number; days_left: number } | null;
  if (boss) {
    lines.push(`Босс недели: ${boss.name} — ${Math.round(boss.current_hp)}/${Math.round(boss.max_hp)} HP, осталось ${boss.days_left} дн.`);
  }
  return ok(lines.join("\n"));
}

interface HistoryEntry {
  type: "completion" | "boss_kill";
  date: string;
  title?: string;
  tier?: number;
  xp_gained?: number;
  damage?: number;
  source?: string;
  name?: string;
  scope?: string;
}

async function getHistory(args: { limit?: number }): Promise<CallToolResult> {
  const qs = args.limit ? `?limit=${encodeURIComponent(String(args.limit))}` : "";
  const res = await request("GET", `/api/agent/v1/history${qs}`);
  if (res.status !== 200) return fail(errorText(res.status, res.body));
  const items = (res.body.history as HistoryEntry[]) ?? [];
  if (items.length === 0) return ok("История пуста.");
  const lines = items.map((h) => {
    if (h.type === "boss_kill") {
      const scopeLabel = h.scope === "guild" ? "гильдейский" : "соло";
      return `${h.date}: повержен ${scopeLabel} босс «${h.name}»`;
    }
    return `${h.date}: ${tierLabel(h.tier)} · ${h.title} — +${h.xp_gained ?? 0} XP${(h.damage ?? 0) > 0 ? `, урон ${h.damage}` : ""} (${h.source})`;
  });
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
  {
    name: "delete_task",
    description: "Удалить задачу из контракта Ascend. Нельзя, если по ней уже есть выполнение на этой неделе (см. update_task вместо этого).",
    inputSchema: {
      type: "object",
      properties: {
        contract_task_id: { type: "string", description: "id задачи из list_tasks" },
      },
      required: ["contract_task_id"],
      additionalProperties: false,
    },
  },
  {
    name: "update_task",
    description: "Заменить задачу контракта Ascend (название/тир/расписание, либо пресет). Первая замена в неделю бесплатна, дальше платно и лимитировано — как в UI.",
    inputSchema: {
      type: "object",
      properties: {
        contract_task_id: { type: "string", description: "id задачи из list_tasks" },
        title: { type: "string" },
        tier: { type: "integer", enum: [1, 2, 3] },
        schedule_type: { type: "string", enum: ["daily", "weekly_n", "oneshot"] },
        schedule_count: { type: "integer" },
        preset_id: { type: "string" },
      },
      required: ["contract_task_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_profile",
    description: "Профиль персонажа Ascend: уровень, титул, XP, ранг, стрик, кристаллы, позывной.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_guild",
    description: "Гильдия игрока Ascend: название, код приглашения, состав, босс недели. Если не в гильдии — сообщает об этом.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_history",
    description: "История событий игрока Ascend: выполненные задачи и повергнутые боссы.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "сколько записей вернуть (по умолчанию 20, максимум 50)" },
      },
      additionalProperties: false,
    },
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
      case "delete_task":
        return await deleteTask((args ?? {}) as { contract_task_id?: string });
      case "update_task":
        return await updateTask(
          (args ?? {}) as {
            contract_task_id?: string;
            title?: string;
            tier?: number;
            schedule_type?: string;
            schedule_count?: number;
            preset_id?: string;
          }
        );
      case "get_profile":
        return await getProfile();
      case "get_guild":
        return await getGuild();
      case "get_history":
        return await getHistory((args ?? {}) as { limit?: number });
      default:
        return fail(`Неизвестный инструмент: ${name}`);
    }
  } catch (err) {
    return fail(`Не удалось связаться с Ascend (${apiUrl}): ${err instanceof Error ? err.message : String(err)}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
