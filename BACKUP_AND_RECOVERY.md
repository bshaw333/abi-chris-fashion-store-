# Abi-Chris store backups and recovery

This is an operating procedure, not an automatic backup service. The admin CSV files are exports for spreadsheet work; they are not a full database backup and do not preserve relationships, account settings, or uploaded photo files.

## Before launch

- [ ] Choose the Supabase plan and recovery target with the owners. As of this checklist, Supabase documents daily database backups for paid plans; retention varies by plan. Free projects need an owner-managed export routine. Check the current Supabase documentation and plan before deciding.
- [ ] Choose who receives backup access, where encrypted copies are stored, how long they are retained, and how often a restore drill will happen.
- [ ] Keep production credentials and database dumps in an access-controlled location. Never place a database password, service-role key, or dump in the website, a public repository, or a spreadsheet shared with staff.
- [ ] Store product photo originals separately. A database backup contains Storage metadata, but Supabase's documentation says database backups do not contain the underlying Storage objects.
- [ ] Record the chosen recovery point objective (maximum acceptable lost data) and recovery time objective (maximum acceptable outage) with the owners.

## Routine backup

1. Sign in to the **new production Supabase project** using an owner account.
2. Open **Database → Backups** and confirm that a recent backup or the chosen point-in-time recovery coverage is available for the plan.
3. For an owner-managed export, use the official Supabase CLI database dump procedure and save the encrypted dump outside the project folder. Do not copy credentials into chat or source code.
4. Confirm that the export completed, note its date, and retain it according to the agreed schedule.
5. Keep a separate copy of uploaded product photos and any other Storage files.

## Recovery drill and real recovery

1. Schedule the drill with both owners. A full restore can make the production project unavailable and roll records back to the selected point.
2. Prefer restoring a copy into a **separate recovery project** first, then compare product counts, stock, orders, expenses, staff roles, audit history, and photos.
3. Confirm database records and Storage files separately. Database restoration alone does not restore deleted Storage objects or every project setting (such as Auth configuration and API keys).
4. For a real incident, stop staff from entering new orders while the owners select the correct restore point. Confirm the exact project and time before approving a restore.
5. After restoration, verify login, redirect URLs, environment settings, RLS policies, product images, stock totals, and a test order before reopening the store.
6. Record the drill date, selected restore point, duration, missing items, and corrective actions in the master checklist.

## Official guidance

- [Supabase database backups and restore](https://supabase.com/docs/guides/platform/backups)
- [Supabase backup and restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

The Supabase backup and restore features, retention, and pricing can change. Check the current plan and official documentation before relying on a particular recovery option. Do not run a production restore as a test.
