# Codewarden 2

Codewarden 2 is a TypeScript rebuild of the original backend and frontend. It keeps the original analysis workflow, CloudWatch ingest, Firebase storage and dashboard, and adds:

- a GitHub App integration for private repositories and pull requests;
- a live backend activity stream shown on the dashboard, the activity page and the analysis screen;
- typed API clients, shared domain types and strict TypeScript checks.

## Layout

- `backend/` — Express API, LangGraph analysis workflow, Chroma knowledge base, CloudWatch ingest, GitHub App service.
- `frontend/` — React 19 + Vite + Tailwind CSS v4 dashboard.

## Quick start

Requires Node 22+ and npm.

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

In another terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The API listens on `http://localhost:3000` and the UI on `http://localhost:5173` by default. Leave the Firebase variables empty to explore the UI in browser-only demo mode.

## Verification

```bash
cd backend
npm run typecheck
npm test
npm run build
```

```bash
cd frontend
npm run typecheck
npm run lint
npm run build
```

## GitHub App setup

1. Create an App at https://github.com/settings/apps/new.
2. Give it repository permissions:
   - Contents: read and write
   - Pull requests: read and write
   - Metadata: read
3. Subscribe to the webhook events `installation` and `installation_repositories`.
4. Set the webhook URL to `{CODEWARDEN_PUBLIC_API_URL}/api/github/webhook` and use the same value for `GITHUB_APP_WEBHOOK_SECRET` in the backend `.env`.
5. Generate a private key and set either `GITHUB_APP_PRIVATE_KEY` or `GITHUB_APP_PRIVATE_KEY_PATH`.
6. Fill in `GITHUB_APP_ID`, `GITHUB_APP_SLUG` and, optionally, `GITHUB_APP_INSTALL_ACCOUNT`.
7. Restart the API, then open Settings or onboarding in the UI and install the App on your account.

The frontend calls `/api/github/config`, `/api/github/installations`, `/api/github/repositories` and `/api/github/link` to connect a repository. `installationId` is stored on the workspace and passed to analysis requests, so private clones and pull requests use an installation token.

## Activity stream

The backend publishes structured events for analysis steps, GitHub App calls, webhooks, CloudWatch ingestion and system errors. Events are available from:

- `GET /api/activity`
- `GET /api/activity/stream` (Server-Sent Events)

The frontend opens the stream with `EventSource`, merges new events into the query cache and shows a live status indicator. Events are held in memory for `ACTIVITY_TTL_MS` and are cleared when the API restarts.

## Main API routes

- `GET /api/health`
- `GET /api/repos/branches?repoUrl=...&installationId=...`
- `POST /api/incidents/analyze`
- `GET /api/incidents/jobs/:jobId`
- `GET /api/incidents`
- `POST /api/ingest/cloudwatch`
- `GET /api/ingest/cloudwatch/template`
- `GET /api/ingest/cloudwatch/status`
- `GET|POST /api/github/...`
- `GET /api/activity`
- `GET /api/activity/stream`

Firebase is optional for API-only use: send `repoUrl`, `branch` and `ownerUid` with an incident request. The web UI uses Firebase to persist workspaces and incidents.
