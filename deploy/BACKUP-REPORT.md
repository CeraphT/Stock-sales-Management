# Daily backup-status e-mail

A daily e-mail to **infos@mfspace.lu** summarising the Postgres backups, styled
like an MSP "Backup & Recovery" dashboard. Lives on the Hetzner box
(`116.203.144.105`); the live Caddy/compose config is kept on the server (not in
git), this folder holds the script + these notes.

## What it reports
For both databases dumped by `/root/bin/pg-backup.sh` (**housebudget** +
**pharmastock**, from `deploy-db-1`):
- KPI bars: **Backup status** (completed / with errors / in process / unsuccessful)
  and **Last successful backup time** (<24h / <48h / >48h).
- A per-database table (live size, dump size, 14-day presence bar, status, errors,
  download link).
- A full **restore-points** table: every retained dump, newest first, each with a
  download link.

## Files
- `deploy/backup-report.sh` → deployed to **`/root/bin/backup-report.sh`** (`chmod +x`).
- Cron: appended to **`/etc/cron.d/pg-backup`**:
  ```
  30 4 * * * root /root/bin/backup-report.sh >> /var/log/pg-backup.log 2>&1
  ```
  Runs at 04:30 UTC, after the 03:30 dump and the 04:15 watchdog.
- SMTP: reuses HouseBudget's LWS mailbox exactly like `/root/bin/backup-alert.sh`
  (`curl` STARTTLS `mail.mfspace.lu:587`, password `SMTP_PASS` read from
  `/root/apps/housebudget-v2/deploy/.env` at send time). Only `curl` is installed.
  One retry, then a `backup-alert.sh` notice if the send still fails.

## Download link
The e-mail links each dump at `https://guide.mfspace.lu/dl-<TOKEN>/<file>.dump` —
a **direct download on click** (no login prompt). Served by the existing
**`guide`** Caddy container:
- `docker-compose.yml` (server): add a RO mount to the `guide` service:
  `- /root/backups:/srv-backups:ro`
- `guide.Caddyfile` (server): add, before the catch-all `handle`:
  ```
  handle_path /dl-<TOKEN>/* {
      root * /srv-backups
      file_server
  }
  ```
  No `browse`, so the bare `/dl-<TOKEN>/` returns 404 (no directory listing); only
  the exact file links from the e-mail work.
- `<TOKEN>` is a long random path segment stored in **`/root/secrets/dl-token`**
  (the script reads it; never hardcoded, never in git).

**Rotate** the link: `openssl rand -hex 16` → write to `/root/secrets/dl-token`
and update the `handle_path` segment; validate the on-disk Caddyfile with a
throwaway container, then `docker compose up -d --force-recreate guide` (the
single bind-mounted file keeps its old inode until the container is recreated).

> Security note: these dumps contain all customer data, and the link is reachable
> over the internet guarded only by the unguessable secret path. Anyone with the
> e-mail can download. Restrict by IP, re-add basic auth, or remove the link if
> that trade-off isn't wanted.
