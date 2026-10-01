import type { Operation } from "../api/client";

export const operations: Operation[] = [
  { name: "add", label: "Addition", symbol: "+", arity: 2 },
  { name: "subtract", label: "Subtraction", symbol: "−", arity: 2 },
  { name: "multiply", label: "Multiplication", symbol: "×", arity: 2 },
  { name: "divide", label: "Division", symbol: "÷", arity: 2 },
  { name: "power", label: "Exponentiation", symbol: "xʸ", arity: 2 },
  { name: "sqrt", label: "Square root", symbol: "√", arity: 1 },
  { name: "percentage", label: "Percentage (a% of b)", symbol: "%", arity: 2 },
];
