import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, calculate, getHistory, getOperations } from "./client";

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("calculate", () => {
  it("posts both operands for binary operations", async () => {
    const fetchMock = mockFetch(200, { operation: "add", a: 2, b: 3, result: 5 });

    const result = await calculate("add", 2, 3);

    expect(result.result).toBe(5);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v1/calculate/add");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ a: 2, b: 3 });
  });

  it("omits b for unary operations", async () => {
    const fetchMock = mockFetch(200, { operation: "sqrt", a: 9, result: 3 });

    await calculate("sqrt", 9);

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ a: 9 });
  });

  it("turns API errors into ApiError with the API's code and message", async () => {
    mockFetch(422, { error: { code: "division_by_zero", message: "division by zero is not allowed" } });

    const error = await calculate("divide", 1, 0).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "division_by_zero",
      message: "division by zero is not allowed",
      status: 422,
    });
  });

  it("uses a generic message when the error body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 500 })));

    await expect(calculate("add", 1, 1)).rejects.toMatchObject({ code: "http_error", status: 500 });
  });

  it("reports network failures clearly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(calculate("add", 1, 1)).rejects.toMatchObject({ code: "network_error" });
  });
});

describe("reads", () => {
  it("loads operations", async () => {
    mockFetch(200, { operations: [{ name: "add", label: "Addition", symbol: "+", arity: 2 }] });
    await expect(getOperations()).resolves.toHaveLength(1);
  });

  it("loads history with a limit", async () => {
    const fetchMock = mockFetch(200, { calculations: [] });
    await expect(getHistory(5)).resolves.toEqual([]);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/v1/history?limit=5");
  });
});
