# Copilot

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

If the deployed app is white-screening, start with the self-check:

- **Page**: `/env-check`
- **Endpoint**: `/api/health/env` (returns missing key names only; no values)

### Client (safe to expose)

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

### Server-only

#### Firebase Admin (set **ONE** supported format)

- **Preferred (JSON string)**:
  - `FIREBASE_SERVICE_ACCOUNT_JSON`
- **Split vars (either prefix works)**:
  - `FIREBASE_ADMIN_PROJECT_ID`
  - `FIREBASE_ADMIN_CLIENT_EMAIL`
  - `FIREBASE_ADMIN_PRIVATE_KEY`
  - `FIREBASE_SERVICE_ACCOUNT_PROJECT_ID`
  - `FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL`
  - `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY`

Private key note: store as a single line with `\n` escapes; the server will normalize to real newlines.

- Firebase Admin:
  - `FIREBASE_STORAGE_BUCKET` (recommended; Storage bucket name, e.g. `myproj.appspot.com`)
- OpenAI:
  - `OPENAI_API_KEY`
  - `OPENAI_PLAN_MODEL` (optional, default: `gpt-4.1-mini`)
  - `OPENAI_TRANSCRIBE_MODEL` (optional, default: `whisper-1`)

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

