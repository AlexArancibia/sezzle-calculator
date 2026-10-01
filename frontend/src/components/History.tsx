import { useEffect, useState } from "react";
import { getHistory, type Calculation, type Operation } from "../api/client";
import { describeCalculation, formatNumber } from "../lib/format";
import { useToast } from "../toast/ToastProvider";

interface HistoryProps {
  operations: Operation[];
  /** Changes whenever a new calculation is made, to trigger a reload. */
  refreshKey: number;
  /** Called when a row is picked, to load it into the calculator. */
  onSelect?: (calculation: Calculation) => void;
}

const LOADED = 10;
const VISIBLE = 5;

type State = { status: "loading" } | { status: "error" } | { status: "ready"; items: Calculation[] };

export function History({ operations, refreshKey, onSelect }: HistoryProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [expanded, setExpanded] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    getHistory(LOADED)
      .then((items) => {
        if (!cancelled) setState({ status: "ready", items });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ status: "error" });
        toast.fromError(err, undefined, { id: "history" });
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, toast]);

  const byName = new Map(operations.map((op) => [op.name, op]));

  return (
    <section className="history" aria-labelledby="history-title">
      <h2 id="history-title">Recent calculations</h2>
      {state.status === "loading" && (
        <ol className="history-list" aria-busy="true" aria-label="Loading recent calculations">
          {[0, 1, 2].map((i) => (
            <li key={i} className="skeleton-row" />
          ))}
        </ol>
      )}
      {state.status === "error" && (
        <p className="muted">Recent calculations can't be shown right now. Calculations still work.</p>
      )}
      {state.status === "ready" && state.items.length === 0 && (
        <p className="muted">Your calculations will show up here.</p>
      )}
      {state.status === "ready" && state.items.length > 0 && (
        <>
          <ol className="history-list">
            {(expanded ? state.items : state.items.slice(0, VISIBLE)).map((item) => {
              const expression = describeCalculation(byName.get(item.operation), item.a, item.b);
              const result = formatNumber(item.result);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="history-item"
                    aria-label={`Load ${expression} = ${result} into the calculator`}
                    onClick={() => onSelect?.(item)}
                  >
                    <span className="history-expression">{expression}</span>
                    <span className="history-result">= {result}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {state.items.length > VISIBLE && (
            <button type="button" className="ghost small history-toggle" onClick={() => setExpanded((e) => !e)}>
              {expanded ? "Show less" : `Show all ${state.items.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
