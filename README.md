# ThinkWeave Frontend

A collaborative workspace for documents, diagrams, and visual planning, with live editing, threaded comments, semantic search, and AI-assisted creation.

This is the separate React/TypeScript frontend for [ThinkWeave's Node.js backend](https://github.com/Utpalsonowal7/Thinkweave). It replaces the earlier notes-only client prototype. The backend remains in its own repository; no backend or provider secrets belong here.

## Run locally

Use Node.js 24:

```powershell
git clone https://github.com/Utpalsonowal7/ThinkWeave-Frontend.git
cd ThinkWeave-Frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. Set `VITE_API_URL=http://localhost:8080` in `.env` for the local backend. Do not mix `localhost` and `127.0.0.1`: they are different trusted origins. Preserve your existing `.env` when updating.

The backend must use `APP_ORIGIN=http://localhost:5173`, `APP_URL=http://localhost:5173`, and an OAuth success redirect pointing to the frontend. Run its PostgreSQL migrations, Redis, API, and indexing worker according to that repository's README. The full app requires those services; this frontend does not start or replace them.

For an interface preview without the backend, open `/demo`. The demo includes editable sample objects and persists changes in this browser's IndexedDB. It has no simulated teammates and makes no Gemini requests. Comments, search, and server version history are explained rather than faked; use a connected account for those features.

## Features

- Workspace overview, board cards/filtering, team roles, invitations, ownership transfer, and archive recovery.
- Password, Google, and GitHub sign-in; verification, reset, account linking, and session revocation.
- Canvas with sticky notes, shared-text documents, shapes, tasks, sections, connectors, resizing, colors, and task dependencies.
- Socket.IO protocol 2 with Yjs, IndexedDB, live cursors, object selections, role changes, and reconnect synchronization.
- Local undo/redo, save status, offline changes, 8 MiB chunked recovery sync, and local export.
- Anchored comment threads, replies, edit/delete, resolve/reopen, and cursor pagination.
- Gemini proposals for tasks, roadmaps, diagrams, summaries, and explanations, with preview and explicit approval.
- Workspace semantic search, source navigation, index status, and reindex controls.
- Named versions, read-only previews, restore with epoch preconditions, activity, and compaction.
- Responsive sidebar, canvas toolbar, collapsible inspector, mobile tools, focus indicators, and reduced-motion styles.

## Commands

| Command             | Purpose                              |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Start Vite on port 5173              |
| `npm run typecheck` | Check TypeScript                     |
| `npm run build`     | Check types and build `dist/`        |
| `npm run preview`   | Preview the production build locally |

No automated test files are included, as requested. Type checking and production builds are verified. Real provider, database, multi-client, and browser acceptance checks remain separate work; a build is not a claim of production reliability or measured scale.

## Hosting

Deploy `dist/` with an SPA fallback to `index.html` for `/board/*`, `/workspace/*`, and auth routes. `VITE_API_URL` is public and embedded at build time. Rebuild after changing it. Never place Gemini, Brevo, database, OAuth client secrets, or signing keys in `VITE_*` variables.

Production needs HTTPS and same-site frontend/API hosting for the backend's strict cookies, for example frontend and API subdomains of the same parent domain. Set the exact frontend origin and URLs in the backend. A frontend hosted on a different site requires a deliberate cookie/CSRF design; credentialed CORS alone is insufficient. The API reverse proxy must support Socket.IO WebSocket upgrades on `/socket.io/`.

## Review guide

Read [the frontend structure and sync flow](docs/frontend.md) and [the manual acceptance checklist](docs/review.md). Backend endpoints and canonical object constraints are documented in the backend repository's `docs/` folder.
