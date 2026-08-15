/**
 * The landing page.
 *
 * Written for a technical founder with thirty seconds: what it is in one
 * sentence, proof it is real (live demo, console, code), and the one idea that
 * separates it from every tour product — the AI speaks, a deterministic
 * verifier decides. Claims stay inside what the product actually does; the
 * pitch deck's funnel numbers appear as the wedge we watch, not as results.
 */

import { DemoVideo } from "./DemoVideo";

const SNIPPET = `<script src="https://minute-one-ten.vercel.app/minute-one.js"
        data-product-key="mo_pk_…"></script>`;

const Mark = ({ size = 28 }: { size?: number }) => (
  <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
    <defs>
      <linearGradient id="lp-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#7A50F5" />
        <stop offset=".45" stopColor="#A487FF" />
        <stop offset="1" stopColor="#F5E6D3" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="17" fill="url(#lp-g)" />
    <path
      d="M20 41V29a6 6 0 0 1 12 0v12M32 29a6 6 0 0 1 12 0v12"
      fill="none"
      stroke="#fff"
      strokeWidth="5.8"
      strokeLinecap="round"
    />
  </svg>
);

export default function Home() {
  return (
    <div className="lp">
      <nav className="lp-nav">
        <span className="lp-brand">
          <Mark />
          Minute One
        </span>
        <div className="lp-nav-links">
          <a href="#loop">How it works</a>
          <a href="#ai">The AI</a>
          <a href="#install">Install</a>
          <a className="lp-ghost" href="/console">
            Console
          </a>
          <a className="lp-cta" href="/embed-test">
            Live demo
          </a>
        </div>
      </nav>

      {/* ------------------------------ hero ------------------------------ */}
      <header className="lp-hero">
        <div className="lp-hero-copy">
          <span className="lp-eyebrow">Verified conversational onboarding</span>
          <h1>
            An AI guide inside your product that gets every user to their first
            outcome — <em>and proves it.</em>
          </h1>
          <p className="lp-lede">
            A voice agent watches the page, speaks one instruction at a time,
            and a deterministic verifier refuses to advance until the screen
            shows the result. The AI talks.{" "}
            <strong>It never grades its own work.</strong>
          </p>
          <div className="lp-hero-ctas">
            <DemoVideo className="lp-cta big">▶&nbsp; Watch the demo — 1 min</DemoVideo>
            <a className="lp-ghost big" href="/embed-test">
              Try it live →
            </a>
          </div>
          <p className="lp-fineprint">
            Open source · Bring your own keys · One script tag · Built by the
            team behind JustCall.io
          </p>
        </div>

        {/* A still of the real widget: orb pulsing, panel mid-journey. */}
        <div className="lp-hero-visual" aria-hidden="true">
          <div className="lp-orb">
            <span className="lp-ring" />
            <span className="lp-ring" />
            <span className="lp-ring" />
            <Mark size={30} />
          </div>
          <div className="lp-widget">
            <div className="lp-widget-head">
              <Mark size={22} />
              <span className="lp-dot" />
              <strong>Guide me</strong>
              <span className="lp-widget-brand">Minute One</span>
            </div>
            <span className="lp-stage">Listening</span>
            <p className="lp-instruction">
              Now choose <b>Add Number</b>, top right.
            </p>
            <div className="lp-verified">✓ Verified — “Number Details” is on the page</div>
            <div className="lp-transcript">
              <p>
                <span>You</span>help me add a phone number
              </p>
              <p>
                <span>Guide</span>Choose Add a number to open your phone
                numbers.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ---------------------------- problem ----------------------------- */}
      <section className="lp-section">
        <h2>
          Signup was never the hard part.
          <br />
          The next five minutes are.
        </h2>
        <p className="lp-sub">
          Most of the users a SaaS product loses are lost before they complete a
          single core action — not because the product is wrong, but because
          nobody was there when they asked{" "}
          <em>“how do I do this, right now?”</em>
        </p>
        <div className="lp-grid3">
          <div className="lp-card">
            <h3>Product tours describe</h3>
            <p>
              Scripted months ago, fired at everyone, dismissed in two seconds.
              They end whether or not anything got done.
            </p>
          </div>
          <div className="lp-card">
            <h3>Chatbots explain</h3>
            <p>
              They answer in prose about a screen they cannot see, and call it
              resolved when the user stops replying.
            </p>
          </div>
          <div className="lp-card">
            <h3>Minute One does it with the user</h3>
            <p>
              Live voice on the live page. The user performs every click — so
              next week they still know the way.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------ loop ------------------------------ */}
      <section className="lp-section" id="loop">
        <span className="lp-eyebrow">Listen · Guide · Verify · Recover</span>
        <h2>One loop, on every screen the user touches</h2>
        <div className="lp-grid4">
          <div className="lp-card">
            <span className="lp-step-num">01</span>
            <h3>Listen</h3>
            <p>
              A redacted semantic snapshot of the live DOM — roles, names,
              dialogs, notices. Never raw HTML, never form values.
            </p>
          </div>
          <div className="lp-card">
            <span className="lp-step-num">02</span>
            <h3>Guide</h3>
            <p>
              One spoken instruction at a time, a spotlight ring on the real
              control. The guide never clicks for the user — muscle memory is
              the point.
            </p>
          </div>
          <div className="lp-card lp-card-hot">
            <span className="lp-step-num">03</span>
            <h3>Verify</h3>
            <p>
              Every step declares evidence — a route, a visible result. A
              controller checks the page and blocks progression until the proof
              exists. No model decides “done”.
            </p>
          </div>
          <div className="lp-card">
            <span className="lp-step-num">04</span>
            <h3>Recover</h3>
            <p>
              A wrong click visibly blocks the step. Bounded retries, a
              different explanation each attempt, and every friction point
              recorded for the team.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------- ai -------------------------------- */}
      <section className="lp-section" id="ai">
        <span className="lp-eyebrow">The AI, kept honest</span>
        <h2>
          Real AI where it helps.
          <br />
          Determinism where it matters.
        </h2>
        <div className="lp-split">
          <div>
            <ul className="lp-list">
              <li>
                <strong>A live voice agent</strong> — real-time speech in both
                directions, barge-in, live transcripts. Ask anything
                mid-journey.
              </li>
              <li>
                <strong>Retrieval, not prompt-stuffing</strong> — your help
                center is embedded into a vector index; the agent retrieves the
                exact passages per question and answers only from them.
              </li>
              <li>
                <strong>Journeys chosen by speech</strong> — “add a number” and
                “send a message” are different authored paths. The agent routes
                on what the user says, then follows the proven route.
              </li>
              <li>
                <strong>It admits what it doesn’t know</strong> — no retrieved
                passage, no answer. It says so instead of inventing a menu that
                isn’t there.
              </li>
            </ul>
          </div>
          <div className="lp-proofbox">
            <h3>What the model is never allowed to do</h3>
            <ul className="lp-list">
              <li>Mark a step as passed</li>
              <li>Invent a route a help article didn’t describe</li>
              <li>See a password, a card number, or raw HTML</li>
              <li>Keep the session alive past its time and voice budget</li>
            </ul>
            <p className="lp-proofnote">
              Every session ends in exactly one recorded state —{" "}
              <code>completed</code>, <code>partial</code>, <code>failed</code>{" "}
              or <code>deadline</code> — with per-step evidence in the console.
            </p>
          </div>
        </div>
      </section>

      {/* ----------------------------- install ----------------------------- */}
      <section className="lp-section" id="install">
        <span className="lp-eyebrow">Open source · BYOK</span>
        <h2>The whole integration is one script tag</h2>
        <div className="lp-split">
          <div>
            <ol className="lp-steps">
              <li>
                <strong>Install</strong> — paste the snippet. Self-host or run
                hosted; the code is open, so trying it needs no procurement
                cycle.
              </li>
              <li>
                <strong>Train</strong> — point it at your help center. Articles
                are chunked, embedded and searchable by the agent in minutes.
              </li>
              <li>
                <strong>Author journeys</strong> — each step names the control
                to point at and the on-screen evidence that proves it happened.
              </li>
            </ol>
            <p className="lp-fineprint">
              Bring your own model keys. Your data, your bill — prompts never
              route through us.
            </p>
          </div>
          <pre className="lp-code">{SNIPPET}</pre>
        </div>
      </section>

      {/* ------------------------------ wedge ------------------------------ */}
      <section className="lp-section">
        <span className="lp-eyebrow">Why us</span>
        <h2>Built out of a funnel we watch every week</h2>
        <p className="lp-sub">
          We build JustCall. A new user needs a phone number; they don’t know
          where numbers live, and the help center answers in prose. That single
          moment sits in front of every activation we have — Minute One is the
          layer we wished existed, shipped first inside our own product.
        </p>
        <div className="lp-funnel">
          <div>
            <span className="lp-funnel-label">Sign-ups who find where to start</span>
            <div className="lp-funnel-row">
              <span className="lp-bar" style={{ width: "48%" }} />
              <em>today ~48%</em>
            </div>
            <div className="lp-funnel-row">
              <span className="lp-bar hot" style={{ width: "79%" }} />
              <em>guided — designed for 79%</em>
            </div>
          </div>
          <div>
            <span className="lp-funnel-label">…who complete the first core action</span>
            <div className="lp-funnel-row">
              <span className="lp-bar" style={{ width: "24%" }} />
              <em>today ~24%</em>
            </div>
            <div className="lp-funnel-row">
              <span className="lp-bar hot" style={{ width: "63%" }} />
              <em>guided — designed for 63%</em>
            </div>
          </div>
        </div>
        <p className="lp-fineprint">
          Design targets for the JustCall activation flow, not measured results
          — the verifier exists precisely so these numbers can’t be faked.
        </p>
      </section>

      {/* ------------------------------ close ------------------------------ */}
      <footer className="lp-footer">
        <h2>
          Users don’t churn because the product is bad.
          <br />
          They churn because minute one was silent.
        </h2>
        <div className="lp-hero-ctas center">
          <DemoVideo className="lp-cta big">▶&nbsp; Watch the demo — 1 min</DemoVideo>
          <a className="lp-ghost big" href="/embed-test">
            Try it live →
          </a>
          <a className="lp-ghost big" href="/console">
            Open the console
          </a>
        </div>
        <div className="lp-roadmap">
          <span>
            <b>Now</b> shipping inside JustCall
          </span>
          <span>
            <b>Next</b> open-source release &amp; BYOK widget
          </span>
          <span>
            <b>Then</b> design partners across SaaS
          </span>
        </div>
        <p className="lp-fineprint">
          Minute One · verified conversational onboarding ·{" "}
          <a href="mailto:arunav@saaslabs.co">arunav@saaslabs.co</a>
        </p>
      </footer>
    </div>
  );
}
