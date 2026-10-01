// End-to-end checks that run from the browser against a live API. They cover
// authentication, every error class and a few happy paths, so a reviewer can
// verify a deployment in one click.
import { ConsoleNetworkError, sendRequest, type HttpMethod } from "./console";

type KeyMode = "valid" | "missing" | "wrong";

export interface ApiTestCase {
  name: string;
  method: HttpMethod;
  path: string;
  body?: string;
  key: KeyMode;
  expectStatus: number;
  /** Extra check on the body; returns a problem description or null. */
  check?: (body: unknown) => string | null;
  expectation: string;
}

export interface ApiTestResult {
  name: string;
  passed: boolean;
  expectation: string;
  actual: string;
  durationMs: number;
  /** True when the request never reached the API (network or CORS failure). */
  unreachable: boolean;
}

const errorCode = (body: unknown) => (body as { error?: { code?: string } } | null)?.error?.code;
const expectCode = (code: string) => (body: unknown) =>
  errorCode(body) === code ? null : `error code ${errorCode(body) ?? "missing"}`;
const expectResult = (value: number) => (body: unknown) => {
  const result = (body as { result?: number } | null)?.result;
  return result === value ? null : `result ${result ?? "missing"}`;
};

export const API_TEST_CASES: ApiTestCase[] = [
  { name: "Health check is public", method: "GET", path: "/health", key: "missing", expectStatus: 200, expectation: "200" },
  {
    name: "Rejects a request without an API key",
    method: "GET", path: "/api/v1/operations", key: "missing", expectStatus: 401,
    check: expectCode("unauthorized"), expectation: "401 unauthorized",
  },
  {
    name: "Rejects a wrong API key",
    method: "GET", path: "/api/v1/operations", key: "wrong", expectStatus: 401,
    check: expectCode("unauthorized"), expectation: "401 unauthorized",
  },
  {
    name: "Lists the supported operations",
    method: "GET", path: "/api/v1/operations", key: "valid", expectStatus: 200,
    check: (body) => {
      const ops = (body as { operations?: unknown[] } | null)?.operations;
      return Array.isArray(ops) && ops.length >= 4 ? null : "operations missing";
    },
    expectation: "200 with operations",
  },
  {
    name: "Adds 2 + 3",
    method: "POST", path: "/api/v1/calculate/add", body: '{"a": 2, "b": 3}', key: "valid",
    expectStatus: 200, check: expectResult(5), expectation: "200 result 5",
  },
  {
    name: "Divides 10 ÷ 4",
    method: "POST", path: "/api/v1/calculate/divide", body: '{"a": 10, "b": 4}', key: "valid",
    expectStatus: 200, check: expectResult(2.5), expectation: "200 result 2.5",
  },
  {
    name: "Square root of 81",
    method: "POST", path: "/api/v1/calculate/sqrt", body: '{"a": 81}', key: "valid",
    expectStatus: 200, check: expectResult(9), expectation: "200 result 9",
  },
  {
    name: "Division by zero is rejected",
    method: "POST", path: "/api/v1/calculate/divide", body: '{"a": 1, "b": 0}', key: "valid",
    expectStatus: 422, check: expectCode("division_by_zero"), expectation: "422 division_by_zero",
  },
  {
    name: "Square root rejects a second operand",
    method: "POST", path: "/api/v1/calculate/sqrt", body: '{"a": 4, "b": 2}', key: "valid",
    expectStatus: 400, check: expectCode("unexpected_operand"), expectation: "400 unexpected_operand",
  },
  {
    name: "Missing operand is rejected",
    method: "POST", path: "/api/v1/calculate/add", body: '{"a": 1}', key: "valid",
    expectStatus: 400, check: expectCode("missing_operand"), expectation: "400 missing_operand",
  },
  {
    name: "Unknown operation returns 404",
    method: "POST", path: "/api/v1/calculate/modulo", body: '{"a": 1, "b": 2}', key: "valid",
    expectStatus: 404, check: expectCode("unknown_operation"), expectation: "404 unknown_operation",
  },
  {
    name: "Malformed JSON is rejected",
    method: "POST", path: "/api/v1/calculate/add", body: '{"a": 1,', key: "valid",
    expectStatus: 400, check: expectCode("invalid_json"), expectation: "400 invalid_json",
  },
  {
    name: "History returns recent calculations",
    method: "GET", path: "/api/v1/history?limit=5", key: "valid", expectStatus: 200,
    check: (body) =>
      Array.isArray((body as { calculations?: unknown } | null)?.calculations) ? null : "calculations missing",
    expectation: "200 with calculations",
  },
];

export async function runApiTests(
  baseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  cases: ApiTestCase[] = API_TEST_CASES,
  onResult?: (result: ApiTestResult) => void,
): Promise<ApiTestResult[]> {
  const results: ApiTestResult[] = [];
  for (const test of cases) {
    const key = test.key === "valid" ? apiKey : test.key === "wrong" ? `${apiKey}-wrong` : "";
    let result: ApiTestResult;
    try {
      const response = await sendRequest(
        { baseUrl, apiKey: key, method: test.method, path: test.path, body: test.body },
        fetchImpl,
      );
      const problem =
        response.status !== test.expectStatus ? `status ${response.status}` : (test.check?.(response.body) ?? null);
      result = {
        name: test.name,
        passed: problem === null,
        expectation: test.expectation,
        actual: problem ?? test.expectation,
        durationMs: response.durationMs,
        unreachable: false,
      };
    } catch (err) {
      result = {
        name: test.name,
        passed: false,
        expectation: test.expectation,
        actual: err instanceof Error ? err.message : "request failed",
        durationMs: 0,
        unreachable: err instanceof ConsoleNetworkError,
      };
    }
    results.push(result);
    onResult?.(result);
  }
  return results;
}
