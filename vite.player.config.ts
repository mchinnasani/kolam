import { defineConfig } from "vite";
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "public",
    emptyOutDir: false,
    lib: {
      entry: "src/logo/standalone.ts",
      name: "KolamLogo",
      formats: ["iife"],
      fileName: () => "logo-player.js",
    },
  },
});
