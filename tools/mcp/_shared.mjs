import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export function isHelpArg(argv = process.argv) {
  return argv.includes("--help") || argv.includes("-h");
}

export function printHelp({ name, tools }) {
  const toolNames = tools.map((t) => t.name).sort();
  // Never print env values or secrets here.
  process.stdout.write(`${name}\n`);
  process.stdout.write(`tools:\n`);
  for (const t of toolNames) process.stdout.write(`- ${t}\n`);
}

export function jsonText(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value),
      },
    ],
  };
}

export function makeServer({ name, version = "0.0.0", tools, callTool }) {
  const server = new Server(
    { name, version },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const toolName = req.params?.name;
    const args = req.params?.arguments ?? {};
    const result = await callTool(toolName, args);
    return jsonText(result);
  });

  return server;
}

export async function runStdioServer(server) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function requireEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    const err = new Error(`Missing env var ${name}.`);
    err.code = "MISSING_ENV";
    throw err;
  }
  return String(v);
}

export async function fetchJson(url, { method = "GET", headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, headers: Object.fromEntries(res.headers.entries()), json, text };
}


