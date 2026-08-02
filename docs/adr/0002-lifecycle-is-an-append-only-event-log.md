# Lifecycle is an append-only Event log

Streaks, quantity targets, and questions like "how long was this open" all need the history of what happened to an Item, which a mutable status column destroys on every transition. Lifecycle facts are therefore recorded as Events (`promoted`, `started`, `completed`, `dropped`, `progress`), and Status is derived from them rather than stored as the source of truth.

This is deliberately **not** event sourcing. Attribute edits are ordinary mutable updates. There is no `title_changed` Event, and there should never be one. Only lifecycle facts become Events, because they are the only things whose history is worth keeping.

## Consequences

Streak and Target collapse into two queries over one table rather than two Capabilities: a Streak is a gap scan over Completions per period, a Target is a sum of Progress amounts in a window. Reading current status becomes a fold rather than a column read, so a cached `current_status` column is maintained at write time as a derived index, with the log staying authoritative. Correcting a mistaken Completion means deleting the Event row, so deletion must be reachable from every adapter.
