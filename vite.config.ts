import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import monacoEditorPlugin from "vite-plugin-monaco-editor-esm";

export default defineConfig({
  clearScreen: false,
  server: {
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  publicDir: "static",
  resolve: {
    alias: [
      {
        // react-monaco-editor still imports the legacy package layout.
        find: /^monaco-editor\/esm\/vs\/editor\/editor\.api$/,
        replacement: "monaco-editor/editor/editor.api",
      },
    ],
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        satie: "playground.html",
      },
    },
  },
  define: {
    "process.browser": true,
    "process.env.PLAYGROUND_PREFIX": JSON.stringify("/satie"),
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routeFileIgnorePattern: "\\.test\\.",
    }),
    tailwindcss(),
    react(),
    monacoEditorPlugin({
      languageWorkers: [],
      customWorkers: [
        {
          label: "editorWorkerService",
          entry: "monaco-editor/editor/editor.worker",
        },
      ],
    }),
  ],
});
