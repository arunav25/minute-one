"use client";

import { useEffect, useState } from "react";
import { buildReport, type ReportData, type SessionEvent } from "@minute-one/core";

/**
 * Reads the event log over HTTP.
 *
 * Not by importing the store: Next gives route handlers and pages separate
 * module graphs, so events POSTed by the SDK landed in one instance while the
 * page rendered from another — live sessions never appeared. The API is the
 * only view both sides agree on.
 */
export function ReportView() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/minute-one/events", { cache: "no-store" });
        if (!res.ok) throw new Error(`events endpoint returned ${res.status}`);
        const data = (await res.json()) as { events: SessionEvent[] };
        if (!cancelled) setReport(buildReport(data.events ?? []));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="rp-muted" role="alert">
        Could not load session events: {error}
      </p>
    );
  }
  if (!report) return <p className="rp-muted">Loading sessions…</p>;

  return (
    <>
      <div className="rp-cards">
        <div className="rp-card">
          <div className="rp-k">{pct(report.completionRate)}</div>
          <div className="rp-v">Completion rate</div>
        </div>
        <div className="rp-card">
          <div className="rp-k">{secs(report.medianCompletionMs)}</div>
          <div className="rp-v">Median time to completion</div>
        </div>
        <div className="rp-card">
          <div className="rp-k">{report.topFailedStep ?? "—"}</div>
          <div className="rp-v">Top failed step</div>
        </div>
        <div className="rp-card">
          <div className="rp-k">{pct(report.recoveryRate)}</div>
          <div className="rp-v">Recovery rate</div>
        </div>
      </div>

      <section>
        <h2>Steps</h2>
        <div className="rp-scroll">
          <table className="rp-table">
            <thead>
              <tr>
                <th>Step</th>
                <th>Instructed</th>
                <th>Failed checks</th>
                <th>Recoveries</th>
                <th>Median</th>
                <th>Most common missing evidence</th>
              </tr>
            </thead>
            <tbody>
              {report.steps.map((s) => (
                <tr key={s.stepId}>
                  <td>
                    <code>{s.stepId}</code>
                  </td>
                  <td>{s.instructed}</td>
                  <td className={s.failedChecks > 0 ? "rp-bad" : ""}>
                    {s.failedChecks}
                  </td>
                  <td>{s.recoveries}</td>
                  <td>{secs(s.medianMs)}</td>
                  <td className="rp-missing">{s.topMissing ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Sessions and voice evidence</h2>
        <p className="rp-muted">
          Every session records which provider actually carried the voice. A
          session marked <strong>mock</strong> did not use real speech.
        </p>
        <div className="rp-scroll">
          <table className="rp-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Terminal</th>
                <th>Reason</th>
                <th>Provider</th>
                <th>Real voice</th>
                <th>Provider session</th>
                <th>Voice min</th>
              </tr>
            </thead>
            <tbody>
              {report.sessions.map((s) => (
                <tr key={s.sessionId}>
                  <td>
                    <code>{s.sessionId}</code>
                  </td>
                  <td>
                    <span className={`rp-pill t-${s.terminal ?? "none"}`}>
                      {s.terminal ?? "open"}
                    </span>
                  </td>
                  <td className="rp-missing">{s.reason ?? "—"}</td>
                  <td>{s.provider ?? "—"}</td>
                  <td className={s.isRealVoice ? "rp-good" : "rp-bad"}>
                    {s.isRealVoice === null ? "—" : s.isRealVoice ? "yes" : "no"}
                  </td>
                  <td>
                    <code>{s.providerSessionId ?? "—"}</code>
                  </td>
                  <td>{s.voiceMinutes?.toFixed(2) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="rp-foot">
          {report.realVoiceSessions} of {report.sessions.length} sessions used
          real provider voice · {report.totalVoiceMinutes} voice minutes total ·
          rows beginning <code>seed_</code> are sample data
        </p>
      </section>
    </>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const secs = (ms: number | null) =>
  ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`;
