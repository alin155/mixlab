import { defineConfig } from "vite";
export default defineConfig({
  server: {
    host: "127.0.0.1", port: Number(process.env.MIXLAB_SMART_WEB_PORT || 5178), strictPort: true,
    proxy: {
      ...Object.fromEntries(["/smart", "/cutter"].map(prefix => [prefix, {
        target: process.env.MIXLAB_SMART_API_URL || "http://127.0.0.1:3792", changeOrigin: true,
        configure: (proxy: import("vite").HttpProxy.Server) => { proxy.on("proxyReq", request => { if (process.env.MIXLAB_SMART_API_TOKEN) request.setHeader("X-Smart-Token", process.env.MIXLAB_SMART_API_TOKEN); }); }
      }]))
    }
  },
  build: { target: "es2022" }
});
