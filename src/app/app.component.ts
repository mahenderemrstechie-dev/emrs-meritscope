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
interface CategoryStat { post_applied: string; category: string; candidate_count: number; average_score: number; highest_score: number; score_90_plus: number; score_85_plus: number; score_80_plus: number; }
interface Dashboard { total_submissions: number; score_90_plus: number; score_85_plus: number; score_80_plus: number; average_score: number | null; highest_score: number | null; by_post_category: CategoryStat[]; }

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
    <section class="notice"><strong>Important:</strong> This is an independent, candidate-submitted analysis tool and is not affiliated with or endorsed by NESTS/EMRS. Figures are estimates, not official merit lists or cutoffs. Do not submit sensitive identity numbers or certificate scans.</section>
    <section id="dashboard" class="section-heading"><div><div class="eyebrow green">OVERVIEW</div><h2>Candidate merit dashboard</h2><p>Aggregated results from the shared database, when configured.</p></div><button class="btn btn-outline" (click)="refreshDashboard()" [disabled]="loading">{{ loading ? 'Refreshing…' : '↻ Refresh data' }}</button></section>
    <div class="stats-grid">
      <article class="stat-card"><span>Total submissions</span><strong>{{ dashboard.total_submissions }}</strong><small>All posts and categories</small></article>
      <article class="stat-card"><span>Scored 90+</span><strong>{{ dashboard.score_90_plus }}</strong><small>{{ percent(dashboard.score_90_plus) }} of submissions</small></article>
      <article class="stat-card"><span>Scored 85+</span><strong>{{ dashboard.score_85_plus }}</strong><small>{{ percent(dashboard.score_85_plus) }} of submissions</small></article>
      <article class="stat-card"><span>Scored 80+</span><strong>{{ dashboard.score_80_plus }}</strong><small>{{ percent(dashboard.score_80_plus) }} of submissions</small></article>
      <article class="stat-card"><span>Average score</span><strong>{{ dashboard.average_score ?? '—' }}</strong><small>Across submitted records</small></article>
      <article class="stat-card"><span>Highest score</span><strong>{{ dashboard.highest_score ?? '—' }}</strong><small>Candidate-reported</small></article>
    </div>
    <div *ngIf="!isConfigured" class="warning"><strong>Database setup pending.</strong> The site is ready for Supabase, but you must add your publishable key to <code>src/environments/environment.ts</code> and run <code>supabase/schema.sql</code> in Supabase SQL Editor. Until then, submissions are not shared.</div>
    <div *ngIf="statusMessage" class="status" [class.error]="statusIsError" role="status">{{ statusMessage }}</div>

    <section id="submit" class="content-grid">
      <article class="panel form-panel"><div class="panel-title"><div><div class="eyebrow green">CANDIDATE FORM</div><h2>Submit your details</h2><p>One response per candidate is recommended. Use the score type honestly.</p></div><span class="pill">Public form</span></div>
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
      <aside class="panel info-panel"><div class="eyebrow green">HOW IT WORKS</div><h2>One shared view</h2><ol><li>Candidate submits their score and category.</li><li>Supabase stores the response using database permissions.</li><li>The dashboard displays aggregate counts for everyone.</li></ol><div class="mini-callout"><strong>Privacy by design</strong><p>Public dashboard access returns aggregate statistics only; it does not list candidate names.</p></div><div class="divider"></div><h3>Score bands</h3><div class="band"><span>90 and above</span><strong>{{ dashboard.score_90_plus }}</strong></div><div class="bar"><span [style.width.%]="bandWidth(dashboard.score_90_plus)"></span></div><div class="band"><span>85–89.99</span><strong>{{ Math.max(0, dashboard.score_85_plus - dashboard.score_90_plus) }}</strong></div><div class="bar"><span [style.width.%]="bandWidth(Math.max(0, dashboard.score_85_plus - dashboard.score_90_plus))"></span></div><div class="band"><span>80–84.99</span><strong>{{ Math.max(0, dashboard.score_80_plus - dashboard.score_85_plus) }}</strong></div><div class="bar"><span [style.width.%]="bandWidth(Math.max(0, dashboard.score_80_plus - dashboard.score_85_plus))"></span></div></aside>
    </section>

    <section id="data" class="panel table-panel"><div class="panel-title"><div><div class="eyebrow green">BREAKDOWN</div><h2>Category-wise analysis</h2><p>Statistics grouped by post and candidate category.</p></div><label class="compact-select">Post filter<select [(ngModel)]="postFilter" name="postFilter"><option value="All">All posts</option><option value="TGT CS">TGT CS</option><option value="PGT CS">PGT CS</option></select></label></div>
      <div class="table-wrap"><table><thead><tr><th>Post</th><th>Category</th><th>Submissions</th><th>Average</th><th>Highest</th><th>90+</th><th>85+</th><th>80+</th></tr></thead><tbody><tr *ngFor="let row of filteredStats"><td>{{ row.post_applied }}</td><td><span class="category-tag">{{ row.category }}</span></td><td>{{ row.candidate_count }}</td><td>{{ row.average_score ?? '—' }}</td><td>{{ row.highest_score ?? '—' }}</td><td>{{ row.score_90_plus }}</td><td>{{ row.score_85_plus }}</td><td>{{ row.score_80_plus }}</td></tr><tr *ngIf="filteredStats.length===0"><td colspan="8" class="empty">No shared data yet. Submit a response or import a report file.</td></tr></tbody></table></div>
    </section>
    <section id="reports" class="panel reports-panel"><div class="panel-title"><div><div class="eyebrow green">DATA TOOLS</div><h2>Import & export reports</h2><p>Import Excel/CSV for local analysis or export the shared dashboard to PDF.</p></div></div><div class="report-actions"><label class="btn btn-outline upload-btn">Import Excel / CSV<input type="file" accept=".xlsx,.xls,.csv" (change)="importFile($event)" /></label><button class="btn btn-outline" (click)="downloadCsv()">Download category CSV</button><button class="btn btn-primary" (click)="exportPdf()">Export PDF report</button></div><div *ngIf="importSummary" class="import-summary">{{ importSummary }}</div><p class="form-footnote">Spreadsheet import is for analysis/reporting; it does not automatically upload imported rows to the shared database.</p></section>
    <footer>EMRS MeritScope · Independent candidate analysis · Not an official recruitment portal</footer>
  </main>
  `,
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  readonly categories: Category[] = ['UR', 'OBC-NCL', 'SC', 'ST', 'EWS'];
  readonly Math = Math;
  private supabase: SupabaseClient | null = null;
  get isConfigured(): boolean { return !!this.supabase; }
  loading = false; submitting = false; consent = false; statusMessage = ''; statusIsError = false; importSummary = ''; postFilter = 'All';
  dashboard: Dashboard = { total_submissions: 0, score_90_plus: 0, score_85_plus: 0, score_80_plus: 0, average_score: null, highest_score: null, by_post_category: [] };
  form: CandidateSubmission = { candidate_name: '', post_applied: 'TGT CS', category: 'OBC-NCL', tier1_qualified: true, tier1_category: null, tier2_score: 0, relaxation_used: 'Prefer not to say', score_type: 'Estimated' };

  constructor() {
    const key = environment.supabaseKey.trim();
    if (environment.supabaseUrl.startsWith('https://') && key && !key.includes('REPLACE_WITH')) {
      this.supabase = createClient(environment.supabaseUrl, key);
    }
  }
  ngOnInit(): void { if (this.supabase) void this.refreshDashboard(); }
  get filteredStats(): CategoryStat[] { return this.dashboard.by_post_category.filter(r => this.postFilter === 'All' || r.post_applied === this.postFilter); }
  percent(n: number): string { return this.dashboard.total_submissions ? `${Math.round(n / this.dashboard.total_submissions * 100)}%` : '0%'; }
  bandWidth(n: number): number { return this.dashboard.total_submissions ? Math.min(100, n / this.dashboard.total_submissions * 100) : 0; }
  async refreshDashboard(): Promise<void> {
    if (!this.supabase) { this.setStatus('Add your Supabase publishable key and run the SQL setup to enable shared dashboard data.', true); return; }
    this.loading = true;
    const { data, error } = await this.supabase.rpc('get_public_dashboard');
    this.loading = false;
    if (error) { this.setStatus(`Dashboard could not load: ${error.message}. Check that supabase/schema.sql has been run.`, true); return; }
    if (data) { this.dashboard = { ...this.dashboard, ...data, by_post_category: data.by_post_category ?? [] }; this.setStatus('Dashboard refreshed from shared Supabase data.', false); }
  }
  async submitCandidate(): Promise<void> {
    if (!this.supabase) { this.setStatus('Supabase is not configured yet. Complete the setup in README.md first.', true); return; }
    if (!Number.isFinite(Number(this.form.tier2_score)) || this.form.tier2_score < 0 || this.form.tier2_score > 100) { this.setStatus('Enter a Tier 2 score between 0 and 100. Update the maximum if the official exam scale differs.', true); return; }
    this.submitting = true; this.statusMessage = '';
    const payload = { ...this.form, candidate_name: this.form.candidate_name.trim() || 'Anonymous candidate', tier2_score: Number(this.form.tier2_score) };
    const { error } = await this.supabase.from('candidate_submissions').insert(payload);
    this.submitting = false;
    if (error) { this.setStatus(`Submission failed: ${error.message}`, true); return; }
    this.setStatus('Response submitted successfully. Thank you for contributing.', false);
    this.form = { candidate_name: '', post_applied: 'TGT CS', category: 'OBC-NCL', tier1_qualified: true, tier1_category: null, tier2_score: 0, relaxation_used: 'Prefer not to say', score_type: 'Estimated' };
    this.consent = false;
    await this.refreshDashboard();
  }
  async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return;
    try {
      const data = await file.arrayBuffer(); const workbook = XLSX.read(data, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]] ?? {});
      const scores = rows.map(r => Number(r['tier2_score'] ?? r['Tier 2 Score'] ?? r['Tier2 Score'] ?? r['Score'] ?? r['Marks'])).filter(n => Number.isFinite(n) && n >= 0);
      const count = scores.length;
      this.importSummary = `${file.name}: ${rows.length} rows read; ${count} usable score values found. ${count ? `90+: ${scores.filter(n => n >= 90).length}, 85+: ${scores.filter(n => n >= 85).length}, 80+: ${scores.filter(n => n >= 80).length}.` : 'Check column names: Tier 2 Score, Score or Marks.'} Imported file is analysed locally and was not uploaded.`;
      if (count) { this.dashboard = { ...this.dashboard, total_submissions: Math.max(this.dashboard.total_submissions, count), score_90_plus: scores.filter(n => n >= 90).length, score_85_plus: scores.filter(n => n >= 85).length, score_80_plus: scores.filter(n => n >= 80).length, average_score: Math.round(scores.reduce((a,b)=>a+b,0)/count*100)/100, highest_score: Math.max(...scores) }; }
    } catch { this.setStatus('Could not read the file. Please use a valid Excel or CSV file.', true); }
    input.value = '';
  }
  downloadCsv(): void {
    const rows = [['Post','Category','Submissions','Average score','Highest score','90+','85+','80+'], ...this.filteredStats.map(r => [r.post_applied,r.category,r.candidate_count,r.average_score,r.highest_score,r.score_90_plus,r.score_85_plus,r.score_80_plus])];
    const csv = rows.map(row => row.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\r\n');
    this.downloadBlob(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' }), 'emrs-meritscope-category-report.csv');
  }
  exportPdf(): void {
    const pdf = new jsPDF({ orientation: 'landscape' }); let y = 18;
    pdf.setFontSize(18); pdf.text('EMRS MeritScope — Candidate Score Analysis', 14, y); y += 9;
    pdf.setFontSize(9); pdf.text('Independent candidate-submitted analysis. Not an official EMRS/NESTS cutoff or merit list.', 14, y); y += 10;
    pdf.setFontSize(11); pdf.text(`Submissions: ${this.dashboard.total_submissions} | 90+: ${this.dashboard.score_90_plus} | 85+: ${this.dashboard.score_85_plus} | 80+: ${this.dashboard.score_80_plus} | Average: ${this.dashboard.average_score ?? '—'} | Highest: ${this.dashboard.highest_score ?? '—'}`, 14, y); y += 12;
    pdf.setFontSize(9); pdf.text('Post',14,y); pdf.text('Category',48,y); pdf.text('Count',83,y); pdf.text('Average',110,y); pdf.text('Highest',140,y); pdf.text('90+',170,y); pdf.text('85+',195,y); pdf.text('80+',220,y); y += 6;
    for (const row of this.filteredStats) { if (y > 185) { pdf.addPage(); y = 18; } pdf.text(String(row.post_applied),14,y); pdf.text(String(row.category),48,y); pdf.text(String(row.candidate_count),83,y); pdf.text(String(row.average_score ?? '—'),110,y); pdf.text(String(row.highest_score ?? '—'),140,y); pdf.text(String(row.score_90_plus),170,y); pdf.text(String(row.score_85_plus),195,y); pdf.text(String(row.score_80_plus),220,y); y += 7; }
    pdf.save('emrs-meritscope-report.pdf');
  }
  private setStatus(message: string, isError: boolean): void { this.statusMessage = message; this.statusIsError = isError; }
  private downloadBlob(blob: Blob, name: string): void { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
}
