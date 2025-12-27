import { GoogleAuth } from "google-auth-library";
import { fetchJson, isHelpArg, makeServer, printHelp, runStdioServer } from "./_shared.mjs";

const tools = [
  {
    name: "gcp.run.services.list",
    description: "List Cloud Run services for { region }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["region"],
      properties: { region: { type: "string" } },
    },
  },
  {
    name: "gcp.run.services.get",
    description: "Get a Cloud Run service for { region, service }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["region", "service"],
      properties: { region: { type: "string" }, service: { type: "string" } },
    },
  },
  {
    name: "gcp.logging.query",
    description: "Query Cloud Logging with { filter, limit }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { filter: { type: "string" }, limit: { type: "number" } },
    },
  },
];

if (isHelpArg()) {
  printHelp({ name: "mcp-gcp", tools });
  process.exit(0);
}

function getProjectId() {
  const p = process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT;
  return p && String(p).trim() ? String(p).trim() : null;
}

async function getAuthHeaders() {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/logging.read"],
  });
  const client = await auth.getClient();
  const headers = await client.getRequestHeaders();
  return headers;
}

const server = makeServer({
  name: "mcp-gcp",
  version: "0.0.1",
  tools,
  callTool: async (toolName, args) => {
    try {
      const project = getProjectId();
      if (!project) return { ok: false, error: { code: "MISSING_ENV", message: "Missing GCP_PROJECT_ID or GCLOUD_PROJECT." } };

      const headers = await getAuthHeaders();

      if (toolName === "gcp.run.services.list") {
        const region = String(args?.region ?? "").trim();
        if (!region) return { ok: false, error: { code: "INVALID_ARGUMENT", message: "Missing region." } };
        const url = `https://run.googleapis.com/v2/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(region)}/services`;
        const resp = await fetchJson(url, { headers });
        return { ok: resp.ok, status: resp.status, data: resp.json ?? resp.text };
      }

      if (toolName === "gcp.run.services.get") {
        const region = String(args?.region ?? "").trim();
        const service = String(args?.service ?? "").trim();
        if (!region || !service) return { ok: false, error: { code: "INVALID_ARGUMENT", message: "Missing region or service." } };
        const url = `https://run.googleapis.com/v2/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(region)}/services/${encodeURIComponent(service)}`;
        const resp = await fetchJson(url, { headers });
        return { ok: resp.ok, status: resp.status, data: resp.json ?? resp.text };
      }

      if (toolName === "gcp.logging.query") {
        const filter = typeof args?.filter === "string" ? args.filter : "";
        const limit = typeof args?.limit === "number" ? Math.max(1, Math.min(1000, args.limit)) : 50;
        const url = "https://logging.googleapis.com/v2/entries:list";
        const body = {
          resourceNames: [`projects/${project}`],
          filter,
          pageSize: limit,
        };
        const resp = await fetchJson(url, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body });
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


