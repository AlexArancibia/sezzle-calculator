import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, calculate } from "../api/client";
import { operations } from "../test/fixtures";
import { renderWithProviders } from "../test/render";
import { Calculator } from "./Calculator";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return { ...actual, calculate: vi.fn() };
});

const calculateMock = vi.mocked(calculate);

// A fake API that does the math, so each test reads like real use.
function math(operation: string, a: number, b = 0): number {
  switch (operation) {
    case "add":
      return a + b;
    case "subtract":
      return a - b;
    case "multiply":
      return a * b;
    case "divide":
      if (b === 0) throw new ApiError("division_by_zero", "Division by zero is not allowed.", 422);
      return a / b;
    case "power":
      if (a === 0 && b < 0) throw new ApiError("division_by_zero", "Division by zero is not allowed.", 422);
      return a ** b;
    case "sqrt":
      return Math.sqrt(a);
    default:
      return (a * b) / 100;
  }
}

beforeEach(() => {
  calculateMock.mockReset();
  calculateMock.mockImplementation(async (operation, a, b) => ({ operation, a, b, result: math(operation, a, b) }));
});

function setup(ui = <Calculator operations={operations} />) {
  const user = userEvent.setup();
  const view = renderWithProviders(ui);
  const press = async (...names: string[]) => {
    for (const name of names) await user.click(screen.getByRole("button", { name }));
  };
  return { user, press, view };
}

const shown = () => screen.getByTestId("result");
const expression = () => screen.getByTestId("expression");

describe("Calculator", () => {
  it("adds two numbers through the API", async () => {
    const onCalculated = vi.fn();
    const { press } = setup(<Calculator operations={operations} onCalculated={onCalculated} />);

    await press("2", "Add", "3", "Equals");

    expect(calculateMock).toHaveBeenCalledWith("add", 2, 3);
    expect(shown()).toHaveTextContent("5");
    expect(expression()).toHaveTextContent("2 + 3 =");
    expect(onCalculated).toHaveBeenCalledOnce();
  });

  it("runs operations left to right, like a desk calculator", async () => {
    const { press } = setup();

    await press("1", "2", "Add", "3", "Multiply", "2", "Equals");

    expect(calculateMock).toHaveBeenNthCalledWith(1, "add", 12, 3);
    expect(calculateMock).toHaveBeenNthCalledWith(2, "multiply", 15, 2);
    expect(shown()).toHaveTextContent("30");
    expect(expression()).toHaveTextContent("15 × 2 =");
  });

  it("shows the pending operation, which can change before the second number", async () => {
    const { press } = setup();

    await press("1", "2", "Add");
    expect(expression()).toHaveTextContent("12 +");
    expect(screen.getByRole("button", { name: "Add" })).toHaveAttribute("aria-pressed", "true");

    await press("Multiply", "3", "Equals");

    expect(calculateMock).toHaveBeenCalledOnce();
    expect(calculateMock).toHaveBeenCalledWith("multiply", 12, 3);
    expect(shown()).toHaveTextContent("36");
  });

  it("repeats the number on screen when = follows an operator", async () => {
    const { press } = setup();

    await press("5", "Add", "Equals");

    expect(calculateMock).toHaveBeenCalledWith("add", 5, 5);
    expect(shown()).toHaveTextContent("10");
  });

  it("takes the square root of the number on screen, also as a second number", async () => {
    const { press } = setup();

    await press("8", "1", "Square root");
    expect(shown()).toHaveTextContent("9");
    expect(expression()).toHaveTextContent("√81 =");

    await press("All clear", "9", "Add", "1", "6", "Square root");
    expect(expression()).toHaveTextContent("9 + √16");

    await press("Equals");
    expect(calculateMock).toHaveBeenLastCalledWith("add", 9, 4);
    expect(shown()).toHaveTextContent("13");
  });

  it("reads % as percent of", async () => {
    const { press } = setup();

    await press("1", "5", "Percent of", "2", "00", "Equals");

    expect(calculateMock).toHaveBeenCalledWith("percentage", 15, 200);
    expect(shown()).toHaveTextContent("30");
    expect(expression()).toHaveTextContent("15% of 200 =");
  });

  it("builds numbers key by key", async () => {
    const { press } = setup();

    await press("0", "0", "7", "Decimal point", "5", "Decimal point", "00");
    expect(shown()).toHaveTextContent("7.500");

    await press("Delete last digit", "Change sign");
    expect(shown()).toHaveTextContent("-7.50");

    await press("Clear entry", "1", "2", "3", "4", "5");
    expect(shown()).toHaveTextContent("12,345");
    expect(calculateMock).not.toHaveBeenCalled();
  });

  it("explains API errors and keeps the calculation going", async () => {
    const { press } = setup();

    await press("8", "Divide", "0", "Equals");

    expect(await screen.findByRole("alert")).toHaveTextContent("Can't divide by zero");
    expect(expression()).toHaveTextContent("8 ÷");

    await press("Clear entry", "2", "Equals");
    expect(shown()).toHaveTextContent("4");
  });

  it("explains zero to a negative power in its own words", async () => {
    const { press } = setup();

    await press("0", "Power", "2", "Change sign", "Equals");

    expect(await screen.findByRole("alert")).toHaveTextContent("Can't raise zero to a negative power");
  });

  it("shows a generic message for unexpected errors", async () => {
    calculateMock.mockRejectedValue(new Error("boom"));
    const { press } = setup();

    await press("1", "Add", "1", "Equals");

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("keeps a number in memory", async () => {
    const { press } = setup();
    const memory = () => screen.getByTestId("memory");
    expect(screen.getByRole("button", { name: "Memory recall" })).toBeDisabled();

    await press("5", "Memory add");
    expect(memory()).toHaveTextContent("Memory 5");
    expect(calculateMock).not.toHaveBeenCalled();

    await press("3", "Memory add", "2", "Memory subtract");
    expect(calculateMock).toHaveBeenNthCalledWith(1, "add", 5, 3);
    expect(calculateMock).toHaveBeenNthCalledWith(2, "subtract", 8, 2);
    expect(memory()).toHaveTextContent("Memory 6");

    await press("All clear", "Memory recall");
    expect(shown()).toHaveTextContent("6");

    await press("Memory clear");
    expect(memory()).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Memory recall" })).toBeDisabled();
  });

  it("works with the keyboard", async () => {
    const { user } = setup();

    await user.keyboard("12+3{Enter}");
    expect(calculateMock).toHaveBeenCalledWith("add", 12, 3);
    expect(shown()).toHaveTextContent("15");

    await user.keyboard("{Escape}45{Backspace}");
    expect(shown()).toHaveTextContent("4");
  });

  it("leaves typing in form fields and Enter on other buttons alone", async () => {
    const { user } = setup(
      <>
        <input aria-label="Notes" />
        <button type="button">Elsewhere</button>
        <Calculator operations={operations} />
      </>,
    );

    await user.type(screen.getByRole("textbox", { name: "Notes" }), "5+5");
    expect(shown()).toHaveTextContent("0");

    screen.getByRole("button", { name: "Elsewhere" }).focus();
    await user.keyboard("7+{Enter}");
    expect(calculateMock).not.toHaveBeenCalled();
  });

  it("pastes a number, and explains when the text isn't one", async () => {
    const { user } = setup();

    await user.paste("$1,234.5");
    expect(shown()).toHaveTextContent("1,234.5");

    await user.paste("hello");
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't paste that");
    expect(shown()).toHaveTextContent("1,234.5");
  });

  it("copies the number on screen", async () => {
    const { user, press } = setup();

    await press("0", "Decimal point", "1", "Multiply", "3", "Equals");
    await user.click(screen.getByRole("button", { name: "Copy the number" }));

    expect(await navigator.clipboard.readText()).toBe("0.3");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("explains when the browser blocks copying", async () => {
    const { user } = setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));

    await user.click(screen.getByRole("button", { name: "Copy the number" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't copy");
  });

  it("shows a calculation picked from the history and keeps the memory", async () => {
    const pick = (a: number) => ({ calculation: { operation: "power", a, b: 10, result: a ** 10 } });
    const { press, view } = setup(<Calculator operations={operations} picked={pick(2)} />);
    expect(shown()).toHaveTextContent("1,024");
    expect(expression()).toHaveTextContent("2 ^ 10 =");

    await press("Memory add");
    view.rerender(<Calculator operations={operations} picked={pick(3)} />);

    expect(shown()).toHaveTextContent("59,049");
    expect(screen.getByTestId("memory")).toHaveTextContent("Memory 1,024");
  });

  it("disables the keys of operations the API doesn't offer", () => {
    setup(<Calculator operations={operations.filter((op) => op.name !== "power")} />);

    expect(screen.getByRole("button", { name: "Power" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
  });

  it("renders a message when there are no operations", () => {
    renderWithProviders(<Calculator operations={[]} />);
    expect(screen.getByText("No operations are available.")).toBeInTheDocument();
  });
});
