# Levelzzz agent-tools

MCP-инструменты Levelzzz для AI-агентов: агент сам отмечает твои задачи,
добавляет новые и показывает прогресс через тот же API, которым пользуется
веб-интерфейс.

## Что внутри

- `mcp/`: stdio MCP-сервер `levelzzz-mcp` (один файл, `@modelcontextprotocol/sdk`).
  Инструменты: `list_tasks`, `complete_task`, `add_task`, `delete_task`,
  `update_task`, `get_progress`, `get_profile`, `get_guild`, `get_history`.
- `plugin/`: плагин Claude Code (marketplace + MCP-конфиг + skill с триггерами).

## Получи ключ

Создаётся в **Профиле → Агентский доступ → Создать** на
[levelzzz.com](https://levelzzz.com). Полный ключ показывается один раз,
дальше виден только префикс. Отозвать можно там же в любой момент.

[Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=levelzzz&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBsZXZlbHp6ei9tY3AiXSwiZW52Ijp7IkxFVkVMWlpaX0FQSV9LRVkiOiJZT1VSX0tFWSJ9fQ==) ·
[Install in VS Code](vscode:mcp/install?%7B%22name%22%3A%22levelzzz%22%2C%22type%22%3A%22stdio%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40levelzzz%2Fmcp%22%5D%2C%22env%22%3A%7B%22LEVELZZZ_API_KEY%22%3A%22YOUR_KEY%22%7D%7D)

После установки через кнопку замени `YOUR_KEY` на свой ключ: для Cursor в
`.cursor/mcp.json` (проектный) или `~/.cursor/mcp.json` (глобальный), для
VS Code в `.vscode/mcp.json`.

## Установка по клиентам

### Claude Code (плагин)

```
/plugin marketplace add Efimovnik0707/levelzzz-agent-tools
/plugin install levelzzz
```

При включении плагина Claude Code сам спросит «Levelzzz API key»: вставь
ключ из профиля, ввод маскируется, ключ хранится в системном keychain.
Адрес сервера указывать не нужно, по умолчанию плагин ходит на
https://levelzzz.com. Переменная `LEVELZZZ_API_URL` нужна только для
self-host или локальной разработки.

### Claude Code (без плагина) и любой клиент с `mcpServers`

Подходит для Windsurf (`~/.codeium/windsurf/mcp_config.json`), Cline, Claude
Desktop (`claude_desktop_config.json`) и других клиентов с ключом `mcpServers`
в конфиге:

```json
{
  "mcpServers": {
    "levelzzz": {
      "command": "npx",
      "args": ["-y", "@levelzzz/mcp"],
      "env": {
        "LEVELZZZ_API_KEY": "asc_..."
      }
    }
  }
}
```

### OpenAI Codex CLI

Файл `~/.codex/config.toml`:

```toml
[mcp_servers.levelzzz]
command = "npx"
args = ["-y", "@levelzzz/mcp"]

[mcp_servers.levelzzz.env]
LEVELZZZ_API_KEY = "asc_..."
```

Или одной командой:

```
codex mcp add levelzzz --env LEVELZZZ_API_KEY=asc_... -- npx -y @levelzzz/mcp
```

### Cursor (вручную)

Файл `.cursor/mcp.json` (проектный) или `~/.cursor/mcp.json` (глобальный),
тот же JSON с ключом `mcpServers`, что и выше.

### VS Code / GitHub Copilot

Файл `.vscode/mcp.json`, корневой ключ `servers`, с `"type": "stdio"`:

```json
{
  "servers": {
    "levelzzz": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@levelzzz/mcp"],
      "env": {
        "LEVELZZZ_API_KEY": "asc_..."
      }
    }
  }
}
```

### Gemini CLI

Файл `~/.gemini/settings.json`, ключ `mcpServers` (тот же JSON, что выше),
либо одной командой:

```
gemini mcp add levelzzz npx -- -y @levelzzz/mcp
```

### Zed

Файл `settings.json`, ключ `context_servers`, внутри тот же набор
command/args/env.

## Безопасность ключа

API-ключ Levelzzz (`asc_...`) даёт доступ к твоему аккаунту наравне с
логином: им можно отмечать задачи, добавлять их и читать прогресс. Он не
даёт доступа ни к чему за пределами Levelzzz.

- Полный ключ показывается один раз, дальше виден только префикс.
- Отозвать можно в любой момент в Профиле → Агентский доступ, старый ключ
  сразу перестаёт работать.
- Не коммить ключ в git, не вставляй в публичные чаты. Если ключ утёк,
  просто отзови его в профиле и создай новый.

## Примеры фраз агенту

- «Я час вайбкодил свой проект, отметь задачу»
- «Добавь задачу: 20 минут на растяжку, тир I, каждый день»
- «Как там мой прогресс и босс гильдии?»
- «Удали задачу про растяжку» / «Замени эту задачу на медитацию»
- «Покажи мой профиль» / «Кто в моей гильдии» / «Что я делал на этой неделе»

## FAQ

**Это читерство?** Нет. Агент делает ровно то же, что твой клик в
интерфейсе, тот же API, те же формулы, те же лимиты дня.

**Какие лимиты?** Те же, что и в UI: те же потолки XP/урона в день, тот же
дедуп задач, тот же лимит на 7 задач в контракте.

**Ключ утёк, что делать?** Отзови его в Профиле → Агентский доступ и создай
новый. Отозванный ключ перестаёт работать сразу.
