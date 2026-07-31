import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const directory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  publicDir: path.resolve(directory, "../web/public"),
  resolve: {
    alias: [
      { find: /^@\/lib\/platform$/, replacement: path.resolve(directory, "src/platform.ts") },
      { find: "@", replacement: path.resolve(directory, "../web") },
      { find: "@reader/domain", replacement: path.resolve(directory, "../../packages/domain/src/index.ts") },
      { find: "@reader/reader-core", replacement: path.resolve(directory, "../../packages/reader-core/src/index.ts") },
      { find: "@reader/ai-protocol", replacement: path.resolve(directory, "../../packages/ai-protocol/src/index.ts") },
      { find: /^next\/link$/, replacement: path.resolve(directory, "src/shims/next-link.tsx") },
      { find: /^next\/navigation$/, replacement: path.resolve(directory, "src/shims/next-navigation.ts") },
      { find: /^next\/dynamic$/, replacement: path.resolve(directory, "src/shims/next-dynamic.tsx") },
    ],
    dedupe: ["react", "react-dom"],
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production"),
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
