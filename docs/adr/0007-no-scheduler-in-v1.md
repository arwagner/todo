# No scheduler in v1

The system is active on write and has no clock. Completing an Item advances derived state in the same transaction, and asking what is due evaluates Recurrence Rules at query time, but nothing ever happens without a request. This is deliberate and not an unfinished feature.

Reminder times are stored, Recurrence Rules are stored, and Templates carry recurrence, yet none of these fire on their own. Anyone reading the schema will notice that and should not "fix" it.

## Why it is deferred rather than absent

A scheduler needs two things that are separate decisions with their own failure modes. It needs a durable timer that survives a reboot and fires once rather than twice or never. It needs a delivery channel, because a Reminder is worthless unless something receives it, and Claude Code is not running at 09:00 on a Tuesday. Choosing email, push, or a webhook is an integration decision that has not been made.

## Consequences

Everything a scheduler would need is already recorded, so adding one reads the same rows and adds a sender with no schema change. Template instantiation is explicit for the same reason: making a read instantiate due Templates as a side effect would be a workaround for the missing scheduler that has to be unwound when the scheduler arrives.
