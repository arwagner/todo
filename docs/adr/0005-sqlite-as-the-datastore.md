# SQLite as the datastore

The system runs as one process on one VPS, serving one person and eventually a handful of known people. Postgres would add a second service to install, patch, monitor, and back up in exchange for concurrency this workload will never generate. SQLite through the built-in `node:sqlite` module needs no runtime dependency at all, and the "shared database later" argument does not apply because a future auth service should own its own store regardless.

## Considered options

`better-sqlite3` was rejected only because its main advantage is ecosystem, and the ecosystem in question is migration tooling that hand-rolled numbered migration files replace in about thirty lines. The APIs are close enough that swapping is confined to one module.

## Consequences

This closes one future genuinely rather than inconveniently: multiple application instances behind a load balancer will not work. Backups are not inherited from a database service and must be arranged deliberately, either by streaming to object storage or by a scheduled `VACUUM INTO` copied off the box. The database file lives outside the deploy directory so that no deploy script can remove it.
