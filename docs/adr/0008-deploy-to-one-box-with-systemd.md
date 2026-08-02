# Deploy to one box with systemd

ADR 5 committed the system to one process on one VPS, and that decision decides this one. The unit of deployment is a directory of source on that box, unpacked from a git revision, with `/opt/todo/current` a symlink to it. systemd runs it, restarts it when it dies, and starts it at boot. `deploy/remote.sh` unpacks the new revision, backs up, migrates, moves the symlink, restarts, and waits for the service to answer. If it does not answer, the symlink goes back and the service is restarted on what was running before.

A deploy ships the working tree, not only committed history. Refusing to deploy a dirty tree was tried first and rejected: it stops the deploy in the one situation where the operator can see exactly what they mean to ship, and it makes a commit the price of testing anything on the box. Instead the tree is written into a commit object parented on `HEAD`, with no branch, index, or working tree touched. A release is therefore still named by an immutable revision, reuse and rollback still work on revisions, and what a box runs can still be read back with `git show`. The cost is that a deployed revision may belong to no branch, so a box can run code that no branch contains. Pushing that commit to the box is what keeps the record of it.

The deploy is driven from the developer's machine rather than from the box. `deploy/deploy.sh` runs there, pushes the revision to a bare repository on the box, and then sends `deploy/remote.sh` over ssh to run as root. The box pulls from nothing. A box that pulls has a copy of the history whose age is invisible from where the deploy is started, and a deploy that reads a stale copy reports success while shipping an older revision. Sending the box side over the wire on every run applies the same argument to the deploy script itself, which otherwise only changes on the box once a deploy using it has already succeeded.

There is no build step to reproduce, because Node runs the TypeScript directly. A release is therefore the repository at a revision plus `node_modules`, and rolling back is moving a symlink rather than rebuilding anything.

## Considered options

Containers were rejected for the same reason Postgres was: they add a runtime to install, patch, and understand, in exchange for isolation and reproducibility that one process reading one file on one box does not need. The database would have to be a mounted volume anyway, which is the part that actually matters, and that part is solved by leaving the file where it is.

Deploying by `git pull` in place was rejected because it edits the running release, which makes a failed deploy a broken service rather than an unswitched symlink, and leaves no previous release to go back to.

## Consequences

The service binds `127.0.0.1` by default and something else terminates TLS in front of it. This is a change from listening on every interface: bearer tokens over plain HTTP on a public interface would have been the wrong default to keep, and `HOST` still opens it up deliberately. A bad `PORT` now stops the process starting rather than being read as `NaN`.

`GET /health` is the one route in front of authentication, because a deploy script and a supervisor both need to ask whether the process came up and neither holds a token. It reports whether the process can still reach its database and nothing else — no version, no counts, nothing about the data.

Backups are a systemd timer calling `todo backup`, which is `VACUUM INTO` and so takes a consistent copy without stopping the service. This does not contradict ADR 7: the timer is the operating system's, not the application's, and it fires a CLI command rather than anything inside the running process. For that to stay true, `todo backup` opens the database without migrating it — otherwise a clock would be able to move the schema, which is the thing ADR 7 actually forbids. Opening is what migrates, so the CLI opens per command rather than once at startup.

Nothing copies the backups off the box, so the failure that takes the disk still takes the backups, and arranging otherwise remains an unmade decision.

Rolling back moves the symlink, and the symlink only holds code. A release that migrated the database and then failed leaves the schema where the migration put it, and the previous release runs against it. Migrations therefore have to be readable by the release before them, or the rollback is a restore from the backup taken minutes earlier rather than a symlink move.
