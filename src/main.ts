import { createHttpServer } from "./adapters/http/server.ts";
import { serverConfig } from "./config.ts";
import { databasePath } from "./db/location.ts";
import { openDatabase } from "./db/open.ts";
import { productionContext } from "./service/context.ts";

// systemd restarts this, so a bad setting would otherwise print a stack trace
// into the journal every two seconds. One line says it better (ADR 8).
function configured(): ReturnType<typeof serverConfig> {
  try {
    return serverConfig(process.env);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}

const { host, port } = configured();
const ctx = productionContext(openDatabase(databasePath()));

createHttpServer(ctx).listen(port, host, () => {
  process.stdout.write(`todo listening on ${host}:${port}\n`);
});
