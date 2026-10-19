import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    // Pin the data mode for tests. Vite loads .env here too, so a developer who
    // sets VITE_DATA_MODE=mock to demo the app would otherwise see the whole
    // real-mode suite fail for a reason that has nothing to do with their change.
    // Tests that need the other mode stub it per-test with vi.stubEnv.
    env: {
      VITE_DATA_MODE: "real",
    },
  },
});
