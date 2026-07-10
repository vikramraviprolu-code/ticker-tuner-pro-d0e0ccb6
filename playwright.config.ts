import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const requireExternalSandbox = process.env.E2E_REQUIRE_BASE_URL === "1";

if (requireExternalSandbox && !process.env.E2E_BASE_URL) {
  throw new Error(
    "E2E_REQUIRE_BASE_URL=1 requires E2E_BASE_URL. For Lovable/TanStack SSR, run Playwright against a deployed Lovable preview or sandbox URL instead of vite preview.",
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Lovable/TanStack's production build emits a Cloudflare Worker entry
        // instead of the dist/server/server.js expected by vite preview. For
        // deterministic CI smoke tests, run the Vite dev server after the build
        // gate and provide inert Supabase placeholders so auth/error-reporting
        // paths degrade without requiring real project secrets.
        command: `npm run dev -- --host 127.0.0.1 --port ${PORT}`,
        env: {
          ...process.env,
          SUPABASE_URL: process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
          SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? "placeholder",
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder",
          VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321",
          VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "placeholder",
        },
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
