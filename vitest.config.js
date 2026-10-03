// Unit tests for the plain logic in src/lib (no browser, no server).
// Run with: npm test
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  define: { __APP_BUILD__: JSON.stringify("test") },
  test: {
    include: ["src/**/*.test.js"],
    environment: "node",
  },
});
