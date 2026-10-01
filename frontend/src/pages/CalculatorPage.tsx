import { useCallback, useEffect, useState } from "react";
import { getOperations, type CalculationResult, type Operation } from "../api/client";
import { Calculator } from "../components/Calculator";
import { History } from "../components/History";
import { Icon } from "../components/Icon";
import { describeError, type FriendlyError } from "../lib/errors";
import { useToast } from "../toast/ToastProvider";

type State =
  | { status: "loading" }
  | { status: "error"; error: FriendlyError }
  | { status: "ready"; operations: Operation[] };

export function CalculatorPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [picked, setPicked] = useState<{ calculation: CalculationResult }>();
  const toast = useToast();

  const load = useCallback(() => {
    setState({ status: "loading" });
    getOperations()
      .then((operations) => {
        setState({ status: "ready", operations });
        toast.dismiss("load");
      })
      .catch((err: unknown) => {
        setState({ status: "error", error: describeError(err) });
        toast.fromError(err, undefined, { id: "load" });
      });
  }, [toast]);

  useEffect(load, [load]);

  return (
    <>
      {state.status === "loading" && (
        <div className="layout" aria-busy="true" aria-label="Loading the calculator">
          <div className="card skeleton-card" />
          <div className="card skeleton-card short" />
        </div>
      )}

      {state.status === "error" && (
        <div className="card empty-state">
          <Icon name="alert" size={28} className="fatal-icon" />
          <h2>{state.error.title}</h2>
          <p className="muted">{state.error.message}</p>
          <button type="button" className="submit" onClick={load}>
            <Icon name="refresh" size={18} /> Try again
          </button>
        </div>
      )}

      {state.status === "ready" && (
        <div className="layout">
          <div className="card">
            <Calculator
              operations={state.operations}
              picked={picked}
              onCalculated={() => setRefreshKey((k) => k + 1)}
            />
          </div>
          <div className="card">
            <History
              operations={state.operations}
              refreshKey={refreshKey}
              onSelect={(calculation) => {
                setPicked({ calculation });
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
