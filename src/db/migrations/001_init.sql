-- Principals own Items. A credential resolves to one of these (ADR 6).
create table principals (
  id         text primary key,
  name       text not null,
  created_at text not null
);

-- Opaque tokens, hashed at rest, revoked rather than deleted (ADR 6).
create table tokens (
  id           text primary key,
  principal_id text not null references principals(id) on delete cascade,
  token_hash   text not null unique,
  name         text not null,
  created_at   text not null,
  revoked_at   text
);
create index tokens_principal on tokens(principal_id);

-- The one kind of thing this system tracks. There are no subtypes (ADR 1).
-- current_status is a derived index over events, not the source of truth (ADR 2).
create table items (
  id                text primary key,
  owner_id          text not null references principals(id),
  title             text not null,
  notes             text,
  is_template       integer not null default 0 check (is_template in (0, 1)),
  instantiated_from text references items(id) on delete set null,
  current_status    text not null,
  created_at        text not null,
  updated_at        text not null
);
create index items_owner_status on items(owner_id, current_status);
create index items_instantiated_from on items(instantiated_from);

create table item_labels (
  item_id text not null references items(id) on delete cascade,
  label   text not null,
  primary key (item_id, label)
);
create index item_labels_label on item_labels(label);

-- Capabilities attach independently. No Capability is guaranteed present (ADR 1).

-- A Schedule carries a due date, a Recurrence Rule, or both.
-- rule is a JSON tagged object, so a later migration can add a new rule
-- system without touching existing rows (ADR 3).
create table schedules (
  item_id text primary key references items(id) on delete cascade,
  due_at  text,
  rule    text
);

create table targets (
  item_id  text primary key references items(id) on delete cascade,
  amount   real not null,
  unit     text,
  deadline text
);

-- Reminder times are recorded but nothing acts on them (ADR 7).
create table reminders (
  item_id   text primary key references items(id) on delete cascade,
  remind_at text not null
);

-- The only history the system keeps. Writes append. To correct a mistake,
-- delete the row (ADR 2). Ordering within an Item is (at, rowid).
create table events (
  id      text primary key,
  item_id text not null references items(id) on delete cascade,
  kind    text not null check (kind in ('promoted', 'started', 'completed', 'dropped', 'progress')),
  at      text not null,
  amount  real,
  note    text
);
create index events_item_at on events(item_id, at);
create index events_item_kind_at on events(item_id, kind, at);

-- item_id cannot proceed until depends_on_id is complete.
create table dependencies (
  item_id       text not null references items(id) on delete cascade,
  depends_on_id text not null references items(id) on delete cascade,
  primary key (item_id, depends_on_id),
  check (item_id <> depends_on_id)
);
create index dependencies_depends_on on dependencies(depends_on_id);

-- container_id holds child_id. A container completes as its own deliberate
-- act, not because its contents are finished.
create table containment (
  container_id text not null references items(id) on delete cascade,
  child_id     text not null references items(id) on delete cascade,
  primary key (container_id, child_id),
  check (container_id <> child_id)
);
create index containment_child on containment(child_id);
