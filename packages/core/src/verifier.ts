import type { EvidenceLog } from "./evidence";
import type {
  Evidence,
  LeafRule,
  PageSnapshot,
  Rule,
  RuleGroup,
  VerificationResult,
} from "./types";

/**
 * Everything the verifier is allowed to look at. Page state plus the host /
 * backend event log — nothing else, and never a model's opinion.
 */
export type EvidenceContext = {
  snapshot: PageSnapshot;
  events?: EvidenceLog;
  now?: number;
};

/**
 * Deterministic rule evaluation over a PageSnapshot.
 *
 * A model never decides `passed`. It may be handed `missing` to phrase a
 * correction, but the boolean is computed here from observed page state.
 */

function isLeaf(rule: Rule): rule is LeafRule {
  return typeof (rule as LeafRule).kind === "string";
}

/** Glob with `*` only, anchored at both ends. Enough for route matching. */
function globMatches(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const expr = "^" + escaped.split("*").join(".*") + "$";
  return new RegExp(expr).test(value);
}

const norm = (s: string) => s.trim().toLowerCase();

function describe(rule: LeafRule): string {
  switch (rule.kind) {
    case "route_matches":
      return `route matches "${rule.value}"`;
    case "visible_text":
      return `"${rule.value}" is visible`;
    case "control_state":
      return `control "${rule.value}" is ${rule.state ?? "present"}`;
    case "notice_present":
      return `a notice containing "${rule.value}" is shown`;
    case "dialog_present":
      return `dialog "${rule.value}" is open`;
    case "host_event":
      return `the app reported "${rule.value}"`;
    case "backend_event":
      return `the backend confirmed "${rule.value}"`;
  }
}

type LeafOutcome = { passed: boolean; observed: string };

function evaluateLeaf(rule: LeafRule, ctx: EvidenceContext): LeafOutcome {
  const snap = ctx.snapshot;
  switch (rule.kind) {
    case "route_matches": {
      const passed = globMatches(rule.value, snap.route);
      return { passed, observed: `route is "${snap.route}"` };
    }

    case "visible_text": {
      const needle = norm(rule.value);
      const haystack = [
        snap.title,
        ...snap.headings,
        ...snap.controls.map((c) => c.name),
        ...snap.dialogs,
        ...snap.notices.map((n) => n.text),
        snap.text,
      ].map(norm);
      const passed = haystack.some((t) => t.includes(needle));
      return {
        passed,
        observed: passed
          ? `found "${rule.value}"`
          : `"${rule.value}" not present in visible text`,
      };
    }

    case "control_state": {
      const target = snap.controls.find((c) => norm(c.name) === norm(rule.value));
      if (!target) {
        return { passed: false, observed: `no control named "${rule.value}"` };
      }
      if (!rule.state) return { passed: true, observed: `control present` };
      const passed = target.state === rule.state;
      return {
        passed,
        observed: `control "${target.name}" is ${target.state ?? "unspecified"}`,
      };
    }

    case "notice_present": {
      const needle = norm(rule.value);
      const hit = snap.notices.find((n) => norm(n.text).includes(needle));
      return {
        passed: Boolean(hit),
        observed: hit
          ? `${hit.kind} notice: "${hit.text}"`
          : "no matching notice",
      };
    }

    case "dialog_present": {
      const needle = norm(rule.value);
      const hit = snap.dialogs.find((d) => norm(d).includes(needle));
      return {
        passed: Boolean(hit),
        observed: hit ? `dialog "${hit}" open` : "no matching dialog open",
      };
    }

    case "host_event":
    case "backend_event": {
      const source = rule.kind === "host_event" ? "host" : "backend";
      if (!ctx.events) {
        return {
          passed: false,
          observed: "no event log supplied to the verifier",
        };
      }
      const hit = ctx.events.find(
        rule.value,
        source,
        rule.payload,
        rule.withinMs,
        ctx.now ?? Date.now()
      );
      return {
        passed: Boolean(hit),
        observed: hit
          ? `${source} event "${hit.name}" at ${new Date(hit.at).toISOString()}`
          : `no ${source} event named "${rule.value}"`,
      };
    }
  }
}

type GroupOutcome = { passed: boolean; evidence: Evidence[]; missing: string[] };

function evaluateRule(rule: Rule, ctx: EvidenceContext): GroupOutcome {
  if (isLeaf(rule)) {
    const { passed, observed } = evaluateLeaf(rule, ctx);
    const label = describe(rule);
    return {
      passed,
      evidence: [{ rule: label, observed }],
      missing: passed ? [] : [label],
    };
  }
  return evaluateGroup(rule, ctx);
}

export function evaluateGroup(group: RuleGroup, ctx: EvidenceContext): GroupOutcome {
  const evidence: Evidence[] = [];
  const missing: string[] = [];
  let passed = true;

  if (group.all) {
    for (const rule of group.all) {
      const out = evaluateRule(rule, ctx);
      evidence.push(...out.evidence);
      missing.push(...out.missing);
      if (!out.passed) passed = false;
    }
  }

  if (group.any) {
    const outs = group.any.map((rule) => evaluateRule(rule, ctx));
    outs.forEach((o) => evidence.push(...o.evidence));
    const anyPassed = outs.some((o) => o.passed);
    if (!anyPassed) {
      passed = false;
      missing.push(`at least one of: ${outs.flatMap((o) => o.missing).join(" | ")}`);
    }
  }

  if (group.not) {
    const out = evaluateRule(group.not, ctx);
    evidence.push(
      ...out.evidence.map((e) => ({ rule: `NOT ${e.rule}`, observed: e.observed }))
    );
    if (out.passed) {
      passed = false;
      missing.push(`must not be true: ${out.evidence[0]?.rule ?? "condition"}`);
    }
  }

  // An empty group proves nothing — treat as a failed gate rather than a pass,
  // so a mis-authored flow cannot silently advance the user.
  if (!group.all && !group.any && !group.not) {
    return {
      passed: false,
      evidence: [],
      missing: ["step declared no success condition"],
    };
  }

  return { passed, evidence, missing };
}

export function verifyStep(
  stepId: string,
  success: RuleGroup,
  context: PageSnapshot | EvidenceContext,
  now: () => Date = () => new Date()
): VerificationResult {
  const ctx: EvidenceContext =
    "snapshot" in context ? context : { snapshot: context };
  const out = evaluateGroup(success, ctx);
  return {
    passed: out.passed,
    stepId,
    evidence: out.evidence,
    missing: out.missing,
    checkedAt: now().toISOString(),
  };
}

/**
 * Counts independent signals in a success group. A final, resource-creating
 * step must not be provable by a single weak signal.
 */
export function countIndependentSignals(group: RuleGroup): number {
  let n = 0;
  const walk = (r: Rule) => {
    if (isLeaf(r)) {
      n += 1;
      return;
    }
    r.all?.forEach(walk);
    r.any?.forEach(walk);
    if (r.not) walk(r.not);
  };
  walk(group);
  return n;
}
