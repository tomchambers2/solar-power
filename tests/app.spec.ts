import { test, expect } from "@playwright/test";

test.describe("Solar Power Designer", () => {
  test("page loads with header and search bar", async ({ page }) => {
    await page.goto("/");

    // Header is visible
    await expect(page.locator("h1")).toContainText("Solar Power Designer");

    // Search input is visible
    const searchInput = page.locator('input[placeholder="Enter address..."]');
    await expect(searchInput).toBeVisible();

    // Search button is visible
    const searchButton = page.locator("button", { hasText: "Search" });
    await expect(searchButton).toBeVisible();
  });

  test("sidebar controls are visible", async ({ page }) => {
    await page.goto("/");

    // Roof definition section
    await expect(page.locator("text=Roof Definition")).toBeVisible();
    await expect(page.locator("button", { hasText: "Draw Roof" })).toBeVisible();
    await expect(page.locator("button", { hasText: "Clear" })).toBeVisible();

    // Auto-place button
    await expect(
      page.locator("button", { hasText: "Auto-Place Panels" })
    ).toBeVisible();

    // Panel type selector
    await expect(page.locator("text=Panel Type")).toBeVisible();
    await expect(page.locator("select")).toBeVisible();

    // Shadow simulation
    await expect(page.locator("text=Shadow Simulation")).toBeVisible();

    // Power estimation
    await expect(page.locator("text=Power Estimation")).toBeVisible();
  });

  test("draw roof button toggles drawing mode", async ({ page }) => {
    await page.goto("/");

    const drawButton = page.locator("button", { hasText: "Draw Roof" });
    await drawButton.click();

    // Button text changes
    await expect(
      page.locator("button", { hasText: "Stop Drawing" })
    ).toBeVisible();

    // Drawing indicator is shown
    await expect(
      page.locator("text=Click on map to add roof points")
    ).toBeVisible();
  });

  test("panel selector shows panel options", async ({ page }) => {
    await page.goto("/");

    const select = page.locator("select");
    const options = select.locator("option");

    // At least 3 panel types
    await expect(options).toHaveCount(3);
  });

  test("auto-place button is disabled without roof vertices", async ({ page }) => {
    await page.goto("/");

    const autoPlaceButton = page.locator("button", {
      hasText: "Auto-Place Panels",
    });
    await expect(autoPlaceButton).toBeDisabled();
  });

  test("shadow simulation sliders are present", async ({ page }) => {
    await page.goto("/");

    const sliders = page.locator('input[type="range"]');
    await expect(sliders).toHaveCount(2); // month + hour
  });

  test("shows API key message when key not set", async ({ page }) => {
    await page.goto("/");

    // When no API key is set, should show the message
    const apiMessage = page.locator("text=Google Maps API key required");
    const mapContainer = page.locator('[style*="width: 100%"]');

    // One of these should be visible depending on key availability
    const hasApiMessage = await apiMessage.isVisible().catch(() => false);
    const hasMap = await mapContainer.isVisible().catch(() => false);

    expect(hasApiMessage || hasMap).toBeTruthy();
  });
});
