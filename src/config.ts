export type ServerConfig = {
  host: string;
  port: number;
};

/**
 * How the running process is told where to listen. The default is loopback,
 * because the deployed service sits behind a reverse proxy that terminates TLS
 * (ADR 8). Binding a public interface is something you ask for.
 */
export function serverConfig(
  env: Record<string, string | undefined>,
): ServerConfig {
  const host = env["HOST"];
  const port = env["PORT"];

  return {
    host: host === undefined || host === "" ? "127.0.0.1" : host,
    port: port === undefined || port === "" ? 8787 : portNumber(port),
  };
}

function portNumber(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a port number, not "${value}"`);
  }
  return port;
}
