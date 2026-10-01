import { screen } from "@testing-library/react";
import { renderWithProviders } from "./test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, calculate, getHistory, getOperations } from "./api/client";
import { App } from "./App";
import { operations } from "./test/fixtures";

vi.mock("./api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/client")>();
  return { ...actual, calculate: vi.fn(), getHistory: vi.fn(), getOperations: vi.fn() };
});

const getOperationsMock = vi.mocked(getOperations);
const getHistoryMock = vi.mocked(getHistory);
const calculateMock = vi.mocked(calculate);

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("App", () => {
  it("loads operations and history, then refreshes history after a calculation", async () => {
    getOperationsMock.mockResolvedValue(operations);
    getHistoryMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 1, operation: "multiply", a: 6, b: 7, result: 42, createdAt: "2026-09-30T12:00:00Z" },
    ]);
    calculateMock.mockResolvedValue({ operation: "multiply", a: 6, b: 7, result: 42 });
    const user = userEvent.setup();

    renderWithProviders(<App />);

    expect(await screen.findByText("Your calculations will show up here.")).toBeInTheDocument();

    for (const key of ["6", "Multiply", "7", "Equals"]) {
      await user.click(screen.getByRole("button", { name: key }));
    }

    expect(await screen.findByText("6 × 7")).toBeInTheDocument();
    expect(screen.getByText("= 42")).toBeInTheDocument();
    expect(getHistoryMock).toHaveBeenCalledTimes(2);
  });

  it("loads a history row into the calculator and shows more rows on demand", async () => {
    getOperationsMock.mockResolvedValue(operations);
    getHistoryMock.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => ({
        id: 7 - i,
        operation: "add",
        a: i,
        b: 1,
        result: i + 1,
        createdAt: "2026-09-30T12:00:00Z",
      })),
    );
    const user = userEvent.setup();

    renderWithProviders(<App />);

    expect(await screen.findByText("0 + 1")).toBeInTheDocument();
    expect(screen.queryByText("6 + 1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show all 7" }));
    expect(screen.getByText("6 + 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Load 6 + 1 = 7 into the calculator" }));

    expect(screen.getByTestId("result")).toHaveTextContent("7");
    expect(screen.getByTestId("expression")).toHaveTextContent("6 + 1 =");
  });

  it("shows an error with a retry button when the API is down", async () => {
    getOperationsMock
      .mockRejectedValueOnce(new ApiError("network_error", "Could not reach the calculator service."))
      .mockResolvedValueOnce(operations);
    getHistoryMock.mockResolvedValue([]);
    const user = userEvent.setup();

    renderWithProviders(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the server");
    expect(screen.getByRole("heading", { name: "Can't reach the server" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("button", { name: "Equals" })).toBeInTheDocument();
  });

  it("keeps the calculator usable when history fails to load", async () => {
    getOperationsMock.mockResolvedValue(operations);
    getHistoryMock.mockRejectedValue(new ApiError("history_unavailable", "Calculation history is temporarily unavailable.", 503));

    renderWithProviders(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("History unavailable");
    expect(screen.getByText("Recent calculations can't be shown right now. Calculations still work.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Equals" })).toBeEnabled();
  });

  it("uses a generic message for unexpected load errors", async () => {
    getOperationsMock.mockRejectedValue(new Error("boom"));
    getHistoryMock.mockRejectedValue(new Error("boom"));

    renderWithProviders(<App />);

    expect(await screen.findByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
  });

  it("navigates to the API docs and back without reloading", async () => {
    getOperationsMock.mockResolvedValue(operations);
    getHistoryMock.mockResolvedValue([]);
    const user = userEvent.setup();

    renderWithProviders(<App />);
    await screen.findByRole("button", { name: "Equals" });

    await user.click(screen.getByRole("link", { name: "API docs" }));

    expect(window.location.pathname).toBe("/docs");
    expect(screen.getByRole("heading", { name: "Calculator API" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Authentication" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "API docs" })).toHaveAttribute("aria-current", "page");

    window.history.pushState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(await screen.findByRole("button", { name: "Equals" })).toBeInTheDocument();
  });

  it("opens the docs directly from the URL", () => {
    window.history.replaceState(null, "", "/docs");
    renderWithProviders(<App />);
    expect(screen.getByRole("heading", { name: "Test the API" })).toBeInTheDocument();
  });
});
