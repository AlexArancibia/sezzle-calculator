import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { describeError } from "../lib/errors";
import { ToastProvider, useToast } from "./ToastProvider";

type Api = ReturnType<typeof useToast>;

function renderToasts() {
  let api!: Api;
  function Capture() {
    api = useToast();
    return null;
  }
  render(
    <ToastProvider>
      <Capture />
    </ToastProvider>,
  );
  return () => api;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ToastProvider", () => {
  it("shows errors as alerts and dismisses them automatically", () => {
    vi.useFakeTimers();
    const api = renderToasts();

    act(() => {
      api().error("Can't divide by zero", "Use another divisor.");
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Can't divide by zero");

    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows success messages as polite status updates", () => {
    const api = renderToasts();
    act(() => {
      api().success("Copied");
    });
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
  });

  it("can be dismissed with the close button", () => {
    const api = renderToasts();
    act(() => {
      api().error("Oops");
    });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("replaces a toast that reuses an id instead of stacking duplicates", () => {
    const api = renderToasts();
    act(() => {
      api().error("First", undefined, { id: "same" });
      api().error("Second", undefined, { id: "same" });
    });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Second");
  });

  it("keeps at most three toasts on screen", () => {
    const api = renderToasts();
    act(() => {
      ["1", "2", "3", "4"].forEach((n) => api().error(`Error ${n}`));
    });
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(3);
    expect(alerts[0]).toHaveTextContent("Error 2");
  });

  it("pauses the timer while the pointer is over a toast", () => {
    vi.useFakeTimers();
    const api = renderToasts();
    act(() => {
      api().error("Read me");
    });

    fireEvent.pointerEnter(screen.getByRole("alert"));
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.pointerLeave(screen.getByRole("alert"));
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("turns unhandled promise rejections into a clear message", () => {
    renderToasts();
    act(() => {
      window.dispatchEvent(new Event("unhandledrejection"));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("requires the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Orphan() {
      useToast();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow("useToast must be used inside <ToastProvider>");
    spy.mockRestore();
  });
});

describe("describeError", () => {
  it.each([
    ["network_error", "Can't reach the server"],
    ["unauthorized", "Not authorized"],
    ["negative_square_root", "No real square root"],
    ["undefined_result", "No real result"],
    ["out_of_range", "Result too large"],
    ["unknown_operation", "Operation not supported"],
  ])("maps %s to a clear title", (code, title) => {
    expect(describeError(new ApiError(code, "raw")).title).toBe(title);
  });

  it("treats unknown 5xx errors as a server problem", () => {
    expect(describeError(new ApiError("http_error", "raw", 502)).title).toBe("Server error");
  });

  it("passes the API's own sentence through for validation errors", () => {
    expect(describeError(new ApiError("missing_operand", 'Operand "b" is required for add.', 400))).toEqual({
      title: "Request not accepted",
      message: 'Operand "b" is required for add.',
    });
  });

  it("never shows raw JavaScript errors", () => {
    expect(describeError(new TypeError("undefined is not a function")).message).toBe(
      "An unexpected error occurred. Please try again.",
    );
  });
});

describe("ErrorBoundary", () => {
  it("shows a recovery screen when rendering fails", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { value: { ...original, reload }, configurable: true });

    function Broken(): never {
      throw new Error("render failed");
    }
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload the page" }));
    expect(reload).toHaveBeenCalled();

    Object.defineProperty(window, "location", { value: original, configurable: true });
    spy.mockRestore();
  });
});
