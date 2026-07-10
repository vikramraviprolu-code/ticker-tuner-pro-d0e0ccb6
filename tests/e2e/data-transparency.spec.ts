import { test, expect } from "@playwright/test";

test("sources page explains keyed, zero-key, historical, and demo data semantics", async ({ page }) => {
  const resp = await page.goto("/sources", { waitUntil: "domcontentloaded" });
  expect(resp?.status()).toBeLessThan(400);

  await expect(page.getByRole("heading", { name: /data sources/i })).toBeVisible();
  await expect(page.getByText(/In zero-key mode the app should first use fresh cache/i)).toBeVisible();
  await expect(page.getByText(/historical\/EOD data is never presented as real-time/i)).toBeVisible();
  await expect(page.getByText(/demo\/mock data is reserved for explicit demo mode only/i)).toBeVisible();
  await expect(page.getByText(/Production pages should show unavailable fields/i)).toBeVisible();
});
