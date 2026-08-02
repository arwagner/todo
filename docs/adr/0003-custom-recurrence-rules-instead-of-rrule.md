# Custom Recurrence Rules instead of RRULE

Recurrence needs two Anchors. A schedule anchor measures the next repetition from fixed calendar dates, as in "bins go out every Tuesday". A completion anchor measures it from the last Completion, as in "change the filter three months after I last changed it". RFC 5545 `RRULE` is a calendar standard and cannot express a completion anchor at all, so adopting it would still leave a bespoke scheme for the other half and two rule systems to maintain. A single small tagged rule object covers both.

## Considered options

`RRULE` with a separate custom field for floating rules, and cron expressions. Cron has the same anchor limitation as `RRULE` and is harder to read.

## Consequences

Some rule you want will eventually be inexpressible, most likely something like "the last working day of the month". The rule is stored as a tagged object so a `{kind: "rrule", value: "..."}` variant can be added later without touching existing rows. The Anchor also determines Streak semantics: under a schedule anchor a missed period is a gap that breaks the streak, under a completion anchor there are no missed periods.
