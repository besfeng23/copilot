import { initializeApp, getApps, applicationDefault, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { isHelpArg, makeServer, printHelp, runStdioServer } from "./_shared.mjs";

const ALLOWLIST_PREFIXES = [
  "projects/",
  "users/",
  "orgs/",
  "memberships/",
  "datasets/",
  "evaluations/",
  "decisions/",
  "audit_logs/",
  "artifacts/",
  "summaries/",
];

function assertAllowedPath(p) {
  const path = String(p ?? "").trim().replace(/^\/+/, "");
  if (!path) throw Object.assign(new Error("Missing path."), { code: "INVALID_ARGUMENT" });
  const ok = ALLOWLIST_PREFIXES.some((prefix) => path.startsWith(prefix));
  if (!ok) throw Object.assign(new Error("Path not allowed by allowlist."), { code: "FORBIDDEN_PATH" });
  return path;
}

function normalizePrivateKey(v) {
  return String(v).replace(/\\n/g, "\n");
}

function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length) return v;
  }
  return null;
}

function initAdmin() {
  if (getApps().length) return;

  // Prefer ADC (GOOGLE_APPLICATION_CREDENTIALS / metadata) first.
  try {
    initializeApp({ credential: applicationDefault() });
    return;
  } catch {
    // fall through
  }

  const rawJson = firstNonEmpty(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed && typeof parsed === "object" && typeof parsed.private_key === "string") {
        parsed.private_key = normalizePrivateKey(parsed.private_key);
      }
      initializeApp({ credential: cert(parsed) });
      return;
    } catch {
      throw Object.assign(new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON."), { code: "INVALID_ENV" });
    }
  }

  const projectId = firstNonEmpty(process.env.FIREBASE_ADMIN_PROJECT_ID, process.env.FIREBASE_SERVICE_ACCOUNT_PROJECT_ID);
  const clientEmail = firstNonEmpty(
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL
  );
  const privateKeyRaw = firstNonEmpty(
    process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY
  );

  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw Object.assign(
      new Error(
        "Firebase Admin not configured. Use ADC (GOOGLE_APPLICATION_CREDENTIALS) or set FIREBASE_SERVICE_ACCOUNT_JSON (preferred) or split vars."
      ),
      { code: "MISSING_ENV" }
    );
  }

  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey: normalizePrivateKey(privateKeyRaw) }),
  });
}

const tools = [
  {
    name: "firebase.auth.verifyIdToken",
    description: "Verify Firebase ID token with { idToken }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["idToken"],
      properties: { idToken: { type: "string" } },
    },
  },
  {
    name: "firebase.firestore.get",
    description: "Get a Firestore document with { path }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: { path: { type: "string" } },
    },
  },
  {
    name: "firebase.firestore.query",
    description: "Query a Firestore collection with { collectionPath, where?, orderBy?, limit? }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["collectionPath"],
      properties: {
        collectionPath: { type: "string" },
        where: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["field", "op", "value"],
            properties: { field: { type: "string" }, op: { type: "string" }, value: {} },
          },
        },
        orderBy: {
          type: "object",
          additionalProperties: false,
          required: ["field"],
          properties: { field: { type: "string" }, direction: { type: "string" } },
        },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "firebase.firestore.set",
    description: "Set a Firestore document with { path, data, merge? }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path", "data"],
      properties: { path: { type: "string" }, data: { type: "object" }, merge: { type: "boolean" } },
    },
  },
  {
    name: "firebase.firestore.add",
    description: "Add a document to a collection with { collectionPath, data }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["collectionPath", "data"],
      properties: { collectionPath: { type: "string" }, data: { type: "object" } },
    },
  },
];

if (isHelpArg()) {
  printHelp({ name: "mcp-firebase", tools });
  process.exit(0);
}

const server = makeServer({
  name: "mcp-firebase",
  version: "0.0.1",
  tools,
  callTool: async (toolName, args) => {
    try {
      initAdmin();
      const auth = getAuth();
      const db = getFirestore();

      if (toolName === "firebase.auth.verifyIdToken") {
        const idToken = String(args?.idToken ?? "").trim();
        if (!idToken) return { ok: false, error: { code: "INVALID_ARGUMENT", message: "Missing idToken." } };
        const decoded = await auth.verifyIdToken(idToken);
        return { ok: true, data: decoded };
      }

      if (toolName === "firebase.firestore.get") {
        const path = assertAllowedPath(args?.path);
        const snap = await db.doc(path).get();
        return { ok: true, exists: snap.exists, path, data: snap.exists ? snap.data() : null };
      }

      if (toolName === "firebase.firestore.set") {
        const path = assertAllowedPath(args?.path);
        const data = args?.data ?? null;
        if (!data || typeof data !== "object") {
          return { ok: false, error: { code: "INVALID_ARGUMENT", message: "data must be an object." } };
        }
        const merge = Boolean(args?.merge);
        await db.doc(path).set(data, { merge });
        return { ok: true, path, merge };
      }

      if (toolName === "firebase.firestore.add") {
        const collectionPath = assertAllowedPath(args?.collectionPath);
        const data = args?.data ?? null;
        if (!data || typeof data !== "object") {
          return { ok: false, error: { code: "INVALID_ARGUMENT", message: "data must be an object." } };
        }
        const ref = await db.collection(collectionPath).add(data);
        return { ok: true, id: ref.id, path: ref.path };
      }

      if (toolName === "firebase.firestore.query") {
        const collectionPath = assertAllowedPath(args?.collectionPath);
        let q = db.collection(collectionPath);

        const where = Array.isArray(args?.where) ? args.where : [];
        for (const w of where) {
          const field = String(w?.field ?? "").trim();
          const op = String(w?.op ?? "").trim();
          if (!field || !op) continue;
          q = q.where(field, op, w?.value);
        }

        const orderBy = args?.orderBy && typeof args.orderBy === "object" ? args.orderBy : null;
        if (orderBy?.field) {
          const dir = orderBy.direction === "desc" ? "desc" : "asc";
          q = q.orderBy(String(orderBy.field), dir);
        }

        const limit = typeof args?.limit === "number" ? Math.max(1, Math.min(500, args.limit)) : 25;
        const snap = await q.limit(limit).get();
        const items = snap.docs.map((d) => ({ id: d.id, path: d.ref.path, data: d.data() }));
        return { ok: true, count: items.length, items };
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


