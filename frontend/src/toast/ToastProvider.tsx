import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { describeError } from "../lib/errors";

export type ToastKind = "error" | "success" | "info";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
}

type ShownToast = Toast & { version: number };

interface ToastOptions {
  /** Reusing an id replaces that toast instead of stacking a duplicate. */
  id?: string;
}

interface ToastApi {
  show: (toast: Omit<Toast, "id">, options?: ToastOptions) => string;
  error: (title: string, message?: string, options?: ToastOptions) => string;
  success: (title: string, message?: string, options?: ToastOptions) => string;
  /** Shows any thrown value as a friendly error toast. */
  fromError: (error: unknown, context?: { operation?: string }, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const MAX_VISIBLE = 3;
// Errors stay longer because they usually need reading and action.
const DURATION: Record<ToastKind, number> = { error: 7000, success: 4000, info: 4000 };

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ShownToast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((toast: Omit<Toast, "id">, options?: ToastOptions) => {
    const version = ++counter;
    const id = options?.id ?? `toast-${version}`;
    setToasts((current) => [...current.filter((t) => t.id !== id), { ...toast, id, version }].slice(-MAX_VISIBLE));
    return id;
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      error: (title, message, options) => show({ kind: "error", title, message }, options),
      success: (title, message, options) => show({ kind: "success", title, message }, options),
      fromError: (error, context, options) => {
        const friendly = describeError(error, context);
        return show({ kind: "error", title: friendly.title, message: friendly.message }, options);
      },
    }),
    [show, dismiss],
  );

  // Last line of defence: anything that escapes a try/catch still reaches the
  // user as a clear message instead of failing silently.
  useEffect(() => {
    const onUnexpected = () => api.fromError(new Error("unexpected"), undefined, { id: "unexpected" });
    window.addEventListener("unhandledrejection", onUnexpected);
    window.addEventListener("error", onUnexpected);
    return () => {
      window.removeEventListener("unhandledrejection", onUnexpected);
      window.removeEventListener("error", onUnexpected);
    };
  }, [api]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" aria-label="Notifications">
        {toasts.map((toast) => (
          // A replaced toast gets a new key, so its timer starts over.
          <ToastItem key={`${toast.id}-${toast.version}`} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(DURATION[toast.kind]);
  const startedAt = useRef(0);

  // Auto-dismiss, paused while the pointer or keyboard focus is on the toast
  // so it never disappears while someone is reading or acting on it.
  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const timer = window.setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, toast, onDismiss]);

  const icon = toast.kind === "error" ? "alert" : toast.kind === "success" ? "check" : "info";

  return (
    <div
      className={`toast toast-${toast.kind}`}
      role={toast.kind === "error" ? "alert" : "status"}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon name={icon} className="toast-icon" />
      <div className="toast-text">
        <p className="toast-title">{toast.title}</p>
        {toast.message && <p className="toast-message">{toast.message}</p>}
      </div>
      <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return api;
}
