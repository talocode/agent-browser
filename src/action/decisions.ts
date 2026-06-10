import type { SmokeCheckResult } from "../tools/check.js";

export interface ActionDecisionOptions {
  failOnConsoleErrors: boolean;
  failOnNetworkErrors: boolean;
  failOnBlank: boolean;
  vision: boolean;
}

export interface ActionDecision {
  shouldFail: boolean;
  reasons: string[];
  warnings: string[];
}

export function evaluateActionDecision(
  result: SmokeCheckResult,
  options: ActionDecisionOptions,
): ActionDecision {
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (result.status === "fail") {
    reasons.push(result.summary);
  }

  if (options.failOnConsoleErrors && result.console.errors > 0) {
    reasons.push(`Console errors detected: ${result.console.errors}`);
  }

  if (options.failOnNetworkErrors && result.network.failed > 0) {
    reasons.push(`Failed network requests detected: ${result.network.failed}`);
  }

  if (options.vision && !result.vision.available) {
    warnings.push("Vision module is not available; visual inspection was skipped.");
  }

  if (options.vision && options.failOnBlank && result.vision.result?.isLikelyBlank) {
    reasons.push("Screenshot appears mostly blank or empty.");
  }

  if (options.vision && result.vision.result?.isLikelyBlurry) {
    warnings.push("Screenshot appears blurry.");
  }

  for (const warning of result.vision.warnings) {
    if (!warnings.includes(warning)) {
      warnings.push(warning);
    }
  }

  return {
    shouldFail: reasons.length > 0,
    reasons,
    warnings,
  };
}