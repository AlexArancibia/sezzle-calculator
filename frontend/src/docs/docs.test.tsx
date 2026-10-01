import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_TEST_CASES, runApiTests } from "./apiTests";
import { joinUrl, sendRequest, toCurl } from "./console";
import { DocsPage } from "./DocsPage";

const VALID_KEY = "local-dev-key";

/** A fake API that behaves like the Go service for the paths the tests use. */
function fakeApi(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const key = new Headers(init?.headers).get("X-API-Key");
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    const error = (status: number, code: string) => json(status, { error: { code, message: code } });

    if (url.pathname === "/health") return json(200, { status: "ok" });
    if (key !== VALID_KEY) return error(401, "unauthorized");
    if (url.pathname === "/api/v1/operations") return json(200, { operations: [{}, {}, {}, {}, {}, {}, {}] });
    if (url.pathname === "/api/v1/history") return json(200, { calculations: [] });

    const op = url.pathname.split("/").pop();
    let body: { a?: number; b?: number };
    try {
      body = JSON.parse(String(init?.body));
    } catch {
      return error(400, "invalid_json");
    }
    if (op === "modulo") return error(404, "unknown_operation");
    if (op === "sqrt") return body.b !== undefined ? error(400, "unexpected_operand") : json(200, { result: Math.sqrt(body.a!) });
    if (body.b === undefined) return error(400, "missing_operand");
    if (op === "divide") return body.b === 0 ? error(422, "division_by_zero") : json(200, { result: body.a! / body.b });
    return json(200, { result: body.a! + body.b });
  }) as unknown as typeof fetch;
}

describe("console helpers", () => {
  it("joins base URLs and paths without double slashes", () => {
    expect(joinUrl("http://localhost:8080/", "/health")).toBe("http://localhost:8080/health");
  });

  it("sends the API key only when one is given", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("{}", { status: 200 }));
    await sendRequest({ baseUrl: "http://x", apiKey: "k", method: "GET", path: "/api/v1/operations" }, fetchMock);
    await sendRequest({ baseUrl: "http://x", apiKey: "", method: "GET", path: "/api/v1/operations" }, fetchMock);
    expect(fetchMock.mock.calls[0]![1].headers).toEqual({ "X-API-Key": "k" });
    expect(fetchMock.mock.calls[1]![1].headers).toEqual({});
  });

  it("keeps non-JSON bodies as text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("Method Not Allowed", { status: 405 }));
    const res = await sendRequest({ baseUrl: "http://x", apiKey: "k", method: "GET", path: "/api/v1/calculate/add" }, fetchMock);
    expect(res).toMatchObject({ status: 405, body: "Method Not Allowed" });
  });

  it("builds a curl command, escaping single quotes and hiding a missing key", () => {
    const curl = toCurl({ baseUrl: "http://x", apiKey: "", method: "POST", path: "/api/v1/calculate/add", body: `{"a":"it's"}` });
    expect(curl).toContain("curl -X POST 'http://x/api/v1/calculate/add'");
    expect(curl).toContain("X-API-Key: <your-api-key>");
    expect(curl).toContain(`-d '{"a":"it'\\''s"}'`);
    expect(toCurl({ baseUrl: "http://x", apiKey: "k", method: "GET", path: "/health" })).not.toContain("X-API-Key");
  });
});

describe("runApiTests", () => {
  it("passes every check against an API that behaves correctly", async () => {
    const results = await runApiTests("http://localhost:8080", VALID_KEY, fakeApi());
    expect(results).toHaveLength(API_TEST_CASES.length);
    expect(results.filter((r) => !r.passed)).toEqual([]);
  });

  it("reports the difference when the API misbehaves", async () => {
    const results = await runApiTests("http://localhost:8080", "wrong-key", fakeApi());
    const failed = results.find((r) => r.name === "Adds 2 + 3");
    expect(failed).toMatchObject({ passed: false, actual: "status 401" });
  });

  it("reports unreachable APIs instead of throwing", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const results = await runApiTests("http://down", VALID_KEY, fetchMock);
    expect(results.every((r) => !r.passed && r.unreachable && r.actual.startsWith("Could not reach http://down"))).toBe(true);
  });
});

describe("DocsPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("tells you which key to use locally and fills it in", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocsPage fetchImpl={fakeApi()} />);

    expect(screen.getByTestId("missing-key")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use it" }));

    expect(screen.getByLabelText("API key")).toHaveValue(VALID_KEY);
    expect(screen.queryByTestId("missing-key")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("docs-api-key")).toBe(VALID_KEY);
  });

  it("explains where the key comes from for a hosted API", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocsPage fetchImpl={fakeApi()} />);

    await user.clear(screen.getByLabelText("Base URL"));
    await user.type(screen.getByLabelText("Base URL"), "https://api.example.com");

    expect(screen.getByText(/The hosted API needs the key its owner configured/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use it" })).not.toBeInTheDocument();
  });

  it("remembers the key for the tab", () => {
    sessionStorage.setItem("docs-api-key", "saved-key");
    renderWithProviders(<DocsPage fetchImpl={fakeApi()} />);
    expect(screen.getByLabelText("API key")).toHaveValue("saved-key");
  });

  it("documents authentication, endpoints and errors", () => {
    renderWithProviders(<DocsPage fetchImpl={fakeApi()} />);
    expect(screen.getByRole("heading", { name: "Authentication" })).toBeInTheDocument();
    expect(screen.getByText("/api/v1/calculate/{operation}", { selector: "h3 code" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "division_by_zero" })).toBeInTheDocument();
  });

  it("sends a request from the console and shows the response", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocsPage fetchImpl={fakeApi()} />);

    await user.type(screen.getByLabelText("API key"), VALID_KEY);
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByTestId("console-response")).toHaveTextContent('"result": 2.5');
    expect(screen.getByText("200")).toBeInTheDocument();
  });

  it("shows the 401 when the key is missing", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocsPage fetchImpl={fakeApi()} />);

    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByTestId("console-response")).toHaveTextContent("unauthorized");
  });

  it("switches endpoints and resets the body for square root", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocsPage fetchImpl={fakeApi()} />);

    await user.selectOptions(screen.getByLabelText("Operation"), "sqrt");
    expect(screen.getByLabelText("Request body (JSON)")).toHaveValue('{\n  "a": 81\n}');

    await user.selectOptions(screen.getByLabelText("Endpoint"), "history");
    expect(screen.queryByLabelText("Request body (JSON)")).not.toBeInTheDocument();
    expect(screen.getByText(/history\?limit=5/, { selector: "code" })).toBeInTheDocument();
  });

  it("shows a clear error when the API cannot be reached", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocsPage fetchImpl={vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))} />);

    await user.click(screen.getByRole("button", { name: "Send request" }));

    const toast = await screen.findByRole("alert");
    expect(toast).toHaveTextContent("Can't reach the API");
    expect(toast).toHaveTextContent("Could not reach");
  });

  it("runs the API tests and shows a summary", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocsPage fetchImpl={fakeApi()} />);

    expect(screen.getByRole("button", { name: "Run API tests" })).toBeDisabled();
    await user.type(screen.getByLabelText("API key"), VALID_KEY);
    await user.click(screen.getByRole("button", { name: "Run API tests" }));

    expect(await screen.findByRole("status")).toHaveTextContent(`All ${API_TEST_CASES.length} checks passed`);
    expect(screen.getByTestId("test-summary")).toHaveTextContent(`${API_TEST_CASES.length} of ${API_TEST_CASES.length} passed`);
    const list = document.querySelector<HTMLElement>(".test-results")!;
    expect(within(list).getAllByText("passed", { exact: false })).toHaveLength(API_TEST_CASES.length);
  });

  it("toggles the key visibility", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocsPage fetchImpl={fakeApi()} />);
    const input = screen.getByLabelText("API key");
    expect(input).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(input).toHaveAttribute("type", "text");
  });

  it("reports failing checks in a toast", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocsPage fetchImpl={fakeApi()} />);

    await user.type(screen.getByLabelText("API key"), "not-the-key");
    await user.click(screen.getByRole("button", { name: "Run API tests" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/checks failed/);
  });

  it("reports an unreachable API in a toast when running the tests", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocsPage fetchImpl={vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))} />);

    await user.type(screen.getByLabelText("API key"), VALID_KEY);
    await user.click(screen.getByRole("button", { name: "Run API tests" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the API");
  });

  it("copies the curl command and confirms it", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderWithProviders(<DocsPage fetchImpl={fakeApi()} />);

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("curl -X POST"));
    expect(await screen.findByRole("status")).toHaveTextContent("Copied");
  });

  it("explains when copying is blocked", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    renderWithProviders(<DocsPage fetchImpl={fakeApi()} />);

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't copy");
  });

  it("warns about invalid JSON but still sends it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocsPage fetchImpl={fakeApi()} />);

    await user.type(screen.getByLabelText("API key"), VALID_KEY);
    await user.clear(screen.getByLabelText("Request body (JSON)"));
    await user.type(screen.getByLabelText("Request body (JSON)"), "not json");
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByText("The body isn't valid JSON")).toBeInTheDocument();
    expect(await screen.findByTestId("console-response")).toHaveTextContent("invalid_json");
  });
});
