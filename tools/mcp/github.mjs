import { Octokit } from "@octokit/rest";
import { isHelpArg, makeServer, printHelp, requireEnv, runStdioServer } from "./_shared.mjs";

const tools = [
  {
    name: "github.repo.getInfo",
    description: "Get repository info for { owner, repo }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["owner", "repo"],
      properties: { owner: { type: "string" }, repo: { type: "string" } },
    },
  },
  {
    name: "github.search.code",
    description: "Search code with { q } (GitHub search query).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["q"],
      properties: { q: { type: "string" } },
    },
  },
  {
    name: "github.contents.get",
    description: "Get repo contents for { owner, repo, path, ref? }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["owner", "repo", "path"],
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string" },
        ref: { type: "string" },
      },
    },
  },
  {
    name: "github.pulls.create",
    description: "Create a pull request with { owner, repo, title, head, base, body }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["owner", "repo", "title", "head", "base"],
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        title: { type: "string" },
        head: { type: "string" },
        base: { type: "string" },
        body: { type: "string" },
      },
    },
  },
  {
    name: "github.issues.createComment",
    description: "Create an issue/PR comment with { owner, repo, issue_number, body }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["owner", "repo", "issue_number", "body"],
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        issue_number: { type: "number" },
        body: { type: "string" },
      },
    },
  },
];

if (isHelpArg()) {
  printHelp({ name: "mcp-github", tools });
  process.exit(0);
}

function getClient() {
  const token = requireEnv("GITHUB_TOKEN");
  return new Octokit({ auth: token });
}

const server = makeServer({
  name: "mcp-github",
  version: "0.0.1",
  tools,
  callTool: async (toolName, args) => {
    try {
      const gh = getClient();
      if (toolName === "github.repo.getInfo") {
        const owner = String(args?.owner ?? "");
        const repo = String(args?.repo ?? "");
        const resp = await gh.repos.get({ owner, repo });
        return { ok: true, data: resp.data };
      }
      if (toolName === "github.search.code") {
        const q = String(args?.q ?? "");
        const resp = await gh.search.code({ q });
        return { ok: true, data: resp.data };
      }
      if (toolName === "github.contents.get") {
        const owner = String(args?.owner ?? "");
        const repo = String(args?.repo ?? "");
        const path = String(args?.path ?? "");
        const ref = args?.ref ? String(args.ref) : undefined;
        const resp = await gh.repos.getContent({ owner, repo, path, ref });
        return { ok: true, data: resp.data };
      }
      if (toolName === "github.pulls.create") {
        const owner = String(args?.owner ?? "");
        const repo = String(args?.repo ?? "");
        const title = String(args?.title ?? "");
        const head = String(args?.head ?? "");
        const base = String(args?.base ?? "");
        const body = args?.body ? String(args.body) : undefined;
        const resp = await gh.pulls.create({ owner, repo, title, head, base, body });
        return { ok: true, data: resp.data };
      }
      if (toolName === "github.issues.createComment") {
        const owner = String(args?.owner ?? "");
        const repo = String(args?.repo ?? "");
        const issue_number = Number(args?.issue_number);
        const body = String(args?.body ?? "");
        const resp = await gh.issues.createComment({ owner, repo, issue_number, body });
        return { ok: true, data: resp.data };
      }
      return { ok: false, error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${toolName}` } };
    } catch (e) {
      return {
        ok: false,
        error: { code: e?.status ? `HTTP_${e.status}` : "ERROR", message: e instanceof Error ? e.message : "Tool failed." },
      };
    }
  },
});

await runStdioServer(server);


