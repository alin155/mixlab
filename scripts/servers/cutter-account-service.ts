import {
  createCutterAccountService,
  resolveCutterAccountServiceConfigFromEnv
} from "../../packages/admin-api/src/cutter-account-service.ts";

const config = resolveCutterAccountServiceConfigFromEnv(process.env);
const service = await createCutterAccountService({
  state_root: config.state_root,
  client_token: config.client_token,
  admin_token: config.admin_token,
  warn(message) {
    console.warn(JSON.stringify({ event: "cutter_account_service_deprecation", message }));
  }
});

service.server.listen(config.port, "127.0.0.1", () => {
  const address = service.server.address();
  const port = address && typeof address === "object" ? address.port : config.port;
  console.log(
    JSON.stringify({
      event: "cutter_account_service_ready",
      url: "http://127.0.0.1:" + port,
      state_root: service.state_root
    })
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void service.close().then(() => process.exit(0));
  });
}
