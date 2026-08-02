# Todo

A personal work-tracking system. It records things you intend to do, the shape of how they repeat, and the history of what you actually did.

## Language

### Core

**Item**:
The single kind of thing this system tracks. There are no subtypes. An Item is a piece of intended work with a title, an Owner, and zero or more Capabilities.
_Avoid_: Task, Todo, Entry, Card, Note

**Capability**:
An optional facet an Item can carry, such as a Schedule or a Target. Capabilities attach independently, and any combination is valid.
_Avoid_: Feature, Trait, Aspect, Mixin

**Preset**:
A named bundle of Capabilities applied when an Item is created, such as "habit" or "project". A Preset is a shortcut for the person creating the Item and carries no meaning afterward.
_Avoid_: Type, Class, Kind, Category, Template

**Label**:
A free-form tag on an Item, used for grouping and filtering. An Item has zero or more.
_Avoid_: Tag, Category, Context, List

**Owner**:
The Principal an Item belongs to. Every Item has exactly one.

### Lifecycle

**Event**:
A recorded fact about something that happened to an Item, at a point in time. Events are the only history the system keeps, and only lifecycle facts are Events. Editing a title or a Label is not an Event.
_Avoid_: Log entry, Transition, Activity, Record

**Promotion**:
The Event recording that a person decided an Item is now actionable. It is a decision, not a consequence of anything else.
_Avoid_: Ready, Activation

**Start**:
The Event recording that work on an Item began.

**Completion**:
The Event recording that an Item, or one Occurrence of it, was finished.
_Avoid_: Done, Finish

**Drop**:
The Event recording that an Item was abandoned rather than finished.
_Avoid_: Cancel, Archive, Delete

**Progress**:
The Event recording partial advancement toward a Target, carrying an amount. Progress is not a Completion.
_Avoid_: Partial completion, Increment

**Status**:
The current lifecycle state of an Item, derived from its Events. It is a reading of the history, not a value someone sets.
_Avoid_: State, Stage

### Recurrence

**Schedule**:
The Capability that gives an Item a due date, a Recurrence Rule, or both.

**Recurrence Rule**:
The description of how often an Item repeats, and from what point the next repetition is measured.
_Avoid_: Repeat pattern, Cadence, Frequency

**Anchor**:
The part of a Recurrence Rule that says what the next repetition is measured from. A schedule anchor measures from fixed calendar dates. A completion anchor measures from the last Completion.

**Occurrence**:
One repetition of a recurring Item. An Occurrence is normally computed from the Recurrence Rule and the Event history rather than stored.
_Avoid_: Instance, Repetition

**Template**:
An Item marked as a pattern to be copied rather than worked on. Instantiating a Template creates a live Item and a live copy of everything it contains. Distinct from a Preset, which bundles Capabilities rather than Items.
_Avoid_: Blueprint, Preset, Recipe

**Instance**:
The live Item produced by instantiating a Template.

### Measurement

**Streak**:
The count of consecutive periods in which an Item has at least one Completion. Derived from the Event history.

**Target**:
The Capability that gives an Item a quantity to reach and a deadline to reach it by. Advancement toward it is recorded as Progress.
_Avoid_: Goal, Quota, Budget

### Relationships

**Dependency**:
A directed relationship stating that one Item cannot proceed until another is complete.
_Avoid_: Blocker link, Prerequisite

**Blocked**:
The condition of an Item having at least one incomplete Dependency. Derived, never stored.

**Containment**:
A directed relationship stating that one Item holds others. A container completes as its own deliberate act, not because its contents are finished.
_Avoid_: Subtask, Nesting, Project structure

**Rollup**:
The count of complete contents against total contents for a container. Derived and used for display only. It does not determine whether the container is complete.

### Access

**Principal**:
The identity a request acts as. It is the subject that owns Items and the thing a credential resolves to.
_Avoid_: User, Account, Actor

**Reminder**:
The Capability that gives an Item a time at which its Owner should be told about it. Reminder times are recorded but nothing acts on them yet.
_Avoid_: Alert, Notification, Nudge
