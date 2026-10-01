import { useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { useToast } from "../toast/ToastProvider";
import { ConsoleNetworkError, sendRequest, toCurl, type ConsoleRequest, type ConsoleResponse, type HttpMethod } from "./console";

interface ApiConsoleProps {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

type Endpoint = "calculate" | "operations" | "history" | "health";

type PathParams = { operation: string; limit: string };

const ENDPOINTS: Record<Endpoint, { method: HttpMethod; label: string; path: (p: PathParams) => string }> = {
  calculate: {
    method: "POST",
    label: "POST /api/v1/calculate/{operation}",
    path: (p) => `/api/v1/calculate/${p.operation}`,
  },
  operations: { method: "GET", label: "GET /api/v1/operations", path: () => "/api/v1/operations" },
  history: {
    method: "GET",
    label: "GET /api/v1/history",
    path: (p) => `/api/v1/history?limit=${encodeURIComponent(p.limit)}`,
  },
  health: { method: "GET", label: "GET /health", path: () => "/health" },
};

// Listed here rather than fetched, so the console works before a key is entered.
const OPERATIONS = ["add", "subtract", "multiply", "divide", "power", "sqrt", "percentage"];

const defaultBody = (operation: string) => (operation === "sqrt" ? '{\n  "a": 81\n}' : '{\n  "a": 10,\n  "b": 4\n}');

export function ApiConsole({ baseUrl, apiKey, fetchImpl }: ApiConsoleProps) {
  const [endpoint, setEndpoint] = useState<Endpoint>("calculate");
  const [operation, setOperation] = useState("divide");
  const [limit, setLimit] = useState("5");
  const [body, setBody] = useState(defaultBody("divide"));
  const [response, setResponse] = useState<ConsoleResponse | null>(null);
  const [sending, setSending] = useState(false);
  const toast = useToast();

  const request: ConsoleRequest = {
    baseUrl,
    apiKey,
    method: ENDPOINTS[endpoint].method,
    path: ENDPOINTS[endpoint].path({ operation, limit }),
    body: endpoint === "calculate" ? body : undefined,
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.body !== undefined) {
      try {
        JSON.parse(request.body);
      } catch {
        // Still send it (the API's answer to bad JSON is worth seeing), but say why it will fail.
        toast.show(
          { kind: "info", title: "The body isn't valid JSON", message: "Sending it anyway, so you can see how the API responds." },
          { id: "console-json" },
        );
      }
    }
    setSending(true);
    try {
      setResponse(await sendRequest(request, fetchImpl));
      toast.dismiss("console");
    } catch (err) {
      setResponse(null);
      toast.error(
        "Can't reach the API",
        err instanceof ConsoleNetworkError ? err.message : "The request failed before reaching the API. Please try again.",
        { id: "console" },
      );
    } finally {
      setSending(false);
    }
  }

  async function copyCurl() {
    try {
      await navigator.clipboard.writeText(toCurl(request));
      toast.success("Copied", "The curl command is on your clipboard.", { id: "copy" });
    } catch {
      toast.error("Couldn't copy", "Your browser blocked clipboard access. Select the command and copy it manually.", { id: "copy" });
    }
  }

  return (
    <form className="console" onSubmit={handleSubmit} aria-label="API console">
      <div className="console-row">
        <div className="field">
          <label htmlFor="console-endpoint">Endpoint</label>
          <select id="console-endpoint" value={endpoint} onChange={(e) => setEndpoint(e.target.value as Endpoint)}>
            {Object.entries(ENDPOINTS).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
        </div>

        {endpoint === "calculate" && (
          <div className="field">
            <label htmlFor="console-operation">Operation</label>
            <select
              id="console-operation"
              value={operation}
              onChange={(e) => {
                setOperation(e.target.value);
                setBody(defaultBody(e.target.value));
              }}
            >
              {OPERATIONS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
        )}

        {endpoint === "history" && (
          <div className="field">
            <label htmlFor="console-limit">Limit</label>
            <input id="console-limit" value={limit} inputMode="numeric" onChange={(e) => setLimit(e.target.value)} />
          </div>
        )}
      </div>

      {endpoint === "calculate" && (
        <div className="field">
          <label htmlFor="console-body">Request body (JSON)</label>
          <textarea id="console-body" rows={5} spellCheck={false} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
      )}

      <div className="field">
        <div className="label-row">
          <span className="label">curl</span>
          <button type="button" className="ghost small" onClick={copyCurl}>
            <Icon name="copy" size={16} /> Copy
          </button>
        </div>
        <pre className="code">
          <code>{toCurl(request)}</code>
        </pre>
      </div>

      {!apiKey && endpoint !== "health" && (
        <p className="notice" data-testid="missing-key">
          No API key yet: this request will get a 401. Add the key above to see a real result.
        </p>
      )}

      <button type="submit" className="submit" disabled={sending}>
        {sending ? "Sending…" : "Send request"}
      </button>

      {response && (
        <div className="console-response" aria-live="polite">
          <p className="response-meta">
            <span className={`status status-${Math.floor(response.status / 100)}xx`}>{response.status}</span>
            <span className="muted">{response.durationMs} ms</span>
          </p>
          <pre className="code">
            <code data-testid="console-response">
              {typeof response.body === "string" ? response.body : JSON.stringify(response.body, null, 2)}
            </code>
          </pre>
        </div>
      )}
    </form>
  );
}
