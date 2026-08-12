import { ReportView } from "./ReportView";

export const dynamic = "force-dynamic";

export default function ReportPage() {
  return (
    <main className="rp">
      <header className="rp-head">
        <div>
          <h1>Session report</h1>
          <p className="rp-muted">
            Where new users get stuck, and whether guidance recovered them.
          </p>
        </div>
        <a className="rp-link" href="/fixture">
          ← Back to the demo
        </a>
      </header>

      <ReportView />
    </main>
  );
}
