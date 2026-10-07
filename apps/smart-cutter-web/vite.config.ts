import { defineConfig } from "vite";
export default defineConfig({
  server: {
    host: "127.0.0.1", port: 5178, strictPort: true,
    proxy: {
      "/smart": {
        target: "http://127.0.0.1:3792", changeOrigin: true,
        configure: proxy => { proxy.on("proxyReq", request => { if (process.env.MIXLAB_SMART_API_TOKEN) request.setHeader("X-Smart-Token", process.env.MIXLAB_SMART_API_TOKEN); }); }
      }
    }
  },
  build: { target: "es2022" }
});
