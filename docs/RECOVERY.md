# DevicePassport recovery runbook

## Normal backup routine

1. Keep the application `.data` directory on a persistent disk or Docker volume.
2. Sign in as an Owner and open **Settings → Data protection**.
3. Confirm the database, backup, session secret, and public URL readiness checks.
4. Download a manual snapshot after important imports, staff changes, or bulk sales.
5. Copy downloaded snapshots to storage outside the application server.

DevicePassport creates at most one automatic snapshot per UTC day when an authenticated dashboard is opened. It retains the newest 14 automatic snapshots. Manual and pre-restore safety snapshots are not automatically deleted.

## Restore from an in-app recovery point

1. Stop staff from changing devices, sales, claims, or settings during recovery.
2. Open **Settings → Data protection** as an Owner.
3. Download the latest current snapshot before continuing when the database is still accessible.
4. Choose **Restore** beside the intended recovery point.
5. Verify the filename and timestamp, type `RESTORE`, enter the current Owner password, and confirm.
6. Reload the dashboard after success and verify devices, staff, recent sales, and claims.
7. Check `/api/health` and create a fresh manual snapshot.

Every restore first creates a `Safety` snapshot of the current live database. Uploaded backup restore is intentionally not supported in this slice; place an off-site `.db` file in the configured backup directory using server access, restart the app, and then use the verified in-app restore flow.

## Server-level recovery

The default paths are:

- Database: `.data/device-passport.db`
- Backups: `.data/backups/`
- Structured system log: `.data/logs/system.log`

Docker stores all three under `/app/.data` in the `devicepassport-data` volume. Never replace the live database while the application process is running. Prefer the in-app restore flow, which closes SQLite, removes stale WAL sidecars, validates the replacement, and rolls back automatically if reopening fails.

## Incident checks

- `/api/health` should return HTTP 200 and `database: connected`.
- A 503 response means the database health check failed.
- Repeated login failures return HTTP 429 with a `Retry-After` header.
- Restore failures and automatic backup failures are recorded as JSON lines in `.data/logs/system.log`.
- Production readiness requires an HTTPS `NEXT_PUBLIC_APP_URL`, a session secret of at least 32 characters, and explicit Owner seed credentials.
