import { fetchJson, isHelpArg, makeServer, printHelp, requireEnv, runStdioServer } from "./_shared.mjs";

const tools = [
  {
    name: "linear.viewer.get",
    description: "Get the current Linear viewer.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "linear.issues.list",
    description: "List issues assigned to me (basic) with optional { first?, filter? }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { first: { type: "number" }, filter: { type: ["object", "null"] } },
    },
  },
  {
    name: "linear.issue.create",
    description: "Create an issue with { teamId, title, description? }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["teamId", "title"],
      properties: { teamId: { type: "string" }, title: { type: "string" }, description: { type: "string" } },
    },
  },
  {
    name: "linear.issue.comment",
    description: "Create a comment with { issueId, body }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["issueId", "body"],
      properties: { issueId: { type: "string" }, body: { type: "string" } },
    },
  },
];

if (isHelpArg()) {
  printHelp({ name: "mcp-linear", tools });
  process.exit(0);
}

function headers() {
  // Prompt requires: Authorization: <LINEAR_API_KEY> (no Bearer).
  const key = requireEnv("LINEAR_API_KEY");
  return { authorization: key, "content-type": "application/json" };
}

async function gql(query, variables) {
  const resp = await fetchJson("https://api.linear.app/graphql", {
    method: "POST",
    headers: headers(),
    body: { query, variables },
  });
  return resp;
}

const server = makeServer({
  name: "mcp-linear",
  version: "0.0.1",
  tools,
  callTool: async (toolName, args) => {
    try {
      if (toolName === "linear.viewer.get") {
        const resp = await gql("query { viewer { id name email } }", {});
        return { ok: resp.ok, status: resp.status, data: resp.json ?? resp.text };
      }
      if (toolName === "linear.issues.list") {
        const first = typeof args?.first === "number" ? Math.max(1, Math.min(50, args.first)) : 20;
        const filter = args?.filter && typeof args.filter === "object" ? args.filter : { assignee: { isMe: { eq: true } } };
        const query = `
          query Issues($first: Int!, $filter: IssueFilter) {
            issues(first: $first, filter: $filter) {
              nodes { id identifier title url createdAt updatedAt }
            }
          }
        `;
        const resp = await gql(query, { first, filter });
        return { ok: resp.ok, status: resp.status, data: resp.json ?? resp.text };
      }
      if (toolName === "linear.issue.create") {
        const teamId = String(args?.teamId ?? "").trim();
        const title = String(args?.title ?? "").trim();
        const description = args?.description ? String(args.description) : undefined;
        if (!teamId || !title) return { ok: false, error: { code: "INVALID_ARGUMENT", message: "Missing teamId or title." } };
        const query = `
          mutation IssueCreate($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              success
              issue { id identifier title url }
            }
          }
        `;
        const resp = await gql(query, { input: { teamId, title, description } });
        return { ok: resp.ok, status: resp.status, data: resp.json ?? resp.text };
      }
      if (toolName === "linear.issue.comment") {
        const issueId = String(args?.issueId ?? "").trim();
        const body = String(args?.body ?? "").trim();
        if (!issueId || !body) return { ok: false, error: { code: "INVALID_ARGUMENT", message: "Missing issueId or body." } };
        const query = `
          mutation CommentCreate($input: CommentCreateInput!) {
            commentCreate(input: $input) {
              success
              comment { id body createdAt }
            }
          }
        `;
        const resp = await gql(query, { input: { issueId, body } });
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


