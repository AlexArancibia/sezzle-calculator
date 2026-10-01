# Full-Stack Calculator

A calculator with a **React + TypeScript** frontend and a **Go** REST microservice. The frontend sends every operation to the API, which validates the input, performs the calculation and stores it in **PostgreSQL**, so the UI can show recent history.

- **Operations:** addition, subtraction, multiplication and division, plus the optional exponentiation, square root and percentage.
- **Backend:** Go 1.27 standard library (`net/http`, `encoding/json`, `log/slog`); `pgx` is the only dependency.
- **Frontend:** React 19, TypeScript, Vite, Vitest and Testing Library. Plain CSS, no UI library.
- **Run everything** with one `docker compose up`.

**Live demo:** https://calculator.axium.com.pe (API docs, console and end-to-end checks at `/docs`). The web app works as is; calling the hosted API directly requires its API key, which is shared privately with reviewers. Locally the key is `local-dev-key`.

This public repository is a mirror of the private repository the live demo is deployed from.

## Contents

- [Screenshots](#screenshots)
- [Scope](#scope)
- [Quick start with Docker](#quick-start-with-docker)
- [Running the backend and the frontend](#running-the-backend-and-the-frontend)
- [Tests and coverage](#tests-and-coverage)
- [API](#api)
- [Design decisions](#design-decisions)
- [Assumptions](#assumptions)
- [Deployment](#deployment)
- [Project structure](#project-structure)

## Screenshots

**Desktop**

![Calculator on desktop: keypad with memory keys, a result and recent calculations](docs/screenshots/desktop-calculator.png)

![API docs on desktop: the 13 end-to-end checks passing against a running API](docs/screenshots/desktop-docs.png)

**Mobile**

<p>
  <img src="docs/screenshots/mobile-calculator.png" width="260" alt="Calculator keypad on mobile with a result">
  <img src="docs/screenshots/mobile-error.png" width="260" alt="Division by zero shown as a toast on mobile">
  <img src="docs/screenshots/mobile-docs.png" width="260" alt="API console on mobile with a 200 response">
</p>

## Scope

**Core (what the assignment asks for):** the arithmetic operations, a REST API with validation and JSON errors, a React UI with input validation and error handling, responsive layout, unit tests for both layers, documentation and Docker.

**Extras, kept isolated from the core:**

| Extra | Where it lives | Without it |
|---|---|---|
| History in PostgreSQL | `backend/internal/history`, `frontend/src/components/History.tsx` | The API falls back to in-memory history when `DATABASE_URL` is empty |
| API key authentication | `backend/internal/api/middleware.go` | One middleware to remove |
| API docs page with a live console and end-to-end checks | `frontend/src/docs/` | A separate route (`/docs`) |
| Toast notifications and mobile polish | `frontend/src/toast/`, `frontend/src/styles.css` | Presentation only |

`internal/calculator` (the math) depends on none of them.

## Quick start with Docker

Requirements: Docker with Compose.

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| API docs, console and checks | http://localhost:3000/docs |
| API | http://localhost:8080 (API key `local-dev-key`) |
| PostgreSQL | `localhost:5440` (user, password and database: `calculator`) |

nginx serves the built frontend and proxies `/api` to the backend, adding the API key on the way, so the browser talks to a single origin and never holds the key. To use another key: `API_KEY=my-key docker compose up --build`.

Stop with `docker compose down` (add `-v` to also delete the database volume).

## Running the backend and the frontend

Requirements: Go 1.27+, Node 22+, and Docker only if you want PostgreSQL. The `Makefile` wraps the commands below; both forms are shown.

### 1. Database (optional)

```bash
docker compose up -d db          # or: make db
```

PostgreSQL listens on `localhost:5440`. The first start also creates `calculator_test` for the integration test (`db/init.sql`). Skip this step to keep history in memory.

### 2. Backend (http://localhost:8080)

```bash
cd backend
go mod download
API_KEYS=local-dev-key \
DATABASE_URL="postgres://calculator:calculator@localhost:5440/calculator?sslmode=disable" \
go run ./cmd/server
# or, from the repository root: make backend
```

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP port |
| `API_KEYS` | none, **required** | Comma-separated keys accepted in `X-API-Key`. The server refuses to start without one |
| `DATABASE_URL` | empty | PostgreSQL connection string. Empty keeps history in memory |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated browser origins allowed to call the API directly; `*` allows any |

The table is created on start (`CREATE TABLE IF NOT EXISTS`); there is no separate migration step.

### 3. Frontend (http://localhost:5173)

```bash
cd frontend
npm install
npm run dev
# or, from the repository root: make frontend
```

The Vite dev server proxies `/api` to `http://localhost:8080` and adds the API key.

| Variable | Default | Purpose |
|---|---|---|
| `API_KEY` | `local-dev-key` | Key the dev server adds when proxying `/api`; must be one of the backend's `API_KEYS` |
| `VITE_API_BASE_URL` | `http://localhost:8080` | Default base URL of the `/docs` console, which calls the API directly (build time) |

Production build: `npm run build` (output in `frontend/dist`).

## Tests and coverage

```bash
cd backend && go test ./... -cover         # or: make test-backend
cd frontend && npm test                    # or: make test-frontend
```

The PostgreSQL store has an integration test that runs only when `TEST_DATABASE_URL` is set; it needs the database from step 1:

```bash
cd backend
TEST_DATABASE_URL="postgres://calculator:calculator@localhost:5440/calculator_test?sslmode=disable" go test ./... -cover
# or: make test-integration
```

**Coverage reports** are committed in [`coverage/`](coverage/): [`backend.txt`](coverage/backend.txt) (`go tool cover -func`) and [`frontend.txt`](coverage/frontend.txt) (Vitest, v8). Regenerate them with `make coverage-report`, or get the HTML versions with `make coverage` (`backend/coverage.html`, `frontend/coverage/index.html`).

| Package | Coverage |
|---|---|
| `backend/internal/calculator` | 100% of statements |
| `backend/internal/api` | 100% of statements |
| `backend/internal/history` | 85.2% with the integration test, 46.3% without it |
| `backend/cmd/server` | 12.7%: the configuration helpers are unit tested; the wiring is exercised by running the service |
| Frontend | 98.1% of lines, 90.8% of branches (114 tests) |

The `/docs` page also runs 13 end-to-end checks against a running API (authentication, happy paths and every error class): the unit tests prove the code, those checks prove a deployment.

## API

Base path `/api/v1`. Request and response bodies are JSON. The same reference, with a live console, is at `/docs` in the web app.

### Authentication

Every `/api/` route requires the key in the `X-API-Key` header. `/health` is public.

```bash
curl -H 'X-API-Key: local-dev-key' http://localhost:8080/api/v1/operations

curl http://localhost:8080/api/v1/operations
# 401 {"error":{"code":"unauthorized","message":"A valid API key is required in the X-API-Key header."}}
```

### `POST /api/v1/calculate/{operation}`

`operation` is one of `add`, `subtract`, `multiply`, `divide`, `power`, `sqrt`, `percentage`. Send `a` and `b`; `sqrt` takes only `a`.

```bash
curl -X POST http://localhost:8080/api/v1/calculate/divide \
  -H 'X-API-Key: local-dev-key' -H 'Content-Type: application/json' \
  -d '{"a": 10, "b": 4}'
# 200 {"operation":"divide","a":10,"b":4,"result":2.5}

curl -X POST http://localhost:8080/api/v1/calculate/sqrt \
  -H 'X-API-Key: local-dev-key' -H 'Content-Type: application/json' \
  -d '{"a": 81}'
# 200 {"operation":"sqrt","a":81,"result":9}

curl -X POST http://localhost:8080/api/v1/calculate/percentage \
  -H 'X-API-Key: local-dev-key' -H 'Content-Type: application/json' \
  -d '{"a": 15, "b": 200}'
# 200 {"operation":"percentage","a":15,"b":200,"result":30}

curl -X POST http://localhost:8080/api/v1/calculate/divide \
  -H 'X-API-Key: local-dev-key' -H 'Content-Type: application/json' \
  -d '{"a": 1, "b": 0}'
# 422 {"error":{"code":"division_by_zero","message":"Division by zero is not allowed."}}

curl -X POST http://localhost:8080/api/v1/calculate/add \
  -H 'X-API-Key: local-dev-key' -H 'Content-Type: application/json' \
  -d '{"a": 1}'
# 400 {"error":{"code":"missing_operand","message":"Operand \"b\" is required for add."}}
```

### `GET /api/v1/operations`

Lists the supported operations with `name`, `label`, `symbol` and `arity`. The UI builds its buttons from this list.

### `GET /api/v1/history?limit=10`

The most recent calculations, newest first. `limit` is optional, from 1 to 100, default 10.

```bash
curl -H 'X-API-Key: local-dev-key' 'http://localhost:8080/api/v1/history?limit=2'
# 200 {"calculations":[{"id":2,"operation":"sqrt","a":81,"result":9,"createdAt":"2026-09-30T19:47:31Z"}, ...]}
```

### `GET /health`

Returns `{"status":"ok"}`. No key required.

### Errors

Every error has the same shape: `{"error": {"code": "...", "message": "..."}}`. Clients branch on `code`; `message` is a sentence meant for people.

| Status | Code | When |
|---|---|---|
| 400 | `invalid_json` | Empty, malformed or oversized body, a non-numeric operand, a number too large for float64, or an unknown field |
| 400 | `missing_operand` | `a`, or `b` for a two-operand operation, is missing |
| 400 | `unexpected_operand` | `b` was sent to `sqrt` |
| 400 | `invalid_limit` | `limit` is not a whole number from 1 to 100 |
| 401 | `unauthorized` | The `X-API-Key` header is missing or wrong |
| 404 | `unknown_operation` | The operation in the path is not supported |
| 404 | `not_found` | No endpoint matches the path |
| 405 | `method_not_allowed` | Wrong HTTP method; the message says which one to use |
| 422 | `division_by_zero` | Division by zero, or zero raised to a negative power |
| 422 | `negative_square_root` | Square root of a negative number |
| 422 | `undefined_result` | The result is not a real number, e.g. `(-8) ^ 0.5` |
| 422 | `out_of_range` | The result overflows float64, e.g. `10 ^ 400` |
| 500 | `internal_error` | Unexpected failure (a recovered panic) |
| 503 | `history_unavailable` | The database could not be read |

## Design decisions

**Layers with one job each.** `internal/calculator` is pure math with no HTTP or database code; `internal/api` handles HTTP, validation and error mapping; `internal/history` handles storage behind a `Store` interface. Each layer is tested on its own, and the API tests use the in-memory store.

**Operations are a registry.** Each operation is one entry (`name`, `symbol`, `arity`, function) in an ordered list. A single route, `POST /calculate/{operation}`, looks the operation up by name, so adding one (for example modulo) is one entry. The frontend reads the same list from `GET /operations` and only enables the keys of operations the API offers, so a new operation needs one entry in the API and one key on the keypad.

**Standard library first.** Go's router supports methods and path parameters since 1.22, so no web framework is needed. The only dependency is `pgx`, the most widely used PostgreSQL driver for Go.

**Validation on both sides.** The keypad can only build valid numbers (keys, physical keyboard and paste all go through the same rules, capped at 15 digits); the API validates again because it cannot trust clients:
- Operands are pointers (`*float64`), so a missing `a` is not confused with `a: 0`.
- Unknown fields are rejected, so a typo such as `"B"` fails loudly instead of being ignored.
- Request bodies are capped at 1 KB.
- `sqrt` rejects a `b` operand instead of ignoring it.

**400 vs 422.** A malformed request is the client's mistake (400). A well-formed request that is mathematically invalid, such as dividing by zero, is 422.

**Results are always finite numbers.** JSON cannot represent `NaN` or `Infinity`, so those become typed errors. Negative zero (`0 × -1`) is normalised to `0`.

**Precision.** The API returns full float64 precision (`0.1 + 0.2 = 0.30000000000000004`). The UI rounds to 12 significant digits for display (`0.3`), and the raw value stays available to API clients. A decimal type would only matter for money, which is out of scope.

**Errors are clear sentences on both sides.**
- Calculator errors stay idiomatic Go errors (`errors.Is`); the API layer maps each one to a status, a stable `code` and an English sentence. Go's own router responses (404, 405) are rewritten into the same JSON shape.
- The frontend maps every failure to a short title and an actionable sentence (`src/lib/errors.ts`) and shows it in a toast (`role="alert"` for errors, `role="status"` for confirmations). Toasts pause while hovered or focused, can be dismissed, and a repeated error replaces the previous one instead of stacking.
- Pasting text that is not a number shows a toast instead of being ignored silently.
- Unhandled promise rejections and runtime errors still produce a toast; an error boundary replaces a crashed page with a recovery screen.

**History is best effort.** A calculation is saved after it succeeds. If the database is down, the API logs the error and still returns the result; only the history endpoint reports the outage (503).

**Schema on start.** One table, created with `CREATE TABLE IF NOT EXISTS` when the service starts. A service with more tables would use a migration tool.

**API key authentication, kept simple on purpose.**
- A middleware checks `X-API-Key` on every `/api/` route before any handler runs; `/health` stays open for probes.
- Keys are compared in constant time (`crypto/subtle`).
- Several keys can be configured at once, so a key can be rotated without downtime.
- It fails closed: the server does not start without a key.
- CORS preflights are answered before the key check (browsers never send custom headers on a preflight), and only listed origins get CORS headers.
- The web app never ships the key to the browser: the Vite dev server and nginx add it when proxying `/api`. That makes the web app's own `/api` public, as with any backend-for-frontend: the key guards direct access to the API, and rate limiting at the proxy would be the next step. The `/docs` console is the exception by design: the user types a key there to call the API directly.
- An API key identifies a client application, not a user. Production hardening would add a secrets manager, hashed keys and per-key rate limiting; with user accounts, OAuth 2 or signed sessions.

**A keypad, like a desk calculator.**
- Operations run left to right (`12 + 3 × 2 = 30`), and every step is one call to `POST /calculate/{operation}`, so the API stays the only place that does math. Parentheses would need an expression endpoint, which is out of scope.
- The line under the number shows what is pending (`12 +`) or what was calculated (`12 + 3 =`); the pending operator key stays highlighted.
- `5 + =` repeats the number on screen (`5 + 5`), and √ works on the number on screen, also as a second operand (`9 + √16 = 13`).
- Memory keys: M+ and M− add to the memory through the API, MR recalls it and MC clears it. ± and ⌫ only edit the number being typed.
- On desktop the physical keyboard works too (digits, `+ - * / ^ %`, Enter, Backspace, Esc) and a number can be pasted. Enter on a link or button outside the keypad keeps its usual meaning.
- The keypad state is plain data plus small pure functions (`src/lib/keypad.ts`), so the entry rules are unit tested without rendering anything.
- A history row shows that calculation on the screen and keeps the memory; the list shows the latest 5, with the rest one tap away.

**Mobile first.**
- Six columns of keys that stay at least 47 × 52 px on a 375 px screen, with a visible pressed state.
- No text inputs on the calculator, so the phone keyboard never opens over the result.
- Toasts sit at the bottom within thumb reach and respect safe areas; reduced motion is respected; icons are inline SVG.

**Operational details.**
- The server sets read, write and idle timeouts and shuts down gracefully on SIGTERM.
- It logs as JSON with `log/slog`, and a middleware turns panics into a 500.
- The backend image is a static binary on distroless (no shell), running as non-root.

## Assumptions

- **Percentage** means "a percent of b": `percentage(15, 200) = 30`.
- **Exponentiation** follows IEEE 754 (`0 ^ 0 = 1`), except `0` to a negative power, which is reported as division by zero.
- **UI inputs** accept only digits, one decimal point and a leading minus sign; anything else is dropped as it is typed or pasted. A comma becomes the decimal point (some mobile keypads use it), or is dropped as a thousands separator when a point is present. The API itself accepts any JSON number.
- There are no user accounts, so history is shared by everyone using the instance.

## Deployment

The live demo runs the same two Dockerfiles on a single VPS with Dokploy (Docker Swarm with Traefik):

- Each app is built from this repository on every push to `main` (build paths `backend/` and `frontend/`), and Traefik terminates TLS with Let's Encrypt.
- **Backend** environment: `API_KEYS`, `DATABASE_URL` and `CORS_ORIGINS` (the web app's origin). The backend reaches PostgreSQL over the internal Docker network, using a dedicated database and a role that owns only that database.
- **Frontend** environment: `API_KEY` and `BACKEND_URL` (the backend's internal service name, e.g. `http://backend:8080`), plus the build argument `VITE_API_BASE_URL` (the public API URL, used by `/docs`).
- nginx resolves the backend through Docker's DNS at request time, so the frontend starts even if the backend is not up yet.

## Project structure

```
backend/
  cmd/server/            entry point: configuration, wiring, graceful shutdown
  internal/calculator/   pure arithmetic, operation registry, typed errors
  internal/api/          HTTP handlers, validation, error mapping, middleware (API key, CORS, recovery)
  internal/history/      Store interface, in-memory and PostgreSQL implementations, schema
  Dockerfile             static build on distroless
frontend/
  src/api/               typed API client and ApiError
  src/components/        Calculator, History, ErrorBoundary, icons
  src/pages/             calculator page
  src/docs/              API docs page, request console, end-to-end API checks
  src/lib/               keypad entry rules, number formatting, error messages
  src/toast/             toast notifications and global error listeners
  src/router.tsx         minimal client-side router (two pages do not need a library)
  nginx.conf.template    static files + /api proxy that adds the API key
  Dockerfile             Vite build served by nginx
coverage/                committed coverage reports (backend and frontend)
docs/screenshots/        README screenshots (desktop and mobile)
db/init.sql              creates the test database on the first start
docker-compose.yml       PostgreSQL + backend + frontend
Makefile                 shortcuts for the commands above
PROMPTS.md               prompts used with the AI assistant during development
```
