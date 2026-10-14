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
The frontend configuration is set to Supabase project `ggumftjadfhofenealxs` using the publishable key you supplied. Confirm this is the intended project before deployment. Do not put a database password or `service_role`/secret key in browser code.

### 1. Install and configure
Use Node.js 20 or 22, then:

```bash
npm install
```

`src/environments/environment.ts` is preconfigured with the URL and publishable key for project `ggumftjadfhofenealxs`. These are browser-side settings; the publishable key is not a database password. Keep privileged keys and passwords out of the frontend and repository.

### 2. Create the database
Open the [Supabase Dashboard](https://supabase.com/dashboard/project/ggumftjadfhofenealxs) → SQL Editor → New query, paste the contents of `supabase/schema.sql`, review them, then run the SQL. This creates the candidate submissions table, Row Level Security policy, and aggregate dashboard function in this project. The SQL has not been executed automatically by this package.

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

The Supabase URL and publishable key are included in the Angular browser bundle and are not secrets. If the repository is public, this is expected for a publishable key, but never expose a database password or secret/service-role key. If using Vercel environment variables instead, update the Angular configuration to consume them through a supported build-time configuration approach; simply adding Vercel variables does not override hardcoded Angular values.

## Optional Supabase CLI workflow
The CLI is not required if you run `supabase/schema.sql` in the Dashboard SQL Editor. If you choose the CLI workflow, install the Supabase CLI first, then run these from the project root:

```bash
supabase login
supabase init
supabase link --project-ref ggumftjadfhofenealxs
```

Linking the project does not itself create the application tables; you must still apply the schema, for example through the Dashboard SQL Editor or a deliberate migration workflow. Do not put the database password into source files or commit it.

## Important security and accuracy notes
- The public form permits anonymous inserts; anyone can submit fake data. Add CAPTCHA/rate limiting or require user authentication before promoting the site widely.
- Candidate names are never returned by the public dashboard RPC. Do not add a public SELECT policy to the candidate table.
- The `Verified` label is self-reported, not independently verified.
- Candidate-submitted counts and cutoff estimates are not official recruitment results. Don't infer official UR migration or final selection from this survey alone.
- Excel/CSV import is local-only and does not upload spreadsheet rows to Supabase. PDF/CSV export reports the current dashboard view.
- A successful build/deployment and live database connection must be verified in your own accounts; this package has not been deployed on your behalf.
