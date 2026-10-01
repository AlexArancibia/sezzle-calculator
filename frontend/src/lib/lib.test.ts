import { describe, expect, it } from "vitest";
import { operations } from "../test/fixtures";
import { describeCalculation, formatNumber, toOperandString } from "./format";
import { MAX_DIGITS, appendDigits, appendPoint, entryFromText, formatEntry, removeLast, toggleSign } from "./keypad";

describe("keypad entry", () => {
  it.each([
    ["0", "7", "7"],
    ["0", "0", "0"],
    ["0", "00", "0"],
    ["12", "00", "1200"],
    ["-0", "5", "-5"],
    ["3.", "0", "3.0"],
  ])("appending to %j the digits %j gives %j", (entry, digits, expected) => {
    expect(appendDigits(entry, digits)).toBe(expected);
  });

  it(`stops at ${MAX_DIGITS} digits`, () => {
    const full = "1".repeat(MAX_DIGITS);
    expect(appendDigits(full, "2")).toBe(full);
    expect(appendDigits(`-${full.slice(1)}.`, "99")).toBe(`-${full.slice(1)}.`);
  });

  it("adds a single decimal point", () => {
    expect(appendPoint("12")).toBe("12.");
    expect(appendPoint("12.5")).toBe("12.5");
  });

  it("toggles the sign", () => {
    expect(toggleSign("12")).toBe("-12");
    expect(toggleSign("-12")).toBe("12");
  });

  it("removes the last character, back to 0", () => {
    expect(removeLast("123")).toBe("12");
    expect(removeLast("7")).toBe("0");
    expect(removeLast("-7")).toBe("0");
  });

  it.each([
    ["1234567.25", "1,234,567.25"],
    ["-1234", "-1,234"],
    ["999", "999"],
    ["12.", "12."],
  ])("shows %j as %j", (entry, expected) => {
    expect(formatEntry(entry)).toBe(expected);
  });
});

describe("entryFromText (paste)", () => {
  it.each([
    ["12.5", "12.5"],
    ["-3", "-3"],
    [" 4 2 ", "42"],
    ["1a2b3", "123"],
    ["1.2.3", "1.23"],
    ["--5", "-5"],
    ["3,5", "3.5"],
    ["$1,000.50", "1000.50"],
    [".5", ".5"],
  ])("turns %j into %j", (text, expected) => {
    expect(entryFromText(text)).toBe(expected);
  });

  it.each(["abc", "", ".", "-", "1".repeat(MAX_DIGITS + 1)])("rejects %j", (text) => {
    expect(entryFromText(text)).toBeNull();
  });
});

describe("toOperandString", () => {
  it("writes a number as plain text, rounded like the display", () => {
    expect(toOperandString(0.1 + 0.2)).toBe("0.3");
    expect(toOperandString(1234567)).toBe("1234567");
  });
});

describe("formatNumber", () => {
  it.each([
    [0.1 + 0.2, "0.3"],
    [1024, "1,024"],
    [-2.5, "-2.5"],
    [0, "0"],
    [1 / 3, "0.333333333333"],
    [1e20, "1e+20"],
    [0.0000001, "1e-7"],
  ])("formats %d as %s", (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });

  it("returns non-finite values as text", () => {
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("Infinity");
  });
});

describe("describeCalculation", () => {
  const op = (name: string) => operations.find((o) => o.name === name);

  it("uses the operation symbol for binary operations", () => {
    expect(describeCalculation(op("divide"), 12, 4)).toBe("12 ÷ 4");
  });

  it("has dedicated formats for square root, power and percentage", () => {
    expect(describeCalculation(op("sqrt"), 81)).toBe("√81");
    expect(describeCalculation(op("power"), 2, 10)).toBe("2 ^ 10");
    expect(describeCalculation(op("percentage"), 15, 200)).toBe("15% of 200");
  });

  it("writes a two-operand operation waiting for its second number", () => {
    expect(describeCalculation(op("divide"), 12)).toBe("12 ÷");
    expect(describeCalculation(op("power"), 2)).toBe("2 ^");
    expect(describeCalculation(op("percentage"), 15)).toBe("15% of");
  });

  it("falls back to a placeholder symbol for unknown operations", () => {
    expect(describeCalculation(undefined, 1, 2)).toBe("1 ? 2");
  });
});
