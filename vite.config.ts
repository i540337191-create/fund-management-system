import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  optimizeDeps: { exclude: ["#fund/i18n", "#fund/i18n/jsx-runtime", "#fund/i18n/jsx-dev-runtime"], include: ["react/jsx-runtime", "react/jsx-dev-runtime"] },
  server: {
    fs: { deny: ["**/.env*", "**/*.{crt,pem}", "**/.git/**", "**/docs/**", "**/private-material-storage/**", "**/server/**", "**/tests/**", "**/outputs/**", "**/output/**", "**/src/data/sourceMaterial*.ts"] },
    proxy: createApiProxyConfig(),
  },
  plugins: [react({ jsxImportSource: "#fund/i18n" }), {
    name: "local-i18n-source",
    configResolved(config) {
      // plugin-react explicitly includes both custom runtimes; explicit includes override excludes.
      config.optimizeDeps.include = config.optimizeDeps.include?.filter(id => !id.startsWith("#fund/i18n/"));
    },
  }, {
    name: "private-material-boundary",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const rawPath = (request.url ?? "/").split("?")[0];
        let path: string;
        try { path = decodeURIComponent(rawPath).replace(/\\/g, "/"); }
        catch { response.statusCode = 400; response.end("Invalid path"); return; }
        const privatePath = /\/(docs|server|tests|outputs?|runtime|private-material-storage)(\/|$)|\/src\/data\/sourceMaterial[^/]*\.ts$/i.test(path);
        const protectedProxy = rawPath.startsWith("/docs/source-materials/") && path.startsWith("/docs/source-materials/") && !path.split("/").some((part) => part === ".." || part === ".");
        if (privatePath && !protectedProxy) {
          response.statusCode = 403;
          response.setHeader("Cache-Control", "no-store");
          response.end("Private material path");
          return;
        }
        next();
      });
    },
  }],
});

function createApiProxyConfig() {
  const target = process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8788";
  const endpointPrefixes = [
    "/docs/source-materials",
    "/api/health",
    "/api/agent-workspace",
    "/api/notifications",
    "/api/business-intake",
    "/api/report-template-imports",
    "/api/record-management",
    "/api/session",
    "/api/users",
    "/api/admin",
    "/api/object-access",
    "/api/fund-operations",
    "/api/ai-intake-items",
    "/api/ai",
    "/api/funds",
    "/api/fundraising",
    "/api/companies",
    "/api/custom-field-schemas",
    "/api/custom-field-export",
    "/api/fund-investors",
    "/api/projects",
    "/api/tasks",
    "/api/materials",
    "/api/meetings",
    "/api/reports",
    "/api/risks",
    "/api/capital-records",
    "/api/exit-settlements",
    "/api/asset-history",
    "/api/investment-cashflows",
    "/api/investment-ledger",
    "/api/audit-events",
  ];

  return Object.fromEntries(endpointPrefixes.map((prefix) => [prefix, { target, changeOrigin: true }]));
}
