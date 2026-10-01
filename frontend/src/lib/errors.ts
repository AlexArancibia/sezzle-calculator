import { ApiError } from "../api/client";

export interface FriendlyError {
  title: string;
  message: string;
}

// One place that turns any failure into a short title and a clear, actionable
// sentence in plain English. Components never show raw error text.
const BY_CODE: Record<string, FriendlyError> = {
  network_error: {
    title: "Can't reach the server",
    message: "Check your internet connection and that the calculator service is running, then try again.",
  },
  unauthorized: {
    title: "Not authorized",
    message: "The API rejected the request because the API key is missing or wrong.",
  },
  division_by_zero: {
    title: "Can't divide by zero",
    message: "Division by zero has no answer. Use a number other than 0 as the divisor.",
  },
  negative_square_root: {
    title: "No real square root",
    message: "Negative numbers don't have a real square root. Enter 0 or a positive number.",
  },
  undefined_result: {
    title: "No real result",
    message: "This calculation has no real-number answer, for example a negative number raised to a fractional power. Try other numbers.",
  },
  out_of_range: {
    title: "Result too large",
    message: "The answer is too large to represent. Try smaller numbers.",
  },
  unknown_operation: {
    title: "Operation not supported",
    message: "The calculator doesn't support this operation. Choose one of the available operations.",
  },
  history_unavailable: {
    title: "History unavailable",
    message: "Your recent calculations can't be loaded right now. Calculations still work.",
  },
  internal_error: {
    title: "Server error",
    message: "The calculator service ran into a problem. Please try again in a moment.",
  },
};

const UNEXPECTED: FriendlyError = {
  title: "Something went wrong",
  message: "An unexpected error occurred. Please try again.",
};

export function describeError(error: unknown, context?: { operation?: string }): FriendlyError {
  if (!(error instanceof ApiError)) {
    return UNEXPECTED;
  }
  if (error.code === "division_by_zero" && context?.operation === "power") {
    return {
      title: "Can't raise zero to a negative power",
      message: "Zero to a negative power means dividing by zero. Use a positive exponent or a base other than 0.",
    };
  }
  const known = BY_CODE[error.code];
  if (known) {
    return known;
  }
  if (error.status !== undefined && error.status >= 500) {
    return BY_CODE.internal_error!;
  }
  // Validation codes (invalid_json, missing_operand, …) come with a clear
  // sentence from the API, so show it as is.
  return { title: "Request not accepted", message: error.message || UNEXPECTED.message };
}
