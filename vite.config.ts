import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            if (id.includes("react-dom") || id.includes("/react/")) return "vendor-react";
            if (id.includes("framer-motion")) return "vendor-motion";
            if (id.includes("lucide-react")) return "vendor-icons";
            if (id.includes("dompurify") || id.includes("marked") || id.includes("uuid")) return "vendor-utils";
          }
        },
      },
    },
  },
});
