import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3007",
    headless: true,
  },
  webServer: {
    command: "npx next dev -p 3007",
    port: 3007,
    reuseExistingServer: true,
    timeout: 30000,
  },
});
