# Levelzzz Agent Tools

Levelzzz Agent Tools lets AI agents work with your Levelzzz tasks, progress,
profile, guild, and history through the same Levelzzz API used by the web app.

The repository publishes two compatible packages:

- `plugin/`: the Codex plugin bundle with skill instructions, registered app
  connection, and bundled MCP server configuration.
- repository root: the existing npm stdio MCP package and Claude Code plugin
  compatibility files.

## Codex plugin

The Codex plugin bundle lives in `plugin/` and includes:

- `plugin/.codex-plugin/plugin.json`
- `plugin/.app.json`
- `plugin/.mcp.json`
- `plugin/skills/levelzzz-tracker/SKILL.md`

The app connection is registered as:

```text
plugin_asdk_app_6a772ec1468c8191a5142b9d7e554760
```

For local marketplace testing from the repository root:

```text
codex plugin marketplace add .
```

Then install the `Levelzzz` plugin from the `Levelzzz Local` marketplace in the
Codex app.

## Claude Code

The existing Claude Code plugin path remains supported:

```text
/plugin marketplace add Efimovnik0707/levelzzz-agent-tools
/plugin install levelzzz
```

Claude Code asks for your Levelzzz API key during plugin setup. Create the key
in Levelzzz under Profile -> Agent Access -> Create.

## Local MCP fallback

For clients that do not install the plugin bundle, the stdio MCP server remains
available as a fallback:

```text
npx -y @levelzzz/mcp
```

Required environment variable:

```text
LEVELZZZ_API_KEY=asc_...
```

`LEVELZZZ_API_URL` is optional and only needed for self-hosted or local
development environments. Without it, the server uses production Levelzzz.

## Tools

The `levelzzz` MCP server exposes:

- `list_tasks`
- `complete_task`
- `add_task`
- `delete_task`
- `update_task`
- `get_progress`
- `get_profile`
- `get_guild`
- `get_history`

## API key safety

The Levelzzz API key gives access to your own Levelzzz account. Do not commit it
to git or paste it into public chats. If a key leaks, revoke it in Profile ->
Agent Access and create a new one.
