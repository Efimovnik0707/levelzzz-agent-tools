# Levelzzz Agent Tools

Levelzzz Agent Tools lets AI agents work with your Levelzzz tasks, progress,
profile, guild, and history through the same Levelzzz API used by the web app.

## ChatGPT and Codex

The public Levelzzz plugin is being prepared for the universal Plugins
Directory shared by ChatGPT and Codex. The public plugin uses the production
remote MCP server at `https://levelzzz.com/mcp` and signs each user in through
Levelzzz OAuth. Users of that flow do not create or paste an API key.

Until the public review is complete, developers can test the repo marketplace:

```bash
codex plugin marketplace add Efimovnik0707/levelzzz-agent-tools
```

Restart the ChatGPT desktop app, install **Levelzzz** from the
`Levelzzz Local` marketplace, and complete the Levelzzz OAuth sign-in. The
marketplace entry is in `.agents/plugins/marketplace.json`; the installable
bundle is in `plugin/`.

The submission source of truth, review blockers, field values, annotation
matrix, and test cases live in [PUBLIC_PLUGIN_SUBMISSION.md](./PUBLIC_PLUGIN_SUBMISSION.md).

## Create an API key for local MCP clients

Claude Code and other stdio MCP clients use the npm fallback and need a
personal agent key:

1. Open Levelzzz.
2. Go to Profile -> Agent Access.
3. Click Create.
4. Copy the generated key. It should look like `asc_...`.

The key is shown once. If it leaks, revoke it and create a new one.

## Claude Code

Install the Levelzzz plugin in Claude Code:

```text
/plugin marketplace add Efimovnik0707/levelzzz-agent-tools
/plugin install levelzzz
```

Claude Code asks for the Levelzzz API key during plugin setup. Paste the key
from Profile -> Agent Access -> Create. The plugin provides both:

- the `levelzzz-tracker` skill/instructions
- the bundled `levelzzz` MCP server

## Local stdio fallback for Codex CLI

If the remote OAuth plugin is unavailable, add the npm MCP server directly:

```bash
codex mcp add levelzzz --env LEVELZZZ_API_KEY=asc_... -- npx -y @levelzzz/mcp
```

Equivalent manual setup in Codex Settings -> MCP servers:

- Command: `npx`
- Arguments: `-y`, `@levelzzz/mcp`
- Environment variable: `LEVELZZZ_API_KEY=<the user's asc_... key>`
- Working directory: any existing directory, for example `~/code`

After connecting, verify the connection by calling `get_profile`. A successful
response includes the user's Levelzzz handle, level, rank, streak, and crystals.

If Codex reports `Ключ Levelzzz недействителен или отозван` immediately after a
plugin install, first verify the key with the direct MCP config above. Do not
leave `${user_config.api_key}` or `YOUR_KEY` as the literal environment value.

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
