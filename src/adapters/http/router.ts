import type { Principal } from "../../service/context.ts";

export type RouteInput = {
  principal: Principal;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
};

export type RouteResult = {
  status: number;
  body?: unknown;
};

export type Route = {
  method: string;
  /** A path with `:name` segments, e.g. `/items/:id/events`. */
  path: string;
  handle: (input: RouteInput) => RouteResult;
};

export function route(
  method: string,
  path: string,
  handle: (input: RouteInput) => RouteResult,
): Route {
  return { method, path, handle };
}

export function matchRoute(
  routes: readonly Route[],
  method: string,
  pathname: string,
): { route: Route; params: Record<string, string> } | null {
  const actual = segments(pathname);
  let pathMatched = false;

  for (const candidate of routes) {
    const expected = segments(candidate.path);
    if (expected.length !== actual.length) continue;

    const params: Record<string, string> = {};
    const matches = expected.every((segment, index) => {
      const value = actual[index] as string;
      if (segment.startsWith(":")) {
        params[segment.slice(1)] = decodeURIComponent(value);
        return true;
      }
      return segment === value;
    });
    if (!matches) continue;

    pathMatched = true;
    if (candidate.method === method) return { route: candidate, params };
  }

  if (pathMatched) throw new MethodNotAllowed();
  return null;
}

export class MethodNotAllowed extends Error {}

function segments(path: string): string[] {
  return path.split("/").filter((segment) => segment !== "");
}
