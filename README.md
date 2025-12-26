# Copilot

## What this is / what this is not

Copilot is a **dashboard** (a cockpit) for shipping: a **brain + nervous system + hands** for execution.

- **Brain/cockpit**: one place to see state, decisions, and the “one best next action”.
- **Nervous system**: captures signals (intake, voice, notes) into structured artifacts.
- **Hands**: generates plans/prompts and drives the next concrete step.
- **Explicit memory**: org-scoped memory objects; optional embeddings are feature-gated.

What this is NOT:
- Not a generic chatbot.
- Not a hidden “always-on” agent.
- Not a secrets store (only env **names** are documented).

## Usable dashboard flow (bootstrap + intake + plan + voice)

### Web routes

- **`/app`**: Existing Copilot dashboard (memory + OBNA).
- **`/projects/new`**: Intake chat + structured capture + Generate Plan + Voice “rage → plan”.
- **`/projects/[id]/plan`**: Plan viewer (Blueprint/Roadmap/Prompts) + Approve Plan + Go to Run.
- **`/projects/[id]/run`**: Run view (OBNA + Voice panel).

### API routes (Next.js App Router)

- **Bootstrap**
  - `POST /api/admin/bootstrap` (auth required, idempotent)
- **Projects**
  - `GET /api/projects` (existing org/project listing for dashboard)
  - `POST /api/projects` (create a new top-level project)
- **Intake storage**
  - `POST /api/projects/[id]/intake/message`
  - `GET  /api/projects/[id]/intake`
- **Plan generation (server-only OpenAI Responses API + strict schema)**
  - `POST /api/projects/[id]/plan/generate`
  - `POST /api/projects/[id]/plan/approve`
  - `GET  /api/projects/[id]/plan` (fetch approved/latest or `?planId=...`)
- **Voice “rage → plan”**
  - `POST /api/projects/[id]/voice/upload` (Firebase Storage)
  - `POST /api/projects/[id]/voice/transcribe` (OpenAI transcription)
  - `POST /api/projects/[id]/voice/convert-to-plan` (OpenAI Responses → strict plan schema)

### Firestore paths (minimal)

- **Org + membership**
  - `orgs/{orgId}`
  - `orgs/{orgId}/members/{uid}`
  - `orgs/{orgId}/projects/{projectId}` (lightweight link doc for listing)
- **Project (canonical)**
  - `projects/{projectId}`
- **Intake**
  - `projects/{projectId}/intakeMessages/{messageId}`
- **Plans (versioned)**
  - `projects/{projectId}/plans/{planId}`
  - `projects/{projectId}.approvedPlanId` is set by approve endpoint
- **Artifacts**
  - `artifacts/{artifactId}` (prompts, voice uploads, transcripts; linked by `projectId` + optional `planId`)

### Environment variables

## Vercel Setup

Set these in **Vercel Project → Settings → Environment Variables**, then redeploy.

You can self-diagnose missing keys via:

- `GET /api/health/env` (JSON, names only)
- `/env-check` (UI, names only)

### Local development

There is a template at `.env.example` (and also `docs/env.local.example`). Copy it to a local `.env.local` file (don’t commit it), then start Next.js.

Node version: this repo targets **Node.js 20.x** (see `package.json#engines` and `.nvmrc`).

### Local dev quickstart (degraded mode ok)

This app should **start and build without secrets**. First validation step: visit **`/config`**.
### Client (safe to expose)

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

### Server-only (never expose to client)

- Firebase Admin (preferred):
  - `FIREBASE_SERVICE_ACCOUNT_JSON` (full service account JSON string)
- Firebase Admin (split vars; accepted compatibility variants):
  - `FIREBASE_ADMIN_PROJECT_ID` or `FIREBASE_SERVICE_ACCOUNT_PROJECT_ID`
  - `FIREBASE_ADMIN_CLIENT_EMAIL` or `FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL`
  - `FIREBASE_ADMIN_PRIVATE_KEY` or `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY`
  - `FIREBASE_STORAGE_BUCKET` (recommended; Storage bucket name, e.g. `myproj.appspot.com`)

**Private key newline note:** When storing a private key in split env vars, keep it as a single line and use literal `\n` escapes. The server will normalize `\\n` to real newlines at runtime.

- OpenAI:
  - `OPENAI_API_KEY` (optional; only required for OpenAI-backed features)
  - `OPENAI_PLAN_MODEL` (optional, default: `gpt-4.1-mini`)
  - `OPENAI_TRANSCRIBE_MODEL` (optional, default: `whisper-1`)
  - `OPENAI_EMBEDDING_MODEL` (optional, default: `text-embedding-3-small`)

### Cursor Agent Online checklist (names only)

- Client:
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `NEXT_PUBLIC_FIREBASE_APP_ID`
- Server/Admin (accepted formats):
  - `FIREBASE_SERVICE_ACCOUNT_JSON`
  - `FIREBASE_ADMIN_PROJECT_ID`
  - `FIREBASE_ADMIN_CLIENT_EMAIL`
  - `FIREBASE_ADMIN_PRIVATE_KEY`
  - `FIREBASE_SERVICE_ACCOUNT_PROJECT_ID`
  - `FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL`
  - `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY`
- Optional:
  - `OPENAI_API_KEY`

### Admin: Memories Console

There is an admin-only CRUD console at **`/admin/memories`** (also linked from `/app` when you are an org `admin`/`owner`).

Data lives under:

- `orgs/{orgId}/memories/{memoryId}`
- `orgs/{orgId}/people/{personId}`
- `orgs/{orgId}/tags/{tagId}`
- `orgs/{orgId}/memoryEmbeddings/{memoryId}` (optional)

### Firebase security rules examples

See `docs/firebase/firestore.rules.example` (or `firestore.rules.example`) for an **admin-only** rules baseline for the Memories module.

### Example plan JSON output (strict)

```json
{
  "blueprint": {
    "sections": [
      {
        "title": "Goal + non-goals",
        "bullets": ["Ship an MVP plan flow", "No client-side OpenAI calls"]
      }
    ]
  },
  "roadmap": {
    "phases": [
      {
        "name": "Phase 1: Make it usable",
        "outcomes": ["Users can create a project and generate a plan"],
        "acceptanceCriteria": ["Plan is stored versioned in Firestore", "Approve locks approvedPlanId"],
        "steps": ["Capture intake messages", "Generate plan via server-only OpenAI", "Render tabs + approve"]
      }
    ]
  },
  "prompts": {
    "cursor": ["Create the API route skeletons and UI pages."],
    "firebaseStudio": ["Add Firestore indexes for intakeMessages createdAt ordering."],
    "github": ["Open a PR titled: Copilot usable: bootstrap + intake + plan + voice"],
    "vercel": ["Configure server env vars and deploy."],
    "slack": ["Post OBNA + status update to #shipping"]
  },
  "oneBestNextAction": {
    "title": "Generate your first plan from intake",
    "timeboxMinutes": 30,
    "steps": ["Open /projects/new", "Add 3–5 intake messages", "Click Generate Plan", "Review + Approve"],
    "evidenceIds": ["intake:msg:1", "intake:msg:2"]
  }
}
```

