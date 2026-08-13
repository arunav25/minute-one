import { ReportView } from "./ReportView";

export const dynamic = "force-dynamic";

export default function ReportPage() {
  return (
    <main className="rp">
      <header className="rp-head">
        <div>
          <div className="rp-brand">
            <img src="/brand/logo-mark.svg" alt="" width={30} height={30} />
            <span>Minute One</span>
          </div>
          <h1>Session report</h1>
          <p className="rp-muted">
            Where new users get stuck, and whether guidance recovered them.
          </p>
        </div>
        <a className="rp-link" href="/embed-test">
          ← Back to the demo
        </a>
      </header>

      <ReportView />
    </main>
  );
}
