import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { ToastProvider } from "../toast/ToastProvider";

/** Renders inside the same providers the app uses. */
export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  return render(ui, { wrapper: ToastProvider, ...options });
}
