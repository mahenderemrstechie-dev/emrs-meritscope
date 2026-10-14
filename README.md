# EMRS MeritScope — Angular + Supabase

An independent, unofficial candidate-submitted score-analysis portal for EMRS TGT Computer Science and PGT Computer Science. It is not affiliated with NESTS/EMRS and must not be represented as an official website.

## Included
- Angular standalone application and responsive government-portal-inspired styling
- Candidate form: display name/alias, post, category, Tier 1 qualification and category, Tier 2 score, relaxation status, verified/estimated score label
- Supabase shared submissions and aggregate-only public dashboard RPC
- Excel/CSV import for local score-band analysis
- CSV category report and PDF report export
- SQL schema with RLS enabled and no public direct read access to candidate rows
- Vercel configuration

## Before using
The project URL is prefilled from the URL supplied in the chat. The Supabase publishable key is deliberately a placeholder. Do not put a database password or `service_role`/secret key in browser code.

### 1. Install and configure
Use Node.js 20 or 22, then:

```bash
npm install
```

Edit `src/environments/environment.ts` and replace `REPLACE_WITH_YOUR_SUPABASE_PUBLISHABLE_KEY` with the publishable key for the same Supabase project.

### 2. Create the database
In Supabase Dashboard → SQL Editor → New query, paste and run the contents of `supabase/schema.sql`.

This starter assumes Tier 2 scores are out of 100. Confirm the official maximum before launch; edit both the SQL check constraint and the frontend validation if the official scoring scale differs.

### 3. Run locally

```bash
npm start
```

Open `http://localhost:4200`.

### 4. Deploy to Vercel
1. Push this folder to a new GitHub repository.
2. In Vercel, choose Add New → Project and import the repository.
3. Build command: `npm run build`.
4. Output directory: `dist/emrs-meritscope/browser`.
5. Deploy. The included `vercel.json` sets these values too.

For production, avoid committing the actual key to a public repository. A better setup is to read the URL/key from Angular environment replacement or a deployment-time generated config; publishable keys are not secret, but should still be configured deliberately. Never expose the database password or secret/service-role key.

## Important security and accuracy notes
- The public form permits anonymous inserts; anyone can submit fake data. Add CAPTCHA/rate limiting or require user authentication before promoting the site widely.
- Candidate names are never returned by the public dashboard RPC. Do not add a public SELECT policy to the candidate table.
- The `Verified` label is self-reported, not independently verified.
- Candidate-submitted counts and cutoff estimates are not official recruitment results. Don't infer official UR migration or final selection from this survey alone.
- Excel/CSV import is local-only and does not upload spreadsheet rows to Supabase. PDF/CSV export reports the current dashboard view.
- A successful build/deployment and live database connection must be verified in your own accounts; this package has not been deployed on your behalf.
