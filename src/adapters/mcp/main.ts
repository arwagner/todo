import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { authenticate } from "../../auth/authenticate.ts";
import { databasePath } from "../../db/location.ts";
import { openDatabase } from "../../db/open.ts";
import { productionContext } from "../../service/context.ts";
import { createMcpServer } from "./server.ts";

const ctx = productionContext(openDatabase(databasePath()));

// The credential travels the same route it would over HTTP, so this adapter
// gets its Principal from the one function that knows about tokens (ADR 6).
const principal = authenticate(ctx, {
  headers: { authorization: `Bearer ${process.env["TODO_TOKEN"] ?? ""}` },
});

if (principal === null) {
  process.stderr.write(
    "TODO_TOKEN is missing or not a valid credential. Mint one with `todo tokens mint`.\n",
  );
  process.exit(1);
}

await createMcpServer(ctx, principal).connect(new StdioServerTransport());
