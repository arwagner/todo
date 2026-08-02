# Opaque tokens now, with a seam for extracting auth

Authentication will move out to a shared service later, serving several applications. That constrains the design now: this system must **verify** a credential, never **issue** identity. Until the shared service exists, credentials are opaque tokens stored one row each, hashed with SHA-256 at rest, prefixed `todo_pat_`, and revoked by setting `revoked_at` rather than deleting.

Everything auth-related passes through one function, `authenticate(request) -> Principal | null`, called by one middleware. Nothing downstream knows tokens exist. When auth is extracted, that function is rewritten and nothing else changes.

## Considered options

A single shared secret in an environment variable cannot attribute an action to a person, and the second person makes the token table necessary anyway. JWTs buy statelessness this system has no need of, and cost revocability, which it does need. Running an OAuth provider is the correct endgame and the wrong starting point, because it means operating an identity provider before the application exists.

## Consequences

Tokens are minted by a CLI command on the VPS, so creating a credential requires SSH access and there is no remote administrative endpoint to secure incorrectly. Every Item carries `owner_id` from the first migration even while only one Principal exists, because retrofitting tenancy means auditing every query in the system and the cost of missing one is disclosure. The service layer takes the Principal as an explicit argument rather than reading ambient context, so a query that forgets to filter fails to compile.
