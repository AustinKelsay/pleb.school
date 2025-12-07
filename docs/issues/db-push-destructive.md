# Issue: destructive schema changes on container start

## Summary
The dev Docker Compose command **used to** run `npx prisma db push --accept-data-loss` on every app container start. That was removed so the app no longer mutates the schema automatically. If that pattern had been reused in staging/production, Prisma could drop columns or tables to match the schema, silently destroying data. There are still no checked-in migrations to constrain or review schema changes.

## Why this blocks production
- `--accept-data-loss` bypasses safety checks; accidental field removal or type change will truncate data.
- Automatic `db push` on boot means any deploy could mutate the prod schema without review or backup.
- Lack of migrations makes rollbacks and forensic analysis difficult.

## Evidence
- `docker-compose.yml` now starts without `prisma db push`; schema changes must be applied manually.
- No `prisma/migrations` directory is checked in.

## Recommended direction
1) **Split dev vs prod compose.** Keep `db push` only in a dev compose file; create a prod compose that starts the app without schema mutation.
2) **Adopt migrations.** Use `prisma migrate dev` locally and commit `prisma/migrations`; use `prisma migrate deploy` in CI/CD and production.
3) **Remove `--accept-data-loss`.** Never use this flag outside ephemeral development DBs.
4) **Backups and runbook.** Define backup/restore steps and pre-deploy checks (schema diff, migration review).
5) **Gate schema changes.** Add a CI job that fails if there are Prisma schema diffs without migrations.

## Minimal rollout plan
- Add `prisma/migrations` via `prisma migrate dev`, commit them.
- Create `docker-compose.dev.yml` with current convenience commands; create `docker-compose.prod.yml` without `db push` and without bind-mounting the repo.
- Update README/deploy docs to use `prisma migrate deploy` for prod and to run backups before migrations.
