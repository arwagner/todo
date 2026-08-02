# Known bugs

Found on 2026-08-02 through the MCP adapter while creating 37 items.

Bugs 1 and 2 are fixed. Bug 3 is still open. Each heading says which.

## 1. A schedule with only a due date crashes the server (fixed)

Ticket 01 fixed this, with bug 2. The validators now read an absent optional
field as the null it means. `test/service/capabilities.test.ts` covers it.

**Call**

```json
capture({
  "title": "Do the laundry",
  "schedule": { "dueAt": "2026-08-02T23:59:00-04:00" }
})
```

**Expected:** the item is created with a due date and no recurrence rule.

**Actual:**

```
MCP error -32603: Cannot read properties of undefined (reading 'kind')
```

The error is an uncaught TypeError, not a validation message. The caller gets a
generic internal error and no indication of which field is wrong.

The published tool schema does not list `rule` as required, so this input is
legal by the schema.

Relevant code: `validateSchedule` and `validateRule` in
`src/service/capabilities.ts`.

## 2. Optional capability fields are rejected when the key is absent (fixed)

Ticket 01 fixed this, with bug 1. The input types in
`src/service/capabilities.ts` now say which fields a caller may omit. The
validators read an absent field and an explicit null the same way.

**Call**

```json
capture({
  "title": "Walk on the treadmill",
  "preset": "habit",
  "schedule": { "dueAt": "...", "rule": { "kind": "completion", "every": 1, "unit": "day" } },
  "target": { "amount": 5, "unit": "walks at 3.8 mph for 30 min" }
})
```

**Expected:** the target is created with no deadline. The schema lists `amount`
as the only required field of `target`, and types `deadline` as string or null.

**Actual:**

```
invalid: target.deadline must be an ISO 8601 timestamp
```

The same happens for `schedule.dueAt` when the caller sends a `rule` and no
`dueAt`.

An absent key and an explicit `null` are treated differently. Sending
`"deadline": null` succeeds. Omitting the key fails.

Relevant code: `validateSchedule` and `validateTarget` in
`src/service/capabilities.ts`.

**Workaround:** none needed now. A caller may omit any optional sub-field.

## 3. Agenda hides work that is due later the same day (open)

**Setup:** an item due at 2026-08-02T23:59:00-04:00.

**Call:** `agenda()` at 2026-08-02T16:40:00-04:00.

**Actual:** returns `[]`.

**Call:** `agenda({ "at": "2026-08-03T12:00:00-04:00" })`.

**Actual:** returns the item.

The agenda shows an item only after its due time passes. Work that is due
tonight does not appear this afternoon. This may be the intended reading of
"what is waiting on the Owner at a given moment". Confirm the intent before
any change.
