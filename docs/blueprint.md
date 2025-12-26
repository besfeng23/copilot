# COPILOT DASHBOARD — LOCKED SYSTEM OVERVIEW

Copilot is a **dashboard**: a cockpit for execution that acts like a **brain + nervous system + hands** for shipping.

- **Cockpit/brain**: a single place to see state, decisions, and the “one best next action”.
- **Nervous system**: captures signals (intake, voice, notes) and routes them into structured artifacts.
- **Hands**: generates plans/prompts and drives the next concrete step, without pretending to be a full autonomous agent.
- **Memory**: explicit, org-scoped memory objects (and optional embeddings) used to support recall/search; it is not “ambient”.
- **Datasets + evals**: designed to support repeatable inputs/outputs and future evaluation of quality.

What this is NOT:
- Not a generic chat UI.
- Not a hidden “always-on” agent.
- Not a secret store (never store secrets in docs/env; only names).

# **App Name**: Copilot Projects

## Core Features:

- Firebase Authentication: Authenticates users via Firebase Auth (Email/Password).
- Protected Routes: Redirects unauthenticated users to the login page.
- Project List: Fetches and displays a list of projects via the backend API.
- Access Bootstrap: Initializes user access by calling the bootstrap API if the user is not a member.
- Create Project: Allows users to create new projects via the backend API.
- Error Handling: Displays user-friendly error messages for API calls and authentication.
- Project Search: Enables users to search for projects by name.
- Project Filtering: Allows users to filter projects based on status or other criteria.

## Style Guidelines:

- Primary color: Deep indigo (#3F51B5) for a professional and trustworthy feel, inspired by coding environments and tools.
- Background color: Light grey (#F0F2F5), a slightly desaturated indigo for a clean and unobtrusive background.
- Accent color: Royal blue (#4CAF50), brighter than the primary and background color to create good contrast and visual interest for calls to action and other clickable/interactive ui elements
- Body and headline font: 'Inter', a sans-serif with a modern and neutral look suitable for both headlines and body text.
- Code font: 'Source Code Pro' for displaying code snippets.
- Use minimalist, line-based icons to represent project-related actions and statuses.
- Subtle animations for loading states and transitions to provide a smooth user experience.