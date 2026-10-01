import type { Operation } from "../api/client";

/**
 * Formats a result for display. The API returns full float64 precision; the
 * UI rounds to 12 significant digits so 0.1 + 0.2 shows as 0.3.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  const rounded = Number(value.toPrecision(12));
  if (rounded !== 0 && (Math.abs(rounded) >= 1e15 || Math.abs(rounded) < 1e-6)) {
    return rounded.toExponential();
  }
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 12 });
}

type OperationLike = Pick<Operation, "name" | "symbol"> | undefined;

/**
 * Human readable form of a calculation, e.g. "12 ÷ 4", "√81" or "15% of 200".
 * Without `b`, a two-operand operation reads as waiting for it: "12 ÷".
 */
export function describeCalculation(operation: OperationLike, a: number, b?: number): string {
  const x = formatNumber(a);
  const y = b === undefined ? "" : formatNumber(b);
  switch (operation?.name) {
    case "sqrt":
      return `√${x}`;
    case "power":
      return `${x} ^ ${y}`.trim();
    case "percentage":
      return `${x}% of ${y}`.trim();
    default:
      return `${x} ${operation?.symbol ?? "?"} ${y}`.trim();
  }
}

/** A number as plain text (no grouping, no exponent), rounded like the display. */
export function toOperandString(value: number): string {
  return Number(value.toPrecision(12)).toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}
