# EMRS MeritScope — Angular + Supabase

Independent, unofficial candidate-submitted score analysis for EMRS TGT Computer Science and PGT Computer Science. This is not affiliated with NESTS/EMRS and is not an official merit list or cutoff estimator.

## Features
- Candidate submission form and aggregate-only Supabase dashboard.
- Combined BI metrics across shared submissions and local imported CSV/Excel scores.
- Score threshold, source comparison, category average and TGT/PGT BI charts.
- Rank predictor showing rank among stored submissions, percentile, and an explicitly assumption-based estimated overall rank.
- Combined category/post breakdown, including shared/imported counts.
- Combined CSV and PDF reports.
- Restricted admin workflow for importing the TGT CS merit list into Supabase, with server-side admin allow-list validation, batch inserts and idempotent rank keys.

## Supabase setup
The frontend configuration points to project `ggumftjadfhofenealxs` using the publishable key supplied by the project owner. Browser publishable keys are intended for frontend use. Never place a database password or service-role/secret key in frontend code or GitHub.

1. In Supabase Dashboard for project `ggumftjadfhofenealxs`, open SQL Editor.
2. Review and run `supabase/schema.sql` if the base schema is not already present.
3. Run `supabase/migrations/20261014_admin_merit_import.sql` after the base schema. This adds private import metadata, an admin allow-list, and the protected import RPC. It does not import any CSV by itself.
4. Run `supabase/migrations/20261014_rank_predictor.sql`. This adds `get_rank_prediction(text, numeric)`, which returns only aggregate rank/percentile data for the selected post and supplied score.
5. Continue with the admin account setup below.
4. In Supabase Dashboard → Authentication → Users, create a dedicated admin account. Use a strong unique password and enable appropriate account security.
5. Copy the Auth user's UUID. In SQL Editor, allow-list that exact user:
   ```sql
   insert into public.admin_users(user_id)
   values ('PASTE-AUTH-USER-UUID-HERE');
   ```
   Do not allow-list public users. Only an explicitly allow-listed signed-in account can call `admin_import_merit_list`.
6. Verify that `public.candidate_submissions`, `public.admin_users`, and `public.admin_import_merit_list(jsonb)` exist before using the import panel.

The migration keeps candidate records private: public visitors receive aggregate dashboard data only. It does not grant public SELECT access to candidate rows. Anonymous public submissions remain enabled as before; add CAPTCHA/rate limiting or authentication before widely sharing the form.

## Import the TGT CS merit list
1. Confirm that the CSV is specifically the TGT Computer Science list and that `Marks` are out of 100. The migration intentionally maps the list to `TGT CS`.
2. Sign in through the **Import merit list to shared database** panel with the allow-listed admin account.
3. Select the CSV/XLSX file containing `Rank`, `Name`, `Category`, `Marks`, `Age Relaxed`, `DV Status`, and `Other Govt Job`.
4. Confirm the import checkbox and click **Validate and import into Supabase**.
5. Review the inserted/skipped/invalid counts and refresh the shared dashboard.

The import validates rank, name, category and marks, retains age-relaxation and document-verification metadata, and sends batches of up to 100 records. It uses an idempotency key based on the TGT CS merit-list rank, so retrying the same file skips ranks already inserted rather than duplicating them. Existing records are not overwritten. If a row has changed since a prior import, investigate it before editing the database manually.

Imported candidate names and row metadata are stored in the private table, not in the public Git repository. Public analytics expose only aggregates. The importer maps `Age Relaxed` to the existing relaxation field and keeps `DV Status` / `Other Govt Job` in dedicated metadata columns. It does not infer Tier 1 qualification; imported rows store that field as NULL.

## Local development and deployment
Use Node.js 20 or 22:

```bash
npm install
npm start
```

Open `http://localhost:4200`. Before production, run `npm run build` and test the submission flow, public aggregate RPC, admin sign-in, a small import, duplicate re-import, and CSV/PDF exports.

For Vercel, use build command `npm run build` and output directory `dist/emrs-meritscope/browser`. Verify deployment logs and the live Supabase connection before sharing the site.

## Accuracy and security notes
- This site is unofficial. Survey data and cutoff estimates are not official selection outcomes.
- The imported CSV is candidate data; do not commit it to the public repository.
- Only add a trusted admin Auth UUID to `public.admin_users`. Never expose a service-role key in browser code.
- The `Verified` form flag is self-reported, not independently verified.
- Confirm the exam's official score scale before import; current validation assumes 0–100.
- The public form can receive fake submissions; CAPTCHA/rate limiting or authenticated submission is recommended.
- A successful build, SQL migration, and live import must be verified in the user's own Supabase/Vercel projects; this code change does not execute SQL or upload the CSV automatically.
