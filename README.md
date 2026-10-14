# EMRS MeritScope — Angular + Supabase

Independent, unofficial candidate-submitted score analysis for EMRS TGT Computer Science and PGT Computer Science. This is not affiliated with NESTS/EMRS and is not an official merit list or cutoff estimator.

## Features
- Candidate submission form and aggregate-only Supabase dashboard.
- Combined BI metrics across shared Supabase submissions and one locally imported Excel/CSV file.
- Score threshold counts (90+, 85+, 80+), source comparison, average score by category, and TGT/PGT comparison charts.
- Category/post analysis showing combined, shared, and imported counts, average, highest score, and threshold counts.
- Import validation: recognizes common score/post/category column aliases, normalizes known categories, and clearly reports rows with missing/unknown categories or posts.
- Combined CSV and PDF exports.
- Responsive styling for desktop and mobile.

## Data handling
Shared data is retrieved through the aggregate-only `get_public_dashboard()` RPC. Imported spreadsheet rows are held in memory in the current browser session and are not uploaded to Supabase or shared with other visitors. A new import replaces the previous local import to avoid double counting. The imported dataset is added to shared counts for the dashboard while preserving separate source counts.

The importer assumes Tier 2 scores are out of 100. Confirm the official score maximum before launch and update both SQL constraints and frontend validation if required. Rows with invalid/missing scores or scores outside 0–100 are skipped; rows with valid scores but unknown post/category are retained under `Unknown` so they remain visible instead of being silently dropped or misclassified.

## Configure and run
1. Use Node.js 20 or 22.
2. Run `npm install`.
3. The browser configuration in `src/environments/environment.ts` points to the supplied Supabase project URL and publishable key. Publishable keys are intended for browser use; never add a database password or service-role/secret key to frontend code.
4. In Supabase Dashboard for project `vrvfdanppwbcsdjheswe`, open SQL Editor and run `supabase/schema.sql` after reviewing it. This creates the table, insert policy, and aggregate dashboard RPC. It has not been executed by this repository change.
5. Run locally with `npm start` and open `http://localhost:4200`.

## Vercel
Import this GitHub repository into Vercel. Build command: `npm run build`; output directory: `dist/emrs-meritscope/browser`. Confirm the build and live Supabase RPC work before sharing the site.

## Production cautions
- Anonymous public inserts can be spammed. Add CAPTCHA/rate limiting or authenticated submissions before widely sharing the form.
- Do not add public SELECT access to individual candidate rows or expose candidate names.
- The `Verified` score flag is self-reported and not independently verified.
- The survey may be biased and should not be treated as official selection/cutoff information.
- Imported rows are browser-local. To share them globally, implement a controlled admin-only import path with validation and audit trail rather than a public bulk insert.
