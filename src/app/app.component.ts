import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { environment } from '../environments/environment';

type Post = 'TGT CS' | 'PGT CS';
type Category = 'UR' | 'OBC-NCL' | 'SC' | 'ST' | 'EWS';
interface CandidateSubmission {
  candidate_name: string; post_applied: Post; category: Category;
  tier1_qualified: boolean; tier1_category: Category | null; tier2_score: number;
  relaxation_used: 'Yes' | 'No' | 'Prefer not to say'; score_type: 'Verified' | 'Estimated';
}
interface CategoryStat {
  post_applied: string; category: string; candidate_count: number;
  average_score: number | null; highest_score: number | null;
  score_90_plus: number; score_85_plus: number; score_80_plus: number;
}
interface Dashboard {
  total_submissions: number; score_90_plus: number; score_85_plus: number;
  score_80_plus: number; average_score: number | null; highest_score: number | null;
  by_post_category: CategoryStat[];
}
interface ImportedCandidate {
  post: string; category: string; score: number; scoreType: string; sourceRow: number;
}
interface Metric {
  total: number; avg: number | null; highest: number | null;
  score90: number; score85: number; score80: number;
}
interface CategoryView extends CategoryStat { shared_count: number; imported_count: number; }

@Component({
  selector: 'app-root', standalone: true, imports: [CommonModule, FormsModule],
  template: `
  <header class="gov-header">
    <div class="brand-mark" aria-hidden="true">MS</div>
    <div class="brand-copy"><div class="eyebrow">INDEPENDENT CANDIDATE ANALYSIS PORTAL</div><h1>EMRS MeritScope</h1><p>TGT / PGT Computer Science · Tier 2 score insights</p></div>
    <div class="header-tag">UNOFFICIAL TOOL</div>
  </header>
  <nav class="nav"><a href="#dashboard">Dashboard</a><a href="#submit">Submit score</a><a href="#data">Category analysis</a><a href="#reports">Reports</a></nav>
  <main class="page-shell">
    <section class="notice"><strong>Important:</strong> This is an independent, candidate-submitted analysis tool and is not affiliated with NESTS/EMRS. Figures are survey insights, not official merit lists or cutoffs. Do not submit sensitive identity numbers or certificate scans.</section>
    <section id="dashboard" class="section-heading"><div><div class="eyebrow green">OVERVIEW · BUSINESS INTELLIGENCE</div><h2>Candidate merit dashboard</h2><p>Combined shared submissions and the currently imported spreadsheet.</p></div><button class="btn btn-outline" (click)="refreshDashboard()" [disabled]="loading">{{ loading ? 'Refreshing…' : '↻ Refresh shared data' }}</button></section>
    <div class="source-strip"><span class="source-dot shared-dot"></span> Shared database <strong>{{ shared.total }}</strong><span class="source-dot imported-dot"></span> Imported file <strong>{{ importedCandidates.length }}</strong><span class="source-note">Imported file is local to this browser session.</span></div>
    <div class="stats-grid">
      <article class="stat-card"><span>Combined candidates</span><strong>{{ combined.total }}</strong><small>{{ shared.total }} shared + {{ importedCandidates.length }} imported</small></article>
      <article class="stat-card"><span>Scored 90+</span><strong>{{ combined.score90 }}</strong><small>{{ percent(combined.score90) }} of combined scores</small></article>
      <article class="stat-card"><span>Scored 85+</span><strong>{{ combined.score85 }}</strong><small>{{ percent(combined.score85) }} of combined scores</small></article>
      <article class="stat-card"><span>Scored 80+</span><strong>{{ combined.score80 }}</strong><small>{{ percent(combined.score80) }} of combined scores</small></article>
      <article class="stat-card"><span>Combined average</span><strong>{{ combined.avg === null ? '—' : combined.avg.toFixed(2) }}</strong><small>Weighted across all valid scores</small></article>
      <article class="stat-card"><span>Highest score</span><strong>{{ combined.highest === null ? '—' : combined.highest.toFixed(2) }}</strong><small>Candidate-reported</small></article>
    </div>
    <div *ngIf="!isConfigured" class="warning"><strong>Database setup pending.</strong> Configure the Supabase publishable key in <code>src/environments/environment.ts</code> and run <code>supabase/schema.sql</code>. Local imports can still be analysed.</div>
    <div *ngIf="statusMessage" class="status" [class.error]="statusIsError" role="status">{{ statusMessage }}</div>

    <section class="bi-grid">
      <article class="panel chart-panel"><div class="panel-title"><div><div class="eyebrow green">SCORE DISTRIBUTION</div><h2>Score threshold coverage</h2><p>Counts include both sources; threshold bars overlap by design.</p></div></div>
        <div class="chart-bars">
          <div class="chart-row" *ngFor="let b of thresholdBars"><div class="chart-label">{{ b.label }}</div><div class="chart-track"><div class="chart-fill" [class]="b.className" [style.width.%]="barPercent(b.value, combined.total)"></div></div><strong>{{ b.value }}</strong><span class="chart-pct">{{ percent(b.value) }}</span></div>
        </div><p class="chart-footnote">Threshold counts are cumulative: every 90+ score is also counted in 85+ and 80+.</p>
      </article>
      <article class="panel chart-panel"><div class="panel-title"><div><div class="eyebrow green">DATA COVERAGE</div><h2>Where the data comes from</h2><p>Combined analysis uses two distinct sources.</p></div></div>
        <div class="source-chart">
          <div class="source-chart-item"><div class="source-chart-head"><span><i class="legend-dot shared-dot"></i> Shared submissions</span><strong>{{ shared.total }}</strong></div><div class="chart-track"><div class="chart-fill shared-fill" [style.width.%]="barPercent(shared.total, combined.total)"></div></div></div>
          <div class="source-chart-item"><div class="source-chart-head"><span><i class="legend-dot imported-dot"></i> Imported rows</span><strong>{{ importedCandidates.length }}</strong></div><div class="chart-track"><div class="chart-fill imported-fill" [style.width.%]="barPercent(importedCandidates.length, combined.total)"></div></div></div>
          <div class="mini-metrics"><div><span>Imported in this session</span><strong>{{ importedCandidates.length }}</strong></div><div><span>Categories recognised</span><strong>{{ recognisedImportedCount }}</strong></div><div><span>Needs category/post review</span><strong>{{ reviewImportedCount }}</strong></div></div>
        </div>
      </article>
    </section>

    <section id="submit" class="content-grid">
      <article class="panel form-panel"><div class="panel-title"><div><div class="eyebrow green">CANDIDATE FORM</div><h2>Submit your details</h2><p>Use the score type honestly. A name or alias is optional.</p></div><span class="pill">Public form</span></div>
        <form (ngSubmit)="submitCandidate()" #candidateForm="ngForm">
          <label>Candidate name <span class="muted">(optional alias allowed)</span><input name="candidate_name" [(ngModel)]="form.candidate_name" maxlength="100" placeholder="Enter display name" /></label>
          <div class="field-row"><label>Post applied for<select name="post_applied" [(ngModel)]="form.post_applied" required><option value="TGT CS">TGT Computer Science</option><option value="PGT CS">PGT Computer Science</option></select></label>
          <label>Application category<select name="category" [(ngModel)]="form.category" required><option *ngFor="let c of categories" [value]="c">{{ c }}</option></select></label></div>
          <div class="field-row"><label>Tier 1 qualified?<select name="tier1_qualified" [(ngModel)]="form.tier1_qualified" required><option [ngValue]="true">Yes</option><option [ngValue]="false">No</option></select></label>
          <label>Tier 1 qualification category<select name="tier1_category" [(ngModel)]="form.tier1_category"><option [ngValue]="null">Unknown / not applicable</option><option *ngFor="let c of categories" [ngValue]="c">{{ c }}</option></select></label></div>
          <div class="field-row"><label>Tier 2 score <span class="muted">(out of 100)</span><input type="number" name="tier2_score" [(ngModel)]="form.tier2_score" min="0" max="100" step="0.01" required placeholder="e.g. 86.50" /></label>
          <label>Score status<select name="score_type" [(ngModel)]="form.score_type"><option value="Estimated">Estimated / self-reported</option><option value="Verified">Verified against official source</option></select></label></div>
          <label>Used age or other category-specific relaxation?<select name="relaxation_used" [(ngModel)]="form.relaxation_used"><option value="Prefer not to say">Prefer not to say</option><option value="Yes">Yes</option><option value="No">No</option></select></label>
          <label class="consent"><input type="checkbox" name="consent" [(ngModel)]="consent" required /> I understand this is a voluntary, unofficial survey and my submission may be included in aggregated statistics.</label>
          <button class="btn btn-primary full" type="submit" [disabled]="submitting || !candidateForm.valid || !consent">{{ submitting ? 'Submitting…' : 'Submit candidate response' }}</button>
          <p class="form-footnote">Never enter Aadhaar, phone number, certificate number, address or passwords.</p>
        </form>
      </article>
      <aside class="panel info-panel"><div class="eyebrow green">HOW IT WORKS</div><h2>One combined view</h2><ol><li>Candidate submissions are stored in Supabase.</li><li>Import a spreadsheet to add its rows to the current combined view.</li><li>Category and score charts update from both sources.</li></ol><div class="mini-callout"><strong>Privacy by design</strong><p>The public dashboard should expose aggregate statistics only, never candidate names.</p></div><div class="divider"></div><h3>Score bands</h3><div class="band"><span>90 and above</span><strong>{{ combined.score90 }}</strong></div><div class="bar"><span [style.width.%]="barPercent(combined.score90, combined.total)"></span></div><div class="band"><span>85–89.99</span><strong>{{ Math.max(0, combined.score85 - combined.score90) }}</strong></div><div class="bar"><span [style.width.%]="barPercent(Math.max(0, combined.score85 - combined.score90), combined.total)"></span></div><div class="band"><span>80–84.99</span><strong>{{ Math.max(0, combined.score80 - combined.score85) }}</strong></div><div class="bar"><span [style.width.%]="barPercent(Math.max(0, combined.score80 - combined.score85), combined.total)"></span></div></aside>
    </section>

    <section id="data" class="panel table-panel"><div class="panel-title"><div><div class="eyebrow green">BREAKDOWN</div><h2>Category-wise analysis</h2><p>Shared submissions plus imported rows, grouped by post and category.</p></div><label class="compact-select">Post filter<select [(ngModel)]="postFilter" name="postFilter"><option value="All">All posts</option><option value="TGT CS">TGT CS</option><option value="PGT CS">PGT CS</option><option value="Unknown">Unknown post</option></select></label></div>
      <div class="table-wrap"><table><thead><tr><th>Post</th><th>Category</th><th>Combined</th><th>Shared</th><th>Imported</th><th>Average</th><th>Highest</th><th>90+</th><th>85+</th><th>80+</th></tr></thead><tbody><tr *ngFor="let row of filteredStats"><td>{{ row.post_applied }}</td><td><span class="category-tag" [class.unknown-tag]="row.category==='Unknown'">{{ row.category }}</span></td><td><strong>{{ row.candidate_count }}</strong></td><td>{{ row.shared_count }}</td><td>{{ row.imported_count }}</td><td>{{ row.average_score === null ? '—' : row.average_score.toFixed(2) }}</td><td>{{ row.highest_score === null ? '—' : row.highest_score.toFixed(2) }}</td><td>{{ row.score_90_plus }}</td><td>{{ row.score_85_plus }}</td><td>{{ row.score_80_plus }}</td></tr><tr *ngIf="filteredStats.length===0"><td colspan="10" class="empty">No data yet. Submit a response or import a report file.</td></tr></tbody></table></div>
    </section>
    <section class="bi-grid">
      <article class="panel chart-panel"><div class="panel-title"><div><div class="eyebrow green">CATEGORY COMPARISON</div><h2>Average score by category</h2><p>Combined data; categories without scores are omitted.</p></div></div>
        <div class="chart-bars"><div class="chart-row" *ngFor="let row of categoryAverageBars"><div class="chart-label">{{ row.label }}</div><div class="chart-track"><div class="chart-fill average-fill" [style.width.%]="barPercent(row.value, 100)"></div></div><strong>{{ row.value.toFixed(2) }}</strong></div><div *ngIf="categoryAverageBars.length===0" class="empty">Import or submit scores to display this chart.</div></div>
      </article>
      <article class="panel chart-panel"><div class="panel-title"><div><div class="eyebrow green">POST COMPARISON</div><h2>TGT vs PGT</h2><p>Combined count and average score by post.</p></div></div>
        <div *ngFor="let row of postMetrics" class="post-metric"><div class="source-chart-head"><span>{{ row.label }}</span><strong>{{ row.total }} candidates</strong></div><div class="chart-track"><div class="chart-fill average-fill" [style.width.%]="barPercent(row.total, combined.total)"></div></div><p>Average score: <strong>{{ row.avg === null ? '—' : row.avg.toFixed(2) }}</strong></p></div>
      </article>
    </section>

    <section id="admin-import" class="panel admin-import-panel"><div class="panel-title"><div><div class="eyebrow green">RESTRICTED ADMIN TOOL</div><h2>Import merit list to shared database</h2><p>Only an account explicitly allow-listed in Supabase can use this import. Imported candidate names are never returned by the public dashboard.</p></div><span class="pill">Admin only</span></div>
      <div *ngIf="!adminSignedIn" class="admin-login">
        <label>Admin email<input type="email" name="adminEmail" [(ngModel)]="adminEmail" autocomplete="username" placeholder="Admin email" /></label>
        <label>Admin password<input type="password" name="adminPassword" [(ngModel)]="adminPassword" autocomplete="current-password" placeholder="Supabase Auth password" /></label>
        <button class="btn btn-outline" (click)="adminSignIn()" [disabled]="adminBusy || !adminEmail.trim() || !adminPassword">{{ adminBusy ? 'Checking admin access…' : 'Sign in as admin' }}</button>
        <p class="form-footnote">Create the account in Supabase Authentication, then add its user UUID to public.admin_users using the SQL instructions in the README. Sign-in alone does not grant admin access.</p>
      </div>
      <div *ngIf="adminSignedIn" class="admin-import-controls">
        <div class="admin-session"><span>Signed in as <strong>{{ adminEmail }}</strong></span><button class="btn btn-outline" (click)="adminSignOut()" [disabled]="adminBusy">Sign out</button></div>
        <label class="file-drop">Choose TGT CS merit-list CSV / Excel<input type="file" accept=".csv,.xlsx,.xls" (change)="onAdminFileSelected($event)" /><small>{{ adminFile?.name || 'Expected columns: Rank, Name, Category, Marks, Age Relaxed, DV Status, Other Govt Job' }}</small></label>
        <div class="admin-confirm"><label><input type="checkbox" [(ngModel)]="adminImportConfirmed" name="adminImportConfirmed" /> I confirm this is the TGT Computer Science list, marks are out of 100, and I am authorised to import these records.</label></div>
        <button class="btn btn-primary" (click)="importToSupabase()" [disabled]="adminBusy || !adminFile || !adminImportConfirmed">{{ adminBusy ? 'Validating / importing…' : 'Validate and import into Supabase' }}</button>
        <p class="form-footnote">Import is idempotent by merit-list rank: existing import keys are skipped rather than duplicated. This operation stores the supplied candidate name and list metadata in the private table; public analytics expose aggregates only.</p>
      </div>
      <div *ngIf="adminImportSummary" class="import-summary">{{ adminImportSummary }}</div>
    </section>
    <section id="reports" class="panel reports-panel"><div class="panel-title"><div><div class="eyebrow green">DATA TOOLS</div><h2>Import & export reports</h2><p>Import a CSV/Excel file. Each import replaces the prior local import so it isn't accidentally counted twice.</p></div></div>
      <div class="report-actions"><label class="btn btn-outline upload-btn">Import Excel / CSV<input type="file" accept=".xlsx,.xls,.csv" (change)="importFile($event)" /></label><button class="btn btn-outline" (click)="clearImport()" [disabled]="!importedCandidates.length">Clear imported data</button><button class="btn btn-outline" (click)="downloadCsv()">Download combined CSV</button><button class="btn btn-primary" (click)="exportPdf()">Export combined PDF</button></div>
      <div *ngIf="importSummary" class="import-summary">{{ importSummary }}</div><p class="form-footnote">Supported score headers include Tier 2 Score, Tier2 Score, Score, Marks, and Total Marks. Post/category aliases are normalised where possible. Imported rows remain in this browser session only and are not uploaded to Supabase.</p>
    </section>
    <footer>EMRS MeritScope · Independent candidate analysis · Not an official recruitment portal</footer>
  </main>
  `,
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  readonly categories: Category[] = ['UR', 'OBC-NCL', 'SC', 'ST', 'EWS'];
  readonly Math = Math;
  private supabase: SupabaseClient | null = null;
  private sharedDashboard: Dashboard = { total_submissions: 0, score_90_plus: 0, score_85_plus: 0, score_80_plus: 0, average_score: null, highest_score: null, by_post_category: [] };
  importedCandidates: ImportedCandidate[] = [];
  adminEmail = ''; adminPassword = ''; adminBusy = false; adminSignedIn = false; adminImportConfirmed = false;
  adminFile: File | null = null; adminImportSummary = ''; private adminUserId: string | null = null;
  get isConfigured(): boolean { return !!this.supabase; }
  loading = false; submitting = false; consent = false; statusMessage = ''; statusIsError = false; importSummary = ''; postFilter = 'All';
  form: CandidateSubmission = { candidate_name: '', post_applied: 'TGT CS', category: 'OBC-NCL', tier1_qualified: true, tier1_category: null, tier2_score: 0, relaxation_used: 'Prefer not to say', score_type: 'Estimated' };

  constructor() {
    const key = environment.supabaseKey.trim();
    if (environment.supabaseUrl.startsWith('https://') && key && !key.includes('REPLACE_WITH')) this.supabase = createClient(environment.supabaseUrl, key);
  }
  ngOnInit(): void { if (this.supabase) void this.refreshDashboard(); }
  get shared(): Metric {
    const d = this.sharedDashboard;
    return { total: Number(d.total_submissions || 0), avg: d.average_score == null ? null : Number(d.average_score), highest: d.highest_score == null ? null : Number(d.highest_score), score90: Number(d.score_90_plus || 0), score85: Number(d.score_85_plus || 0), score80: Number(d.score_80_plus || 0) };
  }
  get importedMetric(): Metric { return this.metricFor(this.importedCandidates.map(x => x.score)); }
  get combined(): Metric {
    const a = this.shared, b = this.importedMetric, total = a.total + b.total;
    const weightedSum = (a.avg ?? 0) * a.total + (b.avg ?? 0) * b.total;
    const highs = [a.highest, b.highest].filter((x): x is number => x !== null);
    return { total, avg: total ? Math.round(weightedSum / total * 100) / 100 : null, highest: highs.length ? Math.max(...highs) : null, score90: a.score90 + b.score90, score85: a.score85 + b.score85, score80: a.score80 + b.score80 };
  }
  get dashboard(): Dashboard {
    return { total_submissions: this.combined.total, score_90_plus: this.combined.score90, score_85_plus: this.combined.score85, score_80_plus: this.combined.score80, average_score: this.combined.avg, highest_score: this.combined.highest, by_post_category: this.combinedStats };
  }
  get combinedStats(): CategoryView[] {
    const map = new Map<string, CategoryView>();
    for (const row of this.sharedDashboard.by_post_category ?? []) {
      const post = this.normalisePost(row.post_applied) ?? String(row.post_applied || 'Unknown');
      const category = this.normaliseCategory(row.category) ?? 'Unknown';
      const key = this.groupKey(post, category);
      map.set(key, { post_applied: post, category, candidate_count: Number(row.candidate_count || 0), average_score: row.average_score == null ? null : Number(row.average_score), highest_score: row.highest_score == null ? null : Number(row.highest_score), score_90_plus: Number(row.score_90_plus || 0), score_85_plus: Number(row.score_85_plus || 0), score_80_plus: Number(row.score_80_plus || 0), shared_count: Number(row.candidate_count || 0), imported_count: 0 });
    }
    const importedGroups = new Map<string, number[]>();
    for (const row of this.importedCandidates) {
      const key = this.groupKey(row.post, row.category);
      const values = importedGroups.get(key) ?? []; values.push(row.score); importedGroups.set(key, values);
    }
    for (const [key, scores] of importedGroups) {
      const existing = map.get(key);
      const importMetric = this.metricFor(scores);
      if (existing) {
        const sharedSum = (existing.average_score ?? 0) * existing.shared_count;
        const total = existing.shared_count + scores.length;
        existing.candidate_count = total; existing.imported_count = scores.length;
        existing.average_score = total ? Math.round((sharedSum + scores.reduce((s, n) => s + n, 0)) / total * 100) / 100 : null;
        const highs = [existing.highest_score, importMetric.highest].filter((x): x is number => x !== null);
        existing.highest_score = highs.length ? Math.max(...highs) : null;
        existing.score_90_plus += importMetric.score90; existing.score_85_plus += importMetric.score85; existing.score_80_plus += importMetric.score80;
      } else {
        map.set(key, { post_applied: key.split('||')[0], category: key.split('||')[1], candidate_count: scores.length, average_score: importMetric.avg, highest_score: importMetric.highest, score_90_plus: importMetric.score90, score_85_plus: importMetric.score85, score_80_plus: importMetric.score80, shared_count: 0, imported_count: scores.length });
      }
    }
    return [...map.values()].sort((a,b) => a.post_applied.localeCompare(b.post_applied) || a.category.localeCompare(b.category));
  }
  get filteredStats(): CategoryView[] { return this.combinedStats.filter(r => this.postFilter === 'All' || r.post_applied === this.postFilter); }
  get thresholdBars(): { label: string; value: number; className: string }[] { return [{label:'90+ points',value:this.combined.score90,className:'score90-fill'},{label:'85+ points',value:this.combined.score85,className:'score85-fill'},{label:'80+ points',value:this.combined.score80,className:'score80-fill'}]; }
  get categoryAverageBars(): {label:string;value:number}[] {
    const groups = new Map<string, number[]>();
    for (const r of this.combinedStats) if (r.category !== 'Unknown' && r.average_score !== null) {
      const arr = groups.get(r.category) ?? []; // Weight category means by row count, including the shared count.
      arr.push(...Array(Math.min(r.candidate_count, 5000)).fill(Number(r.average_score))); groups.set(r.category, arr);
    }
    return [...groups.entries()].map(([label, values]) => ({label,value:Math.round(values.reduce((s,n)=>s+n,0)/values.length*100)/100})).sort((a,b)=>b.value-a.value);
  }
  get postMetrics(): {label:string;total:number;avg:number|null}[] {
    return (['TGT CS','PGT CS'] as string[]).map(label => {
      const rows = this.combinedStats.filter(r => r.post_applied === label), total = rows.reduce((s,r)=>s+r.candidate_count,0);
      const scores = rows.reduce((s,r)=>s+(r.average_score ?? 0)*r.candidate_count,0);
      return {label,total,avg:total?Math.round(scores/total*100)/100:null};
    });
  }
  get recognisedImportedCount(): number { return this.importedCandidates.filter(r => r.category !== 'Unknown' && r.post !== 'Unknown').length; }
  get reviewImportedCount(): number { return this.importedCandidates.length - this.recognisedImportedCount; }
  percent(n: number): string { return this.combined.total ? `${Math.round(n / this.combined.total * 100)}%` : '0%'; }
  barPercent(n: number, total: number): number { return total > 0 ? Math.max(0, Math.min(100, n / total * 100)) : 0; }

  async refreshDashboard(): Promise<void> {
    if (!this.supabase) { this.setStatus('Supabase is not configured. Imported data will still be analysed locally.', true); return; }
    this.loading = true;
    const { data, error } = await this.supabase.rpc('get_public_dashboard');
    this.loading = false;
    if (error) { this.setStatus(`Shared dashboard could not load: ${error.message}. Check that supabase/schema.sql has been run in the configured project.`, true); return; }
    if (data) {
      const d = data as Partial<Dashboard>;
      this.sharedDashboard = { total_submissions:Number(d.total_submissions||0), score_90_plus:Number(d.score_90_plus||0), score_85_plus:Number(d.score_85_plus||0), score_80_plus:Number(d.score_80_plus||0), average_score:d.average_score==null?null:Number(d.average_score), highest_score:d.highest_score==null?null:Number(d.highest_score), by_post_category:Array.isArray(d.by_post_category)?d.by_post_category:[] };
      this.setStatus('Shared database refreshed. Combined analytics include the current imported file.', false);
    }
  }
  async submitCandidate(): Promise<void> {
    if (!this.supabase) { this.setStatus('Supabase is not configured yet. Imported data can still be analysed locally.', true); return; }
    const score = Number(this.form.tier2_score);
    if (!Number.isFinite(score) || score < 0 || score > 100) { this.setStatus('Enter a Tier 2 score between 0 and 100. Confirm the official maximum before launch.', true); return; }
    this.submitting = true; this.statusMessage = '';
    const payload = { ...this.form, candidate_name: this.form.candidate_name.trim() || 'Anonymous candidate', tier2_score: score };
    const { error } = await this.supabase.from('candidate_submissions').insert(payload);
    this.submitting = false;
    if (error) { this.setStatus(`Submission failed: ${error.message}`, true); return; }
    this.setStatus('Response submitted successfully. Shared totals will refresh now.', false);
    this.form = { candidate_name: '', post_applied: 'TGT CS', category: 'OBC-NCL', tier1_qualified: true, tier1_category: null, tier2_score: 0, relaxation_used: 'Prefer not to say', score_type: 'Estimated' };
    this.consent = false;
    await this.refreshDashboard();
  }
  async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement, file = input.files?.[0]; if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type:'array', cellDates:true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error('No worksheet found.');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval:null, raw:false });
      const parsed: ImportedCandidate[] = []; let invalidScores = 0;
      rows.forEach((row, index) => {
        const fields = new Map<string, unknown>(); Object.entries(row).forEach(([k,v]) => fields.set(this.normaliseHeader(k), v));
        const scoreRaw = this.firstField(fields, ['tier2score','tier2marks','tier2totalmarks','score','marks','totalmarks','obtainedmarks','finalscore','tier2']);
        const score = this.parseScore(scoreRaw);
        if (score === null || score < 0 || score > 100) { invalidScores++; return; }
        const postRaw = this.firstField(fields, ['postapplied','post','appliedpost','postname','exam','position','designation']);
        const categoryRaw = this.firstField(fields, ['category','applicationcategory','socialcategory','reservationcategory','candidatecategory','cat']);
        const typeRaw = this.firstField(fields, ['scoretype','scorestatus','verificationstatus']);
        parsed.push({ post:this.normalisePost(postRaw) ?? 'Unknown', category:this.normaliseCategory(categoryRaw) ?? 'Unknown', score, scoreType:this.normaliseHeader(String(typeRaw ?? '')).includes('verif')?'Verified':'Estimated', sourceRow:index+2 });
      });
      this.importedCandidates = parsed;
      const unknownCategory = parsed.filter(r=>r.category==='Unknown').length, unknownPost = parsed.filter(r=>r.post==='Unknown').length;
      const m = this.importedMetric;
      this.importSummary = `${file.name}: ${rows.length} spreadsheet rows read; ${parsed.length} valid scores included; ${invalidScores} rows skipped for missing/invalid score or score outside 0–100. ${unknownCategory} valid-score rows have an unrecognised/missing category; ${unknownPost} have an unrecognised/missing post. Imported file replaces the previous import. Imported score bands: 90+ ${m.score90}, 85+ ${m.score85}, 80+ ${m.score80}. Review the category/post columns if rows appear under Unknown.`;
      this.setStatus(`Imported ${parsed.length} valid score rows. Dashboard and charts now combine them with shared submissions.`, false);
    } catch (error) { this.setStatus(`Could not read this file: ${error instanceof Error ? error.message : 'invalid spreadsheet'}. Please use a valid Excel or CSV file.`, true); }
    input.value = '';
  }
  clearImport(): void { this.importedCandidates=[]; this.importSummary='Imported rows cleared. The dashboard now reflects shared Supabase data only.'; this.setStatus(this.importSummary,false); }
  downloadCsv(): void {
    const rows = [['Post','Category','Combined count','Shared count','Imported count','Average score','Highest score','90+','85+','80+'], ...this.filteredStats.map(r => [r.post_applied,r.category,r.candidate_count,r.shared_count,r.imported_count,r.average_score,r.highest_score,r.score_90_plus,r.score_85_plus,r.score_80_plus])];
    const csv = rows.map(row => row.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\r\n');
    this.downloadBlob(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8;'}),'emrs-meritscope-combined-report.csv');
  }
  exportPdf(): void {
    const pdf = new jsPDF({orientation:'landscape'}); let y=17;
    pdf.setFontSize(17); pdf.text('EMRS MeritScope — Combined Candidate Score Analysis',14,y); y+=8;
    pdf.setFontSize(9); pdf.text('Unofficial candidate-submitted analysis; not an official merit list or cutoff.',14,y); y+=9;
    pdf.setFontSize(10); pdf.text(`Combined: ${this.combined.total} | Shared: ${this.shared.total} | Imported: ${this.importedCandidates.length} | 90+: ${this.combined.score90} | 85+: ${this.combined.score85} | 80+: ${this.combined.score80} | Avg: ${this.combined.avg??'—'} | Highest: ${this.combined.highest??'—'}`,14,y); y+=10;
    pdf.setFontSize(8); pdf.text('Post',12,y); pdf.text('Category',40,y); pdf.text('Total',70,y); pdf.text('Shared',88,y); pdf.text('Imported',108,y); pdf.text('Average',132,y); pdf.text('Highest',154,y); pdf.text('90+',178,y); pdf.text('85+',194,y); pdf.text('80+',210,y); y+=6;
    for (const r of this.filteredStats) { if(y>185){pdf.addPage();y=16;} pdf.text(r.post_applied,12,y);pdf.text(r.category,40,y);pdf.text(String(r.candidate_count),70,y);pdf.text(String(r.shared_count),88,y);pdf.text(String(r.imported_count),108,y);pdf.text(String(r.average_score??'—'),132,y);pdf.text(String(r.highest_score??'—'),154,y);pdf.text(String(r.score_90_plus),178,y);pdf.text(String(r.score_85_plus),194,y);pdf.text(String(r.score_80_plus),210,y);y+=6; }
    pdf.save('emrs-meritscope-combined-report.pdf');
  }
  async adminSignIn(): Promise<void> {
    if (!this.supabase) { this.adminImportSummary='Supabase is not configured.'; return; }
    this.adminBusy=true; this.adminImportSummary='';
    const { data, error } = await this.supabase.auth.signInWithPassword({ email:this.adminEmail.trim(), password:this.adminPassword });
    this.adminBusy=false;
    if (error || !data.user) { this.adminImportSummary='Sign-in failed. Check the email/password and Supabase Auth settings.'; return; }
    const { data: allowlisted, error: allowError } = await this.supabase.from('admin_users').select('user_id').eq('user_id',data.user.id).maybeSingle();
    if (allowError || !allowlisted) {
      await this.supabase.auth.signOut(); this.adminSignedIn=false; this.adminUserId=null;
      this.adminImportSummary='This account is not allow-listed as an importer. Ask the project owner to add this Auth user UUID to public.admin_users.';
      return;
    }
    this.adminSignedIn=true; this.adminUserId=data.user.id; this.adminPassword='';
    this.adminImportSummary='Admin access verified. Choose the TGT CS merit-list file to validate and import.';
  }
  async adminSignOut(): Promise<void> {
    if (this.supabase) await this.supabase.auth.signOut();
    this.adminSignedIn=false; this.adminUserId=null; this.adminFile=null; this.adminImportConfirmed=false;
    this.adminImportSummary='Signed out from admin import.';
  }
  onAdminFileSelected(event: Event): void {
    const input=event.target as HTMLInputElement; this.adminFile=input.files?.[0] ?? null; this.adminImportSummary=''; input.value='';
  }
  async importToSupabase(): Promise<void> {
    if (!this.supabase || !this.adminSignedIn || !this.adminUserId || !this.adminFile || !this.adminImportConfirmed) {
      this.adminImportSummary='Sign in with an allow-listed admin account, select the CSV, and confirm the import.'; return;
    }
    this.adminBusy=true; this.adminImportSummary='';
    let parsed: Array<{import_key:string;candidate_rank:number;candidate_name:string;category:string;tier2_score:number;relaxation_used:string;dv_status:string;other_govt_job:string;post_applied:string}> = [];
    let invalid=0; const filename=this.adminFile.name;
    try {
      const workbook=XLSX.read(await this.adminFile.arrayBuffer(),{type:'array'});
      const sheet=workbook.Sheets[workbook.SheetNames[0]];
      if(!sheet) throw new Error('No worksheet found.');
      const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:null,raw:false});
      rows.forEach((row,index)=>{
        const fields=new Map<string,unknown>(); Object.entries(row).forEach(([k,v])=>fields.set(this.normaliseHeader(k),v));
        const rank=Number(this.firstField(fields,['rank','rankno','meritrank']));
        const name=String(this.firstField(fields,['name','candidatename','candidate','fullname'])??'').trim();
        const category=this.normaliseCategory(this.firstField(fields,['category','applicationcategory','socialcategory','reservationcategory','cat']));
        const score=this.parseScore(this.firstField(fields,['marks','score','tier2score','tier2marks','totalmarks']));
        if(!Number.isInteger(rank)||rank<1||!name||name.length>100||!category||score===null||score<0||score>100){invalid++;return;}
        const age=String(this.firstField(fields,['agerelaxed','agerelaxation','relaxationused'])??'').trim().toLowerCase();
        const relaxation=age==='yes'||age==='true'?'Yes':age==='no'||age==='false'?'No':'Prefer not to say';
        const dv=String(this.firstField(fields,['dvstatus','documentverificationstatus'])??'Not Specified').trim().slice(0,100)||'Not Specified';
        const other=String(this.firstField(fields,['othergovtjob','othergovernmentjob','othergovtservice'])??'Not Specified').trim().slice(0,150)||'Not Specified';
        parsed.push({import_key:'emrs-tgt-cs-merit-2026-rank-'+rank,candidate_rank:rank,candidate_name:name,category,tier2_score:score,relaxation_used:relaxation,dv_status:dv,other_govt_job:other,post_applied:'TGT CS'});
      });
      if(!parsed.length) throw new Error('No valid rows found. Expected Rank, Name, Category and Marks; marks must be 0–100.');
      let inserted=0, skipped=0;
      for(let i=0;i<parsed.length;i+=100){
        const {data,error}=await this.supabase.rpc('admin_import_merit_list',{p_rows:parsed.slice(i,i+100)});
        if(error) throw new Error(error.message);
        const result=data as {inserted?:number;skipped?:number;received?:number}|null;
        inserted+=Number(result?.inserted??0); skipped+=Number(result?.skipped??0);
      }
      this.importedCandidates=[];
      this.adminImportSummary=`Import finished for ${filename}: ${rows.length} spreadsheet rows read; ${parsed.length} valid rows sent; ${inserted} inserted; ${skipped} already-existing ranks skipped; ${invalid} invalid rows skipped. Existing records were not overwritten. Refreshing shared dashboard…`;
      await this.refreshDashboard();
      this.adminFile=null; this.adminImportConfirmed=false;
    } catch(error) {
      this.adminImportSummary=`Import stopped: ${error instanceof Error?error.message:'unknown error'}. If an earlier batch succeeded, re-running is safe: matching merit-list ranks are skipped.`;
    } finally { this.adminBusy=false; }
  }
  private metricFor(scores: number[]): Metric {
    const total=scores.length; return {total,avg:total?Math.round(scores.reduce((s,n)=>s+n,0)/total*100)/100:null,highest:total?Math.max(...scores):null,score90:scores.filter(n=>n>=90).length,score85:scores.filter(n=>n>=85).length,score80:scores.filter(n=>n>=80).length};
  }
  private parseScore(value: unknown): number | null {
    if(value===null||value===undefined||String(value).trim()==='') return null;
    const n=Number(String(value).replace(/,/g,'').replace(/%$/,'').trim());
    return Number.isFinite(n)?n:null;
  }
  private normaliseHeader(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]/g,''); }
  private firstField(fields: Map<string,unknown>, keys: string[]): unknown { for(const key of keys) if(fields.has(key)) return fields.get(key); return null; }
  private normaliseCategory(value: unknown): string | null {
    const v=this.normaliseHeader(String(value??''));
    if(!v) return null;
    if(['ur','unreserved','general','gen','open','generalcategory'].includes(v)) return 'UR';
    if(['obc','obcncl','obcnoncreamlayer','noncreamlayerobc','backwardclass'].includes(v)) return 'OBC-NCL';
    if(['sc','scheduledcaste','scheduledcastes'].includes(v)) return 'SC';
    if(['st','scheduledtribe','scheduledtribes'].includes(v)) return 'ST';
    if(['ews','economicallyweakersection','economicallyweakersections'].includes(v)) return 'EWS';
    return null;
  }
  private normalisePost(value: unknown): string | null {
    const v=this.normaliseHeader(String(value??''));
    if(!v) return null;
    if(v.includes('pgt') || v.includes('postgraduateteacher')) return 'PGT CS';
    if(v.includes('tgt') || v.includes('trainedgraduateteacher')) return 'TGT CS';
    if((v.includes('computer')||v.includes('cs')) && (v.includes('pg')||v.includes('postgraduate'))) return 'PGT CS';
    if(v==='pgtcs'||v==='pgtcomputerscience') return 'PGT CS';
    if(v==='tgtcs'||v==='tgtcomputerscience') return 'TGT CS';
    return null;
  }
  private groupKey(post: string, category: string): string { return `${post}||${category}`; }
  private setStatus(message: string, isError: boolean): void { this.statusMessage=message; this.statusIsError=isError; }
  private downloadBlob(blob: Blob, name: string): void { const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url); }
}
