// Builds the number being typed on the keypad. It never does arithmetic: every
// calculation goes to the API. Entries are plain strings such as "-12.5".

/** Longest number the keypad accepts; past 15 digits a double loses precision. */
export const MAX_DIGITS = 15;

const countDigits = (entry: string) => entry.replace(/\D/g, "").length;

/** Adds "0"-"9" or "00" to the entry. A lone leading zero is replaced. */
export function appendDigits(entry: string, digits: string): string {
  const sign = entry.startsWith("-") ? "-" : "";
  const body = entry.slice(sign.length);
  const next = sign + (body === "0" ? digits.replace(/^0+(?=.)/, "") : body + digits);
  return countDigits(next) > MAX_DIGITS ? entry : next;
}

export function appendPoint(entry: string): string {
  return entry.includes(".") ? entry : `${entry}.`;
}

export function toggleSign(entry: string): string {
  return entry.startsWith("-") ? entry.slice(1) : `-${entry}`;
}

export function removeLast(entry: string): string {
  const next = entry.slice(0, -1);
  return next === "" || next === "-" ? "0" : next;
}

/** The entry with thousands separators, e.g. "1234.5" as "1,234.5". */
export function formatEntry(entry: string): string {
  const [whole = "", fraction] = entry.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

const COMPLETE_NUMBER = /^-?(\d+(\.\d*)?|\.\d+)$/;

/**
 * Turns pasted text into an entry, or null when it holds no number the keypad
 * could type. Anything that is not part of a number is dropped. With a point
 * present, commas are thousands separators ("1,000.50"); without one, a comma
 * is a decimal point ("3,5").
 */
export function entryFromText(text: string): string | null {
  const normalized = text.includes(".") ? text.replace(/,/g, "") : text.replace(/,/g, ".");
  let entry = "";
  for (const char of normalized) {
    const isDigit = char >= "0" && char <= "9";
    const isFirstPoint = char === "." && !entry.includes(".");
    const isLeadingMinus = char === "-" && entry === "";
    if (isDigit || isFirstPoint || isLeadingMinus) entry += char;
  }
  return COMPLETE_NUMBER.test(entry) && countDigits(entry) <= MAX_DIGITS ? entry : null;
}
