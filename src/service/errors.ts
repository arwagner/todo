export type ServiceErrorCode = "not_found" | "invalid" | "conflict";

/**
 * The only error the service raises. Each adapter translates the code into its
 * own vocabulary, such as an HTTP status or an MCP error. No adapter inspects
 * the message (ADR 4).
 */
export class ServiceError extends Error {
  readonly code: ServiceErrorCode;

  constructor(code: ServiceErrorCode, message: string) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
  }
}

export function notFound(what: string): ServiceError {
  return new ServiceError("not_found", `${what} not found`);
}

export function invalid(message: string): ServiceError {
  return new ServiceError("invalid", message);
}

export function conflict(message: string): ServiceError {
  return new ServiceError("conflict", message);
}
