# HTTP and MCP are adapters over one service layer

The system exposes two surfaces: an HTTP API and an MCP server for Claude Code. Both run in one process, and both call the same service functions. The MCP `capture` handler and the `POST /items` handler both call `createItem`. Neither adapter calls the other, and the MCP server does not make internal HTTP requests back to the API.

The failure this prevents is drift. With two independent implementations, validation gets fixed in one and not the other, a Capability reaches one surface and never the other, and within a year one surface is the real API and the other is stale.

## Consequences

The MCP tool surface is free to be coarse and intent-shaped rather than mirroring REST resources, because the primary client is a language model and round trips are the expensive thing. Adapters stay thin: each one parses a request into a Principal plus arguments and formats the result. Any logic that appears in an adapter is a bug.
