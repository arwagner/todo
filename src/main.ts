import { createHttpServer } from "./adapters/http/server.ts";
import { databasePath } from "./db/location.ts";
import { openDatabase } from "./db/open.ts";
import { productionContext } from "./service/context.ts";

const port = Number(process.env["PORT"] ?? 8787);
const ctx = productionContext(openDatabase(databasePath()));

createHttpServer(ctx).listen(port, () => {
  process.stdout.write(`todo listening on ${port}\n`);
});
