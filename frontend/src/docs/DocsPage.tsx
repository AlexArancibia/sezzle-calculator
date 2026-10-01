import { useState, type ReactNode } from "react";
import { ApiConsole } from "./ApiConsole";
import { ApiTestRunner } from "./ApiTestRunner";

const DEFAULT_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";
const KEY_STORAGE = "docs-api-key";

function readStoredKey(): string {
  try {
    return sessionStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

interface DocsPageProps {
  fetchImpl?: typeof fetch;
}

const SECTIONS = [
  ["overview", "Overview"],
  ["authentication", "Authentication"],
  ["endpoints", "Endpoints"],
  ["errors", "Errors"],
  ["try-it", "Try it"],
  ["tests", "Test the API"],
] as const;

export function DocsPage({ fetchImpl }: DocsPageProps) {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [apiKey, setApiKeyState] = useState(readStoredKey);
  const [showKey, setShowKey] = useState(false);
  const isLocal = /localhost|127\.0\.0\.1/.test(baseUrl);

  function setApiKey(value: string) {
    setApiKeyState(value);
    // Remembered only for this browser tab, so it is not lost on reload.
    try {
      sessionStorage.setItem(KEY_STORAGE, value);
    } catch {
      // Storage can be blocked (private mode); the field still works.
    }
  }

  return (
    <div className="docs">
      <nav className="docs-toc" aria-label="On this page">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <article className="docs-body">
        <section id="overview">
          <h2>Overview</h2>
          <p>
            The calculator API is a small REST service written in Go. It accepts and returns JSON, and every successful
            calculation is stored in PostgreSQL.
          </p>
          <ul>
            <li>
              Base URL: <code>{baseUrl}</code> (the web app reaches it through its own server at <code>/api</code>)
            </li>
            <li>
              Versioned under <code>/api/v1</code>
            </li>
            <li>Numbers are IEEE 754 double precision floats</li>
          </ul>
        </section>

        <section id="authentication">
          <h2>Authentication</h2>
          <p>
            Every <code>/api/</code> route requires an API key in the <code>X-API-Key</code> header. <code>/health</code> is
            public so load balancers can probe the service.
          </p>
          <pre className="code">
            <code>{`curl -H 'X-API-Key: <your-api-key>' ${baseUrl}/api/v1/operations`}</code>
          </pre>
          <p>A missing or wrong key returns:</p>
          <pre className="code">
            <code>{`401 Unauthorized
{"error": {"code": "unauthorized", "message": "A valid API key is required in the X-API-Key header."}}`}</code>
          </pre>
          <p className="muted">
            The server reads its keys from <code>API_KEYS</code> (comma-separated, so keys can be rotated). The local demo
            key is <code>local-dev-key</code>. The web app never ships the key to the browser: the dev server and nginx add
            it when they proxy <code>/api</code>.
          </p>
        </section>

        <section id="endpoints">
          <h2>Endpoints</h2>

          <Endpoint method="POST" path="/api/v1/calculate/{operation}" title="Calculate">
            <p>
              <code>operation</code> is one of <code>add</code>, <code>subtract</code>, <code>multiply</code>,{" "}
              <code>divide</code>, <code>power</code>, <code>sqrt</code> or <code>percentage</code>. Send <code>a</code> and{" "}
              <code>b</code>; <code>sqrt</code> takes only <code>a</code>. <code>percentage</code> is &ldquo;a percent of
              b&rdquo;.
            </p>
            <Example request={`{"a": 10, "b": 4}`} response={`200 OK\n{"operation": "divide", "a": 10, "b": 4, "result": 2.5}`} />
          </Endpoint>

          <Endpoint method="GET" path="/api/v1/operations" title="List operations">
            <p>Returns every supported operation with its name, label, symbol and arity (number of operands).</p>
            <Example
              response={`200 OK\n{"operations": [{"name": "add", "label": "Addition", "symbol": "+", "arity": 2}, …]}`}
            />
          </Endpoint>

          <Endpoint method="GET" path="/api/v1/history?limit=10" title="Recent calculations">
            <p>
              Newest first. <code>limit</code> is optional, between 1 and 100, default 10.
            </p>
            <Example
              response={`200 OK\n{"calculations": [{"id": 12, "operation": "sqrt", "a": 81, "result": 9, "createdAt": "2026-09-30T18:47:03Z"}]}`}
            />
          </Endpoint>

          <Endpoint method="GET" path="/health" title="Health check">
            <Example response={`200 OK\n{"status": "ok"}`} />
          </Endpoint>
        </section>

        <section id="errors">
          <h2>Errors</h2>
          <p>
            Errors always look like <code>{`{"error": {"code": "…", "message": "…"}}`}</code>. Clients should branch on{" "}
            <code>code</code>; <code>message</code> is for people.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Code</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {ERRORS.map(([status, code, when]) => (
                  <tr key={code}>
                    <td className="num">{status}</td>
                    <td>
                      <code>{code}</code>
                    </td>
                    <td>{when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="try-it">
          <h2>Try it</h2>
          <p className="muted">Requests go straight from your browser to the API, with the key you enter here.</p>
          <div className="connection" aria-label="Connection settings">
            <div className="console-row">
              <div className="field">
                <label htmlFor="docs-base-url">Base URL</label>
                <input id="docs-base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="docs-api-key">API key</label>
                <div className="key-input">
                  <input
                    id="docs-api-key"
                    type={showKey ? "text" : "password"}
                    autoComplete="off"
                    placeholder="Paste or type your key"
                    aria-describedby="docs-api-key-hint"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value.trim())}
                  />
                  <button type="button" className="ghost" onClick={() => setShowKey((s) => !s)}>
                    {showKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            </div>
            <p id="docs-api-key-hint" className="hint">
              {isLocal ? (
                <>
                  Running locally, the key is <code>local-dev-key</code>.{" "}
                  <button type="button" className="link-button" onClick={() => setApiKey("local-dev-key")}>
                    Use it
                  </button>
                </>
              ) : (
                <>
                  The hosted API needs the key its owner configured in <code>API_KEYS</code>. Don't have it? Run the
                  project locally (see the README) and use <code>local-dev-key</code>.
                </>
              )}
            </p>
          </div>
          <ApiConsole baseUrl={baseUrl} apiKey={apiKey} fetchImpl={fetchImpl} />
        </section>

        <section id="tests">
          <h2>Test the API</h2>
          <p className="muted">
            Runs end-to-end checks against the API set in &ldquo;Try it&rdquo;, with the same key: authentication, the
            happy paths and every kind of error.
          </p>
          <ApiTestRunner baseUrl={baseUrl} apiKey={apiKey} fetchImpl={fetchImpl} />
        </section>
      </article>
    </div>
  );
}

const ERRORS: [number, string, string][] = [
  [400, "invalid_json", "Empty, malformed or oversized body, a non-numeric operand, or an unknown field"],
  [400, "missing_operand", "a, or b for a two-operand operation, is missing"],
  [400, "unexpected_operand", "b was sent to sqrt"],
  [400, "invalid_limit", "limit is not a whole number between 1 and 100"],
  [401, "unauthorized", "The X-API-Key header is missing or wrong"],
  [404, "unknown_operation", "The operation in the path is not supported"],
  [422, "division_by_zero", "Division by zero, or zero raised to a negative power"],
  [422, "negative_square_root", "Square root of a negative number"],
  [422, "undefined_result", "The result is not a real number, e.g. (-8) ^ 0.5"],
  [422, "out_of_range", "The result is too large for a double, e.g. 10 ^ 400"],
  [503, "history_unavailable", "The database could not be read"],
];

function Endpoint({ method, path, title, children }: { method: string; path: string; title: string; children: ReactNode }) {
  return (
    <div className="endpoint">
      <h3>
        <span className={`method method-${method.toLowerCase()}`}>{method}</span>
        <code>{path}</code>
      </h3>
      <p className="endpoint-title">{title}</p>
      {children}
    </div>
  );
}

function Example({ request, response }: { request?: string; response: string }) {
  return (
    <div className="example">
      {request && (
        <div>
          <span className="label">Request body</span>
          <pre className="code">
            <code>{request}</code>
          </pre>
        </div>
      )}
      <div>
        <span className="label">Response</span>
        <pre className="code">
          <code>{response}</code>
        </pre>
      </div>
    </div>
  );
}
