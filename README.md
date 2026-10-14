# EMRS MeritScope — Angular + Supabase

Independent, unofficial candidate-submitted score analysis for EMRS TGT Computer Science and PGT Computer Science. This is not affiliated with NESTS/EMRS and is not an official merit list or cutoff estimator.

## Features
- Public candidate score submission form and aggregate-only Supabase dashboard.
- Combined BI metrics across shared submissions and local imported CSV/Excel scores.
- Score threshold, source comparison, category average and TGT/PGT charts.
- Restricted admin workflow for importing the TGT CS merit list into Supabase.
- Combined CSV and PDF reports.

## Supabase setup
The frontend points to project `ggumftjadfhofenealxs` using a browser-safe publishable key. Never put a database password or service-role/secret key in frontend code or GitHub.

1. In Supabase Dashboard for project `ggumftjadfhofenealxs`, open SQL Editor.
2. Review and run `supabase/schema.sql` if the base schema is not already present.
3. Run `supabase/migrations/20261014_admin_merit_import.sql` after the base schema.
4. In Supabase Dashboard → Authentication → Users, create a trusted admin account. Copy that Auth user's UUID.
5. Add only that trusted UUID to the allow-list:
   ```sql
   insert into public.admin_users(user_id)
   values ('PASTE-AUTH-USER-UUID-HERE')
   on conflict (user_id) do nothing;
   ```
6. Run `supabase/migrations/20261015_secure_public_submissions_admin_import.sql` after the previous migration. This keeps the public score form working while restricting bulk import to the protected admin RPC.
7. Verify `public.candidate_submissions`, `public.admin_users`, and `public.admin_import_merit_list(jsonb)` exist.

The migration does not import a CSV. Candidate rows are not publicly readable; the dashboard uses aggregate statistics only. Public form submissions remain enabled by design and can be spammed, so consider CAPTCHA/rate limiting before wide release.

## Import the TGT CS merit list
1. Confirm the CSV is the TGT Computer Science list and `Marks` are out of 100.
2. In Reports, choose **Import merit list to database** (not **Preview scores only**).
3. Sign in with the allow-listed Supabase Auth account.
4. Select the file containing `Rank`, `Name`, `Category`, `Marks`, `Age Relaxed`, `DV Status`, and `Other Govt Job`.
5. Confirm authorisation and click **Validate and import into Supabase**.
6. Review inserted/skipped/invalid counts and refresh the shared dashboard.

The importer validates rank, name, category and marks and sends batches of up to 100 rows. Rank-based idempotency keys make re-importing safe: already-imported ranks are skipped rather than duplicated. The migration and code change do not insert candidate data automatically.

## Local development and deployment
Use Node.js 20 or 22:
```bash
npm install
npm run build
npm start
``
For Vercel, use build command `npm run build` and output directory `dist/emrs-meritscope/browser`. Verify the Vercel deployment logs and the live Supabase connection before sharing the site.

## Security notes
- The public candidate form remains open for score submissions.
- Public visitors cannot directly write import metadata, update/delete candidate rows, or call the bulk-import RPC.
- Only an authenticated user explicitly listed in `public.admin_users` can bulk-import.
- Never expose a service-role key in browser code.
- This is an unofficial survey tool; public submissions may be inaccurate and are not official selection outcomes.
