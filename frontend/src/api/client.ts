// Typed client for the calculator REST API. Components never call fetch
// directly, so they can be tested by mocking this module.

export interface Operation {
  name: string;
  label: string;
  symbol: string;
  arity: 1 | 2;
}

export interface CalculationResult {
  operation: string;
  a: number;
  b?: number;
  result: number;
}

export interface Calculation extends CalculationResult {
  id: number;
  createdAt: string;
}

/** An error the UI can show as is. `code` mirrors the API's error codes. */
export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

type ErrorBody = { error?: { code?: string; message?: string } } | null;

// Same-origin requests: the dev server (Vite) or nginx proxies /api to the Go
// service and adds the API key, so the key never reaches the browser.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("network_error", "Could not reach the calculator service. Is the backend running?");
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as ErrorBody)?.error;
    throw new ApiError(
      error?.code ?? "http_error",
      error?.message ?? `The request failed with status ${response.status}.`,
      response.status,
    );
  }
  return body as T;
}

export async function getOperations(): Promise<Operation[]> {
  const data = await request<{ operations: Operation[] }>("/api/v1/operations");
  return data.operations;
}

export function calculate(operation: string, a: number, b?: number): Promise<CalculationResult> {
  const payload = b === undefined ? { a } : { a, b };
  return request<CalculationResult>(`/api/v1/calculate/${encodeURIComponent(operation)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getHistory(limit = 10): Promise<Calculation[]> {
  const data = await request<{ calculations: Calculation[] }>(`/api/v1/history?limit=${limit}`);
  return data.calculations;
}
