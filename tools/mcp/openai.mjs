import OpenAI from "openai";
import { isHelpArg, makeServer, printHelp, requireEnv, runStdioServer } from "./_shared.mjs";

const tools = [
  {
    name: "openai.models.list",
    description: "List available OpenAI models.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "openai.responses.create",
    description: "Create an OpenAI response with { model, input, max_output_tokens? }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["model", "input"],
      properties: {
        model: { type: "string" },
        input: { type: ["string", "array", "object"] },
        max_output_tokens: { type: "number" },
      },
    },
  },
];

if (isHelpArg()) {
  printHelp({ name: "mcp-openai", tools });
  process.exit(0);
}

function getClient() {
  const apiKey = requireEnv("OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}

const server = makeServer({
  name: "mcp-openai",
  version: "0.0.1",
  tools,
  callTool: async (toolName, args) => {
    try {
      const client = getClient();
      if (toolName === "openai.models.list") {
        const resp = await client.models.list();
        return { ok: true, data: resp };
      }
      if (toolName === "openai.responses.create") {
        const model = String(args?.model ?? process.env.OPENAI_MODEL ?? "").trim();
        const input = args?.input;
        if (!model) return { ok: false, error: { code: "INVALID_ARGUMENT", message: "Missing model." } };
        const max_output_tokens =
          typeof args?.max_output_tokens === "number" ? args.max_output_tokens : undefined;
        const resp = await client.responses.create({ model, input, max_output_tokens });
        return { ok: true, data: resp };
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


