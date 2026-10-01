import { useEffect, useEffectEvent, useRef, useState } from "react";
import { calculate, type CalculationResult, type Operation } from "../api/client";
import { describeCalculation, formatNumber, toOperandString } from "../lib/format";
import { MAX_DIGITS, appendDigits, appendPoint, entryFromText, formatEntry, removeLast, toggleSign } from "../lib/keypad";
import { useToast } from "../toast/ToastProvider";
import { Icon, type IconName } from "./Icon";

interface CalculatorProps {
  operations: Operation[];
  onCalculated?: (result: CalculationResult) => void;
  /** A calculation picked from the history. Passing a new object shows it again. */
  picked?: { calculation: CalculationResult };
}

/** Everything on the screen except the memory. */
interface Screen {
  entry: string | null; // the number being typed, or null while a result is shown
  value: number; // the number shown when nothing is being typed
  stored: number | null; // left operand of the pending operation
  pending: string | null; // two-operand operation waiting for its right operand
  hasOperand: boolean; // a right operand was entered after the operator
  expression: string; // line under the number, e.g. "12 +" or "12 + 3 ="
}

const CLEARED: Screen = { entry: null, value: 0, stored: null, pending: null, hasOperand: false, expression: "" };

interface Key {
  id: string;
  label: string; // text on the key
  name: string; // accessible name
  icon?: IconName; // shown instead of the label
  style: "digit" | "fn" | "op" | "clear" | "equals";
  operation?: string; // API operation the key runs; disabled if the API doesn't list it
  shortcuts?: string[];
  tall?: boolean;
}

const digit = (d: string): Key => ({ id: d, label: d, name: d, style: "digit", shortcuts: d.length === 1 ? [d] : [] });

// Six columns, laid out like a desk calculator. "+" and "=" span two rows.
const KEYS: Key[] = [
  { id: "mc", label: "MC", name: "Memory clear", style: "fn" },
  { id: "mr", label: "MR", name: "Memory recall", style: "fn" },
  { id: "m-", label: "M−", name: "Memory subtract", style: "fn" },
  { id: "m+", label: "M+", name: "Memory add", style: "fn" },
  { id: "power", label: "xʸ", name: "Power", style: "fn", operation: "power", shortcuts: ["^"] },
  { id: "sign", label: "±", name: "Change sign", style: "fn" },
  { id: "sqrt", label: "√", name: "Square root", style: "fn", operation: "sqrt" },
  digit("7"),
  digit("8"),
  digit("9"),
  { id: "divide", label: "÷", name: "Divide", style: "op", operation: "divide", shortcuts: ["/"] },
  { id: "percentage", label: "%", name: "Percent of", style: "fn", operation: "percentage", shortcuts: ["%"] },
  { id: "back", label: "⌫", name: "Delete last digit", icon: "delete", style: "fn", shortcuts: ["Backspace"] },
  digit("4"),
  digit("5"),
  digit("6"),
  { id: "multiply", label: "×", name: "Multiply", style: "op", operation: "multiply", shortcuts: ["*", "x"] },
  { id: "subtract", label: "−", name: "Subtract", style: "op", operation: "subtract", shortcuts: ["-"] },
  { id: "ac", label: "AC", name: "All clear", style: "clear", shortcuts: ["Escape"] },
  digit("1"),
  digit("2"),
  digit("3"),
  { id: "add", label: "+", name: "Add", style: "op", operation: "add", shortcuts: ["+"], tall: true },
  { id: "equals", label: "=", name: "Equals", style: "equals", shortcuts: ["=", "Enter"], tall: true },
  { id: "c", label: "C", name: "Clear entry", style: "clear", shortcuts: ["Delete"] },
  digit("0"),
  digit("00"),
  { id: "point", label: ".", name: "Decimal point", style: "digit", shortcuts: [".", ","] },
];

const SHORTCUTS = new Map(KEYS.flatMap((key) => (key.shortcuts ?? []).map((shortcut) => [shortcut, key] as const)));

// Typing in a form field elsewhere on the page must not drive the keypad.
const isFormField = (target: EventTarget | null) =>
  target instanceof Element && target.closest("input, textarea, select") !== null;

export function Calculator({ operations, onCalculated, picked }: CalculatorProps) {
  const toast = useToast();
  const byName = new Map(operations.map((op) => [op.name, op]));
  const showCalculation = (c: CalculationResult): Screen => ({
    ...CLEARED,
    value: c.result,
    expression: `${describeCalculation(byName.get(c.operation), c.a, c.b)} =`,
  });

  const [screen, setScreen] = useState<Screen>(() => (picked ? showCalculation(picked.calculation) : CLEARED));
  const [memory, setMemory] = useState<number | null>(null);
  const busy = useRef(false);
  const keypad = useRef<HTMLDivElement>(null);

  // A calculation picked from the history replaces the screen but keeps the
  // memory, so only the screen is reset here (a `key` would reset both).
  const [shownPick, setShownPick] = useState(picked);
  if (picked !== shownPick) {
    setShownPick(picked);
    setScreen(picked ? showCalculation(picked.calculation) : CLEARED);
  }

  const current = screen.entry !== null ? Number(screen.entry) : screen.value;

  function isDisabled(key: Key) {
    if (key.operation) return !byName.has(key.operation);
    return (key.id === "mc" || key.id === "mr") && memory === null;
  }

  /** Sends one operation to the API. Returns null after showing the error. */
  async function run(operation: string, a: number, b?: number): Promise<number | null> {
    busy.current = true;
    try {
      const response = await calculate(operation, a, b);
      toast.dismiss("calculate");
      onCalculated?.(response);
      return response.result;
    } catch (err) {
      toast.fromError(err, { operation }, { id: "calculate" });
      return null;
    } finally {
      busy.current = false;
    }
  }

  // Edits the number being typed, or starts a new one after a result.
  function edit(change: (entry: string) => string) {
    setScreen((s) => ({ ...s, entry: change(s.entry ?? "0"), hasOperand: true }));
  }

  function changeSign() {
    if (screen.entry !== null) {
      edit(toggleSign);
    } else {
      setScreen((s) => ({ ...s, value: s.value === 0 ? 0 : -s.value, hasOperand: true }));
    }
  }

  // Operations run left to right, like a desk calculator: 12 + 3 × 2 = 30.
  async function chooseOperation(operation: string) {
    const { pending, stored, hasOperand } = screen;
    let left = current;
    if (pending && stored !== null) {
      const result = hasOperand ? await run(pending, stored, current) : stored;
      if (result === null) return;
      left = result;
    }
    setScreen({
      ...CLEARED,
      value: left,
      stored: left,
      pending: operation,
      expression: describeCalculation(byName.get(operation), left),
    });
  }

  async function equals() {
    const { pending, stored, hasOperand } = screen;
    if (!pending || stored === null) return;
    // "5 + =" repeats the number on the screen: 5 + 5.
    const right = hasOperand ? current : stored;
    const result = await run(pending, stored, right);
    if (result === null) return;
    setScreen(showCalculation({ operation: pending, a: stored, b: right, result }));
  }

  async function squareRoot() {
    const result = await run("sqrt", current);
    if (result === null) return;
    const root = describeCalculation(byName.get("sqrt"), current);
    setScreen((s) => ({
      ...s,
      entry: null,
      value: result,
      hasOperand: true,
      expression: s.pending && s.stored !== null ? `${describeCalculation(byName.get(s.pending), s.stored)} ${root}` : `${root} =`,
    }));
  }

  async function addToMemory(operation: "add" | "subtract") {
    const start = operation === "add" ? current : -current;
    const next = memory === null ? start : await run(operation, memory, current);
    if (next === null) return;
    setMemory(next === 0 ? 0 : next);
    // The number is done: the next digit starts a new one.
    setScreen((s) => ({ ...s, entry: null, value: current }));
  }

  async function copy() {
    const text = screen.entry ?? toOperandString(screen.value);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied", `${text} is on your clipboard.`, { id: "copy" });
    } catch {
      toast.error("Couldn't copy", "Your browser blocked clipboard access. Select the number and copy it manually.", {
        id: "copy",
      });
    }
  }

  async function press(key: Key) {
    if (busy.current || isDisabled(key)) return;
    if (key.operation === "sqrt") return squareRoot();
    if (key.operation) return chooseOperation(key.operation);
    switch (key.id) {
      case "equals":
        return equals();
      case "point":
        return edit(appendPoint);
      case "sign":
        return changeSign();
      case "back":
        if (screen.entry !== null) edit(removeLast);
        return;
      case "c":
        return edit(() => "0");
      case "ac":
        return setScreen(CLEARED);
      case "mc":
        return setMemory(null);
      case "mr":
        return setScreen((s) => ({ ...s, entry: null, value: memory ?? 0, hasOperand: true }));
      case "m+":
        return addToMemory("add");
      case "m-":
        return addToMemory("subtract");
      default:
        return edit((entry) => appendDigits(entry, key.id));
    }
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const key = SHORTCUTS.get(event.key);
    if (!key || event.ctrlKey || event.metaKey || event.altKey || isFormField(event.target)) return;
    // Enter keeps its usual meaning on links and buttons outside the keypad.
    const target = event.target as Node;
    if (event.key === "Enter" && target !== document.body && !keypad.current?.contains(target)) return;
    event.preventDefault();
    void press(key);
  });

  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    if (isFormField(event.target)) return;
    event.preventDefault();
    const entry = entryFromText(event.clipboardData?.getData("text") ?? "");
    if (entry === null) {
      toast.error("Can't paste that", `Paste a number such as 12 or -3.5, up to ${MAX_DIGITS} digits.`, { id: "paste" });
      return;
    }
    setScreen((s) => ({ ...s, entry, hasOperand: true }));
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  if (operations.length === 0) {
    return <p className="muted">No operations are available.</p>;
  }

  const shown = screen.entry !== null ? formatEntry(screen.entry) : formatNumber(screen.value);

  return (
    <section className="calculator" aria-label="Calculator">
      <div className="screen">
        <div className="screen-top">
          <span className="screen-memory" data-testid="memory">
            {memory !== null && (
              <>
                <span aria-hidden="true">M</span>
                <span className="sr-only">Memory</span> {formatNumber(memory)}
              </>
            )}
          </span>
          <button type="button" className="screen-copy" aria-label="Copy the number" onClick={copy}>
            <Icon name="copy" size={16} />
          </button>
        </div>
        <output
          className={shown.length > 14 ? "screen-value is-long" : "screen-value"}
          data-testid="result"
          aria-live="polite"
          aria-atomic="true"
        >
          {shown}
        </output>
        <p className="screen-expression" data-testid="expression">
          {screen.expression}
        </p>
      </div>

      <div className="keypad" ref={keypad} role="group" aria-label="Keypad">
        {KEYS.map((key) => (
          <button
            key={key.id}
            type="button"
            className={`key key-${key.style}${key.tall ? " key-tall" : ""}`}
            aria-label={key.name}
            aria-pressed={key.style === "op" ? screen.pending === key.operation && !screen.hasOperand : undefined}
            disabled={isDisabled(key)}
            onClick={() => void press(key)}
          >
            {key.icon ? <Icon name={key.icon} size={22} /> : key.label}
          </button>
        ))}
      </div>
      <p className="keypad-hint">You can also type: digits, + − * / ^ %, Enter, Backspace, Esc, or paste a number.</p>
    </section>
  );
}
