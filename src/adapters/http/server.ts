import { createServer } from "node:http";
import { authenticate } from "../../auth/authenticate.ts";
import { ServiceError } from "../../service/errors.ts";
import { MethodNotAllowed, matchRoute } from "./router.ts";
import { routes } from "./routes.ts";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { ServiceContext } from "../../service/context.ts";

const STATUS_FOR: Record<string, number> = {
  invalid: 400,
  not_found: 404,
  conflict: 409,
};

const MAX_BODY_BYTES = 1_000_000;

export function createHttpServer(ctx: ServiceContext): Server {
  const table = routes(ctx);

  return createServer((request, response) => {
    handle(ctx, table, request, response).catch((error: unknown) => {
      process.stderr.write(`unhandled: ${String(error)}\n`);
      send(response, 500, { error: "internal error" });
    });
  });
}

async function handle(
  ctx: ServiceContext,
  table: ReturnType<typeof routes>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://todo.invalid");

  // One middleware, one call. Nothing downstream knows tokens exist (ADR 6).
  const principal = authenticate(ctx, request);
  if (principal === null) {
    response.setHeader("www-authenticate", "Bearer");
    send(response, 401, { error: "unauthenticated" });
    return;
  }

  let matched;
  try {
    matched = matchRoute(table, request.method ?? "GET", url.pathname);
  } catch (error) {
    if (error instanceof MethodNotAllowed) {
      send(response, 405, { error: "method not allowed" });
      return;
    }
    throw error;
  }
  if (matched === null) {
    send(response, 404, { error: "no such route" });
    return;
  }

  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    send(response, 400, { error: "body was not valid JSON" });
    return;
  }

  try {
    const result = matched.route.handle({
      principal,
      params: matched.params,
      query: url.searchParams,
      body,
    });
    send(response, result.status, result.body);
  } catch (error) {
    if (error instanceof ServiceError) {
      send(response, STATUS_FOR[error.code] ?? 400, {
        error: error.message,
        code: error.code,
      });
      return;
    }
    throw error;
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw === "" ? {} : JSON.parse(raw);
}

function send(
  response: ServerResponse,
  status: number,
  body: unknown = undefined,
): void {
  if (body === undefined) {
    response.writeHead(status);
    response.end();
    return;
  }
  const payload = JSON.stringify(body ?? null);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}
