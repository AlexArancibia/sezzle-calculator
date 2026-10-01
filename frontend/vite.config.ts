/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development the API runs on :8080. The proxy adds the API key, so the
    // key never reaches the browser bundle (nginx does the same in Docker).
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        headers: { "X-API-Key": process.env.API_KEY ?? "local-dev-key" },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/test/**", "src/**/*.test.{ts,tsx}", "src/vite-env.d.ts"],
    },
  },
});
