# V3 Public Pilot Deployment

This runbook launches the public landing, upload, and demo dashboard as a separate App Runner service. It must not replace or share credentials with the Wedgewood service.

## Runtime Boundaries

- Set `APP_MODE=pilot`. The server mounts the public demo plus restricted, club-scoped auth, dashboard, member, report, and activity APIs.
- GHL webhooks, legacy public member pages, staff management, capacity settings, permanent member deletion, and admin webhook tooling are unavailable in pilot mode.
- `APP_MODE=demo` remains the isolated fallback with only health and public demo APIs.
- Demo uploads are processed in memory. Raw files are not stored.
- Persisted demo membership data is limited to names, ages, household grouping, membership tier, and guest-pass totals.
- Every demo expires after seven days. The nightly cleanup removes expired jobs, prospects, clubs, memberships, and people.
- CSV, XLSX, and XLS are supported. Apple Numbers users must export CSV or Excel.

## Manual AWS Steps

1. Create database `swimclub_sandbox` on the existing RDS instance.
2. Create a dedicated sandbox database user. Make it owner of only `swimclub_sandbox`, revoke access to `swimclub`, and verify it cannot connect to or query production.
3. Create a new App Runner service from the `v3` branch and this repository's Dockerfile. Do not edit the Wedgewood service.
4. Reuse the existing VPC connector and allow its security group to reach RDS port `5433`.
5. Configure the service environment:
   - `APP_MODE=pilot`
   - `NODE_ENV=production`
   - `PORT=3000`
   - `DATABASE_URL=<sandbox-user swimclub_sandbox URL>`
   - `DEMO_RETENTION_DAYS=7`
   - `CORS_ORIGIN=<new App Runner URL>`
   - `DISABLE_AUTO_SIGNOUT=true`
   - `DISABLE_EMAIL_DIGEST=true`
   - `DISABLE_WEBHOOK_CLEANUP=true`
   - random sandbox-only `JWT_SECRET` and `WEBHOOK_SECRET`
6. Set the health check path to `/api/v1/health` on port `3000`.
7. Leave automatic deployment disabled for the first release. Docker startup runs `prisma migrate deploy`; confirm the connection is `swimclub_sandbox` before deploying.
8. Add CloudWatch alarms for App Runner 5xx responses, CPU, and memory. Review ingestion failure and cleanup logs daily during the pilot.

## Smoke Test

1. Open `/` on desktop and mobile.
2. Submit `/demo` with the authorization checkbox selected and upload a known CSV fixture.
3. Confirm the success counts, open the demo dashboard, and choose `Explore the full admin`.
4. Confirm the restricted staff dashboard opens, the one-time PIN appears in the demo banner, and a browser refresh restores the session automatically.
5. Upload XLSX and the title-row CSV; confirm both load.
6. Confirm `.numbers`, oversized, over-5,000-row, and over-100-column files show friendly errors.
7. Confirm a real/non-demo club ID returns `404` from the public overview endpoint.
8. Temporarily expire a demo in the sandbox, run the cleanup job, and verify its jobs, prospect, club, memberships, and people are deleted.
9. Verify the Wedgewood App Runner service and production database have no V3 migration or configuration changes.

Rollback is disabling the sandbox service or redeploying its previous image. Wedgewood remains independent.
