import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Replace "korean-study-app" with your actual GitHub repository name
export default defineConfig({
  plugins: [react()],
  base: "/korean-study-app/",
});
