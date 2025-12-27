import { fetchJson, isHelpArg, makeServer, printHelp, requireEnv, runStdioServer } from "./_shared.mjs";

const tools = [
  {
    name: "vercel.projects.list",
    description: "List Vercel projects with { limit? }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { limit: { type: "number" } },
    },
  },
  {
    name: "vercel.deployments.list",
    description: "List Vercel deployments with { limit?, projectId?, state? }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "number" },
        projectId: { type: "string" },
        state: { type: "string" },
      },
    },
  },
  {
    name: "vercel.deployments.get",
    description: "Get a deployment with { id }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "vercel.deployments.logs",
    description: "Fetch deployment logs/events with { id, since?, until? }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string" },
        since: { type: "number" },
        until: { type: "number" },
      },
    },
  },
];

if (isHelpArg()) {
  printHelp({ name: "mcp-vercel", tools });
  process.exit(0);
}

function baseUrl(path, params = {}) {
  const u = new URL(`https://api.vercel.com${path}`);
  const teamId = process.env.VERCEL_TEAM_ID ? String(process.env.VERCEL_TEAM_ID).trim() : "";
  if (teamId) u.searchParams.set("teamId", teamId);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (!s) continue;
    u.searchParams.set(k, s);
  }
  return u.toString();
}

function authHeaders() {
  const token = requireEnv("VERCEL_TOKEN");
  return { authorization: `Bearer ${token}` };
}

const server = makeServer({
  name: "mcp-vercel",
  version: "0.0.1",
  tools,
  callTool: async (toolName, args) => {
    try {
      const headers = authHeaders();

      if (toolName === "vercel.projects.list") {
        const limit = typeof args?.limit === "number" ? Math.max(1, Math.min(100, args.limit)) : 20;
        const url = baseUrl("/v9/projects", { limit });
        const resp = await fetchJson(url, { headers });
        return { ok: resp.ok, status: resp.status, data: resp.json ?? resp.text };
      }

      if (toolName === "vercel.deployments.list") {
        const limit = typeof args?.limit === "number" ? Math.max(1, Math.min(100, args.limit)) : 20;
        const projectId = args?.projectId ? String(args.projectId).trim() : undefined;
        const state = args?.state ? String(args.state).trim() : undefined;
        const url = baseUrl("/v6/deployments", { limit, projectId, state });
        const resp = await fetchJson(url, { headers });
        return { ok: resp.ok, status: resp.status, data: resp.json ?? resp.text };
      }

      if (toolName === "vercel.deployments.get") {
        const id = String(args?.id ?? "").trim();
        if (!id) return { ok: false, error: { code: "INVALID_ARGUMENT", message: "Missing id." } };
        const url = baseUrl(`/v13/deployments/${encodeURIComponent(id)}`);
        const resp = await fetchJson(url, { headers });
        return { ok: resp.ok, status: resp.status, data: resp.json ?? resp.text };
      }

      if (toolName === "vercel.deployments.logs") {
        const id = String(args?.id ?? "").trim();
        if (!id) return { ok: false, error: { code: "INVALID_ARGUMENT", message: "Missing id." } };
        const since = typeof args?.since === "number" ? args.since : undefined;
        const until = typeof args?.until === "number" ? args.until : undefined;
        const url = baseUrl(`/v2/deployments/${encodeURIComponent(id)}/events`, { since, until });
        const resp = await fetchJson(url, { headers });
        return { ok: resp.ok, status: resp.status, data: resp.json ?? resp.text };
      }

      return { ok: false, error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${toolName}` } };
    } catch (e) {
      return {
        ok: false,
        error: { code: e?.code ?? "ERROR", message: e instanceof Error ? e.message : "Tool failed." },
      };
    }
  },
});

await runStdioServer(server);


