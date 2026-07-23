import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base relativa para funcionar tanto na web quanto empacotado (.exe / arquivo local)
export default defineConfig({
  base: "./",
  plugins: [react()],
});
