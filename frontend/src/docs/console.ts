// Low-level HTTP helper for the API docs page. Unlike api/client.ts it sends
// whatever the user asks for (any key, any body) and never throws on HTTP
// errors, because showing those errors is the point of the docs console.

export type HttpMethod = "GET" | "POST";

export interface ConsoleRequest {
  baseUrl: string;
  apiKey: string;
  method: HttpMethod;
  path: string;
  body?: string;
}

export interface ConsoleResponse {
  status: number;
  durationMs: number;
  /** Parsed JSON when the response is JSON, otherwise the raw text. */
  body: unknown;
}

export class ConsoleNetworkError extends Error {
  constructor(baseUrl: string) {
    super(
      `Could not reach ${baseUrl}. Check the base URL, that the API is running, and that it allows this page's origin (CORS_ORIGINS).`,
    );
    this.name = "ConsoleNetworkError";
  }
}

export function joinUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, "") + path;
}

export async function sendRequest(req: ConsoleRequest, fetchImpl: typeof fetch = fetch): Promise<ConsoleResponse> {
  const headers: Record<string, string> = {};
  if (req.body !== undefined) headers["Content-Type"] = "application/json";
  if (req.apiKey) headers["X-API-Key"] = req.apiKey;

  const started = performance.now();
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(req.baseUrl, req.path), { method: req.method, headers, body: req.body });
  } catch {
    throw new ConsoleNetworkError(req.baseUrl);
  }

  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON (for example Go's plain-text 405): keep the text.
  }
  return { status: response.status, durationMs: Math.round(performance.now() - started), body };
}

/** The same request as a copy-pasteable curl command. */
export function toCurl(req: ConsoleRequest): string {
  const lines = [`curl -X ${req.method} '${joinUrl(req.baseUrl, req.path)}'`];
  if (!req.path.startsWith("/health")) {
    lines.push(`-H 'X-API-Key: ${req.apiKey || "<your-api-key>"}'`);
  }
  if (req.body !== undefined) {
    lines.push(`-H 'Content-Type: application/json'`);
    lines.push(`-d '${req.body.replace(/'/g, `'\\''`)}'`);
  }
  return lines.join(" \\\n  ");
}
