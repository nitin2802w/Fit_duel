import { defineConfig } from "vite";
import { resolve } from "path";

// Dev server config — serves the demo page at /demo/index.html
export default defineConfig({
  root: ".",
  server: {
    port: 5173,
    open: "/demo/index.html",
  },
  optimizeDeps: {
    exclude: ["@mediapipe/tasks-vision"],
  },
});
