import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@reader/domain": path.resolve(__dirname, "../../packages/domain/src/index.ts"),
      "@reader/reader-core": path.resolve(__dirname, "../../packages/reader-core/src/index.ts"),
      "@reader/ai-protocol": path.resolve(__dirname, "../../packages/ai-protocol/src/index.ts"),
    },
  },
});
