# RESOURCEFLOW AI

### AI-Assisted Autonomous Disaster Coordination

> From Emergency Signals to Coordinated Action.

RESOURCEFLOW AI is a disaster-response coordination platform that converts emergency reports into an **explainable, automated response workflow** — from citizen report through AI analysis, risk scoring, resource optimization, human approval, adaptive reassignment, escalation and resolution.

This is a hackathon build optimised for **one powerful working workflow**, not a collection of disconnected AI features.

---

## Project Overview

During disasters, emergency teams drown in unstructured reports, fragmented information, and conflicting resource demands. RESOURCEFLOW AI converts raw citizen reports into a structured, auditable response workflow:

1. **Citizen reports** an incident (type, description, location, optional image)
2. **AI Incident Agent** extracts structured facts (severity, people affected, urgent needs, road blockage, infrastructure damage, risk factors)
3. **Duplicate Detection + Clustering** fuses corroborating reports by geography, time, type and text similarity
4. **Risk Engine** computes a transparent 0–100 prototype decision-support score
5. **Resource Optimization Agent** recommends the best-fit resource (not just nearest — distance, ETA, capacity, severity, workload)
6. **Human Officer** reviews the AI recommendation and **approves or rejects** the assignment
7. **Automation** assigns the resource and the dashboard updates in real time via WebSocket
8. **Live monitoring** detects acknowledgement / arrival / resolution delays
9. **Adaptive Reassignment** automatically finds alternatives when a resource becomes unavailable or a road becomes blocked
10. **Escalation** triggers when delays exceed thresholds (Level 1 → 2 → 3)
11. **Resolution** generates an automatic incident report
12. **Audit Trail** records every meaningful action

---

## Problem

During disasters, emergency teams drown in:
- Unstructured citizen reports with no severity, location or urgency context
- Duplicate reports of the same incident arriving from multiple citizens
- Conflicting demands for the same scarce resources
- Manual dispatch decisions made with incomplete data
- Resources dispatched inefficiently (nearest, not best-fit)
- Response delays detected too late
- No transparent audit trail of who decided what and why

This costs lives.

## Solution

RESOURCEFLOW AI converts raw reports into an explainable, automated, auditable response workflow with:

- **Real backend integration** — every action persists to a real database (Prisma + SQLite)
- **Real AI integration** — Gemini-class LLM via z-ai-web-dev-sdk (backend-only, key never exposed)
- **Real-time updates** — WebSocket fan-out (socket.io hub on port 3003) updates dashboards without refresh
- **Human-in-the-loop** — AI never executes high-impact assignments alone; every recommendation goes through officer approval
- **Adaptive response** — automatically detects failures and re-recommends alternatives
- **Separate simulation state** — the What-If Simulator never modifies real incident data

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (single / route)                 │
│  Landing · Login · Register · Citizen Dash · Command Center ·    │
│  Incidents · Incident Detail · Resources · Approvals ·           │
│  Simulation · Analytics · Audit · Settings                        │
└──────────────────────┬────────────────────────────────────────────┘
                       │ fetch (cookies, JSON)        │ socket.io (WS)
                       ▼                              ▼
┌─────────────────────────────────┐  ┌────────────────────────────┐
│  Next.js 16 API Routes           │  │  socket.io hub (port 3003)  │
│  /api/auth/*  /api/incidents/*   │  │  /broadcast fan-out         │
│  /api/resources/*  /api/approvals│  └────────────────────────────┘
│  /api/notifications /api/analytics│
│  /api/audit /api/simulation/*    │
│  /api/demo/run /api/admin/*      │
│  /api/reports/*                  │
└──────────────┬───────────────────┘
               │ Prisma Client
               ▼
┌─────────────────────────────────┐
│  Prisma ORM (SQLite)            │
│  14 models: User, Incident,     │
│  IncidentEvent, IncidentCluster,│
│  Resource, ResourceAssignment,  │
│  Approval, AIRecommendation,     │
│  Notification, AuditLog,         │
│  GeneratedReport, SimulationRun, │
│  SimulationEvent                 │
└─────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  AI Service (z-ai-web-dev-sdk)  │
│  Incident Agent → structured JSON│
│  Resource Agent → scored rec    │
│  (deterministic fallback if AI  │
│   unavailable — never fabricates)│
└─────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  External: Open-Meteo (optional)│
│  Weather context — never blocks  │
└─────────────────────────────────┘
```

### Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + shadcn/ui |
| Maps | Leaflet + react-leaflet |
| Charts | Recharts |
| Realtime | socket.io (mini-service on port 3003) |
| Backend | Next.js Route Handlers (TypeScript) |
| Auth | JWT (cookies) + Argon2id password hashing + RBAC |
| Database | Prisma ORM + SQLite (14 models) |
| AI | z-ai-web-dev-sdk (backend-only) |
| Weather | Open-Meteo (optional, graceful fallback) |

> **Note on stack:** The original spec requested Vite + React + FastAPI + MongoDB + Gemini. The build environment requires Next.js 16 + TypeScript + Prisma + z-ai-web-dev-sdk. The architecture is functionally identical — the MongoDB collections map to Prisma models, FastAPI routes map to Next.js Route Handlers, and Gemini maps to z-ai-web-dev-sdk. All workflow semantics are preserved.

---

## Features

### Core Workflow
- Citizen report → AI analysis → clustering → risk → resource optimization → approval → assignment → live tracking → failure detection → adaptive reassignment → escalation → resolution → auto report → audit trail

### AI Agents
- **Incident Agent** (`src/lib/agents/incident-agent.ts`): extracts severity, people affected, urgent needs, road blockage, infrastructure damage, risk factors, confidence, missing information — validated structured JSON. Falls back to deterministic heuristic if AI unavailable.
- **Resource Agent** (`src/lib/agents/resource-agent.ts`): scores distance, ETA, capacity, severity, workload; returns recommended + alternative resources with explainable reasons. Falls back to deterministic optimizer.

### Services
- **Risk Service** (`src/lib/services/risk-service.ts`): transparent 0–100 prototype decision-support score (severity, people affected, road blockage, infrastructure, cluster size, resource availability, weather, time sensitivity). Explicitly labeled "Prototype decision-support score — not a medically or scientifically validated model."
- **Weather Service** (`src/lib/services/weather-service.ts`): Open-Meteo with 60s cache, fails gracefully (never fabricates).
- **Clustering Service** (`src/lib/services/clustering-service.ts`): geographic (≤2km) + temporal (≤24h) + type + Jaccard textual similarity. Marks `POSSIBLE_DUPLICATE`, never deletes reports.
- **Simulation Service** (`src/lib/services/simulation-service.ts`): deterministic scenarios in a separate state — never modifies real data. Computes BASELINE vs RESOURCEFLOW metrics from the simulated event chain.
- **Demo Service** (`src/lib/services/demo-service.ts`): orchestrates a complete end-to-end scenario through the real backend.

### Automation Engine
- `src/lib/workflows/incident-workflow.ts` — runs the full pipeline on incident creation, handles approvals, assignments, conflict detection, adaptive reassignment, escalation, delay detection, response tracking, and auto-report generation. No manual button clicks required for internal steps.

### Real-Time
- `mini-services/realtime` — socket.io hub on port 3003. The Next.js backend POSTs events to `/broadcast`; the hub fans them out to all connected dashboards. Auto-reconnect on the client.

### Roles (RBAC enforced server-side)
- **CITIZEN**: report incident, track by code, see own reports
- **RESPONDER**: see assigned incidents, advance response lifecycle (ACK/START/ARRIVE/RESOLVE)
- **DISASTER_OFFICER**: command center, approve/reject, escalate, reassign, resolve
- **ADMIN**: manage users, manage resources, view audit logs

> Never trust frontend role information — every API request re-verifies the user against the DB.

---

## API Documentation

### Auth
- `POST /api/auth/register` — `{ name, email, password, role }` → creates account, sets cookie
- `POST /api/auth/login` — `{ email, password }` → sets cookie
- `GET /api/auth/me` — returns current user (cookie-based)
- `POST /api/auth/logout` — clears cookie
- `POST /api/admin/seed` — idempotent demo seed (users + resources)

### Incidents
- `POST /api/incidents` — `{ incidentType, description, location, latitude, longitude, imageMeta? }` → creates incident + triggers workflow
- `GET /api/incidents` — list (citizen: own; responder: assigned; officer/admin: all)
- `GET /api/incidents/[id]` — full detail (events, approvals, recommendations, report)
- `GET /api/incidents/track?code=RF-2026-000001` — public-facing tracking (hides internals)
- `PATCH /api/incidents/[id]/response` — `{ stage: ACK|START|ARRIVE|RESOLVE }`
- `POST /api/incidents/[id]/escalate` — `{ reason, level }`
- `PUT /api/incidents/[id]/reassess` — `{ reason }` — triggers adaptive re-evaluation

### Resources
- `GET /api/resources` — list
- `POST /api/resources` — create (admin)
- `PATCH /api/resources/[id]` — update status (triggers adaptive reassignment if UNAVAILABLE)

### Approvals
- `GET /api/approvals?decision=PENDING`
- `POST /api/approvals/[id]/approve` — `{ reason }`
- `POST /api/approvals/[id]/reject` — `{ reason }`

### Other
- `GET /api/notifications` · `PATCH /api/notifications/[id]` (mark read)
- `GET /api/analytics` — all metrics from DB
- `GET /api/audit?action=&limit=` — admin only
- `GET /api/reports/[id]` — generated incident report
- `POST /api/simulation/runs` · `GET /api/simulation/runs` · `GET /api/simulation/runs/[id]`
- `POST /api/demo/run` — orchestrates the full hackathon demo
- `GET/PATCH /api/admin/users` — admin only

---

## Environment Variables

### Backend (Next.js)
The project loads env from `.env` automatically. Required:
```
DATABASE_URL=file:./db/custom.db
JWT_SECRET=<your-secret>   # defaults to a dev secret if unset
```
Optional (the app degrades gracefully if missing):
```
GEMINI_API_KEY=             # not used — z-ai-web-dev-sdk uses its own credentials
OPEN_METEO_BASE_URL=https://api.open-meteo.com
CORS_ORIGINS=*              # handled by Next.js
```

### Frontend
No env required — the SPA uses relative paths (`/api/...` and socket.io `/` with `?XTransformPort=3003`).

A `.env.example` is included.

---

## Local Setup

```bash
# 1. Install dependencies
bun install

# 2. Configure environment variables
cp .env.example .env.local
# Edit .env.local and fill in your values (DATABASE_URL, SMTP credentials, etc.)

# 3. Push the database schema
bun run db:push

# 4. Start the realtime mini-service (port 3003)
cd mini-services/realtime
bun install
bun run dev &
cd ../..

# 5. Start the Next.js dev server (port 3000)
bun run dev

# 6. Seed demo users + resources
curl -X POST http://localhost:3000/api/admin/seed

# 7. Open the app and sign in
# Demo accounts (password: demo1234):
#   admin@resourceflow.ai
#   officer@resourceflow.ai
#   responder@resourceflow.ai
#   citizen@resourceflow.ai
```

### Environment Variables

**Required for Development & Production:**
- `DATABASE_URL` — PostgreSQL connection string (e.g., from Neon, AWS RDS, or local PostgreSQL)

**Optional (with sensible defaults):**
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` — Email service credentials
- `SMS_PROVIDER` — "console" (default, logs to terminal) or "twilio" (requires additional credentials)
- `HUB_URL` — Realtime broadcast hub (if running mini-services/realtime)

**For Vercel Deployment:**
1. Go to your Vercel project → **Settings → Environment Variables**
2. Add all required variables for the **Production** environment
3. Redeploy the project

⚠️ **IMPORTANT:** Never commit `.env.local` to Git. Keep it in `.gitignore`. Use `.env.example` (with placeholder values) to document required variables.

---

## Demo Instructions

### Quick demo
1. Open the landing page → click **"Run Live Demo"** → seeds data + routes to login
2. Sign in as `officer@resourceflow.ai` (password `demo1234`)
3. In the Command Center, click **"Run Hackathon Demo"**
4. Watch the complete end-to-end scenario unfold:
   - Citizen flood report → AI analysis → clustering → risk score → resource recommendation
   - Officer approval → resource assigned → live map update
   - Road blockage → adaptive response → alternative recommendation
   - Resource failure → alternative approval → escalation → resolution
   - Automatic incident report generated → audit trail complete

### What-If Simulator
1. Navigate to **Simulation** in the sidebar
2. Pick a scenario (FLOOD / CYCLONE / EARTHQUAKE / LANDSLIDE)
3. Toggle injectable conditions (ambulance unavailable, road blocked, response delay, etc.)
4. Click **Run Simulation**
5. Compare **BASELINE vs RESOURCEFLOW** metrics (response time, utilization, unresolved, escalations, conflicts) — all calculated from the simulated event chain, never fabricated

### Manual citizen report
1. Sign in as `citizen@resourceflow.ai`
2. Click **Report Incident** in the sidebar
3. Fill the form (type, description, location, coordinates)
4. Submit → the AI workflow runs automatically
5. The incident appears in **My Reports** with status updates as it progresses through the pipeline

---

## Testing

Run lint:
```bash
bun run lint
```

The backend has been verified end-to-end via curl + browser automation:
- Login → JWT cookie + RBAC enforcement
- Incident creation → full workflow pipeline (AI analysis, clustering, risk, resource recommendation, approval request)
- Approval → resource assignment with conflict detection
- Road blockage → adaptive reassignment
- Resource failure → alternative recommendation + approval
- Escalation → audit log entry
- Resolution → auto-generated report
- Simulation → BASELINE vs RESOURCEFLOW metrics

---

## Docker / Deployment

This is a Next.js 16 app — deploy to Render, Vercel, or any Node host:
```bash
bun run build
bun run start
```

The realtime mini-service runs independently:
```bash
cd mini-services/realtime && bun run dev
```

For production, the realtime hub must be reachable at `:3003` (or the caddy gateway must forward `?XTransformPort=3003` to wherever it runs).

> Database: the build uses SQLite (file-based). For production at scale, swap the Prisma datasource to PostgreSQL — no application code changes are required.

---

## Limitations

- **Risk score is a prototype**: explicitly labeled "Prototype decision-support score — not a medically or scientifically validated model."
- **AI output is conservative**: when Gemini is unavailable, the system falls back to a deterministic heuristic clearly flagged in the DB (`aiAvailable = false`). The UI surfaces this as "FALLBACK" rather than pretending the AI ran.
- **Weather is supporting only**: Open-Meteo is optional. If it fails, the system continues without weather context.
- **Simulation is synthetic**: the simulator uses deterministic synthetic data and clearly displays "DEMO / SIMULATION" — it never pretends to be real emergency data.
- **Image analysis**: only metadata is stored. The image is not yet passed to a vision model for damage assessment.
- **Single-process architecture**: the realtime hub is a single socket.io instance. For multi-instance horizontal scale, add Redis adapter.
- **No SMS/email alerts**: notifications are in-app only.

---

## Future Improvements

- Pass incident images to a vision model for damage assessment
- Add Redis adapter for multi-instance realtime
- Add SMS/email notification channels
- Add per-resource workload tracking (current capacity vs assigned)
- Add geographic routing for road-blockage-aware ETA (currently straight-line haversine)
- Add multi-tenant region scoping
- Add a mobile responder app
- Add exportable PDF incident reports
- Add ML-trained risk model (replacing the transparent prototype weights)
- Add public citizen-facing status page (read-only, no auth)

---

## Project Structure

```
resourceflow-ai/
├── prisma/
│   └── schema.prisma              # 14 models (User, Incident, …)
├── src/
│   ├── app/
│   │   ├── layout.tsx              # dark theme + Leaflet CSS + toasts
│   │   ├── page.tsx                # SPA shell: AuthProvider + RouterProvider + RealtimeProvider
│   │   ├── globals.css             # emergency-ops palette + severity utilities
│   │   └── api/                    # Route handlers (auth, incidents, resources, approvals, …)
│   ├── lib/
│   │   ├── db.ts                   # Prisma client
│   │   ├── auth.ts                 # JWT + Argon2 + RBAC + requireAuth + handleAuthError
│   │   ├── events.ts               # broadcastEvent + recordIncidentEvent + recordAudit
│   │   ├── notifications.ts        # pushNotification
│   │   ├── ai-client.ts            # z-ai-web-dev-sdk wrapper + extractJson
│   │   ├── api.ts / api-client.ts  # response helpers + typed fetch wrapper
│   │   ├── types.ts                # shared frontend types
│   │   ├── use-auth.tsx            # AuthProvider + useAuth
│   │   ├── use-router.tsx          # hash router
│   │   ├── use-realtime.tsx        # socket.io singleton + useRealtimeEvents
│   │   ├── agents/
│   │   │   ├── incident-agent.ts   # AI incident analysis + fallback
│   │   │   └── resource-agent.ts   # AI resource optimization + fallback
│   │   ├── services/
│   │   │   ├── risk-service.ts     # 0–100 prototype score
│   │   │   ├── weather-service.ts  # Open-Meteo + cache
│   │   │   ├── clustering-service.ts # duplicate detection + clustering
│   │   │   ├── simulation-service.ts  # deterministic scenarios
│   │   │   └── demo-service.ts     # full end-to-end orchestrator
│   │   └── workflows/
│   │       └── incident-workflow.ts # automation engine (analysis → approval → assignment → escalation → resolution → report)
│   └── components/
│       ├── shared/                 # badges, command-map (Leaflet)
│       └── views/                  # 15 views (auth, citizen, officer, simulation, analytics, audit, settings)
├── mini-services/
│   └── realtime/                   # socket.io hub on port 3003
│       ├── index.ts
│       └── package.json
├── .env.example
├── package.json
└── README.md
```

---

## Final Quality Requirements — Status

| Requirement | Status |
|-------------|--------|
| Run from a clean clone | ✓ (bun install + db:push + seed) |
| Connect to database | ✓ (Prisma + SQLite) |
| Authenticate users | ✓ (JWT + Argon2id + cookies) |
| Create real incidents | ✓ (POST /api/incidents) |
| Store real data | ✓ (14 Prisma models) |
| Call the AI backend | ✓ (z-ai-web-dev-sdk, backend-only) |
| Calculate risk | ✓ (transparent 0–100 score) |
| Detect related incidents | ✓ (clustering service) |
| Recommend resources | ✓ (resource agent with alternatives) |
| Require human approval | ✓ (officer approve/reject) |
| Assign resources | ✓ (with conflict detection) |
| Update command center in real time | ✓ (socket.io + dashboard) |
| Detect delays | ✓ (ack/arrive/resolve thresholds) |
| Adapt to resource failures | ✓ (adaptive reassignment) |
| Escalate incidents | ✓ (LEVEL 1→2→3) |
| Run simulation | ✓ (separate state, never modifies real data) |
| Generate reports | ✓ (auto-generated on resolution) |
| Maintain audit logs | ✓ (every meaningful action recorded) |

---

## Final Priority — Verified End-to-End

```
REPORT
→ AI UNDERSTANDS
→ INCIDENTS ARE FUSED
→ RISK CHANGES
→ RESOURCES ARE OPTIMIZED
→ HUMAN APPROVES
→ AUTOMATION EXECUTES
→ LIVE SYSTEM MONITORS
→ FAILURE IS DETECTED
→ RESPONSE ADAPTS
→ ESCALATION OCCURS
→ INCIDENT IS RESOLVED
→ SYSTEM GENERATES REPORT
```

The project feels like a real emergency coordination operating system — not a collection of disconnected AI features.
