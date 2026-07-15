import type {
  EducationalExplanation,
  ExperienceLevel,
} from "../contracts";

export type SupportBoundary =
  | "crisis"
  | "debt"
  | "tax"
  | "regulated-advice";

const INJECTION_PATTERNS: RegExp[] = [
  /\bignore (?:all |any )?(?:previous|prior|system|developer) instructions?\b/iu,
  /\b(?:reveal|show|print|repeat|leak) (?:the )?(?:system|developer|hidden) (?:prompt|message|instructions?)\b/iu,
  /\b(?:bypass|disable|override|evade) (?:the )?(?:guardrails?|safety|policy|rules?)\b/iu,
  /\b(?:jailbreak|prompt injection|developer mode|act as dan|do anything now)\b/iu,
  /\bpretend (?:there are|you have) no (?:rules|restrictions|guardrails)\b/iu,
];

const PERSONAL_RECOMMENDATION_PATTERNS: RegExp[] = [
  /\bshould i (?:buy|sell|hold|invest|trade|allocate|put|borrow|withdraw)\b/iu,
  /\b(?:would|is) (?:buying|selling|holding|investing in) .{1,80}? be (?:right|good|best|smart|safe) for (?:me|my\b)/iu,
  /\b(?:can|could|would) you recommend (?:a |an |the |what |whether )?(?:stock|etf|crypto|coin|investment|allocation|portfolio|purchase|trade)\b/iu,
  /\bis .{1,80}? (?:a )?(?:right|good|best|smart|safe) allocation for (?:me|my\b)/iu,
  /\brecommend (?:that )?i (?:buy|sell|hold|invest|trade|allocate|put)\b/iu,
  /\b(?:tell|show) me (?:exactly )?(?:what|when|how much) to (?:buy|sell|invest|trade)\b/iu,
  /\bwhat should i invest (?:in|into)\b/iu,
  /\b(?:best|safest) (?:stock|etf|crypto|coin|investment) for me\b/iu,
  /\bhow much should i (?:put|invest|allocate)\b/iu,
  /\bwhere should i put (?:my )?money\b/iu,
  /\b(?:build|create|design|construct|make) (?:me )?(?:a |an )?(?:retirement |investment )?(?:portfolio|allocation|asset mix|investing plan)\b/iu,
  /\b(?:build|create|design|construct|make) (?:a |an )?(?:retirement |investment )?(?:portfolio|allocation|asset mix|investing plan) (?:for|around) (?:me|my\b)/iu,
  /\b(?:what|which) (?:portfolio|allocation|asset mix|investment mix) (?:fits|suits|matches|is (?:right|appropriate|suitable|best) for) (?:me|my\b)/iu,
  /\b(?:allocate|split|put) (?:my|our) (?:money|savings|portfolio|investments?)\b/iu,
  /\bguarantee me (?:a )?(?:return|profit|gain)\b/iu,
];

const CRISIS_PATTERNS: RegExp[] = [
  /\b(?:suicide|kill myself|self[- ]harm|hurt myself)\b/iu,
  /\b(?:no food|cannot afford food|can't afford food|about to be homeless|losing my home)\b/iu,
  /\b(?:medical emergency|immediate danger)\b/iu,
];

const DEBT_PATTERNS: RegExp[] = [
  /\b(?:bankruptcy|foreclosure|debt collector|collections agency|wage garnishment)\b/iu,
  /\b(?:cannot|can't|unable to) (?:pay|make) (?:my )?(?:bills|rent|mortgage|debt payment)\b/iu,
  /\b(?:overwhelming|unmanageable) debt\b/iu,
];

const TAX_PATTERNS: RegExp[] = [
  /\b(?:tax advice|tax deduction|tax return|capital gains tax|irs audit|tax liability)\b/iu,
  /\bhow (?:do|should) i (?:file|report|avoid paying) tax(?:es)?\b/iu,
];

const UNSAFE_GENERATED_PATTERNS: RegExp[] = [
  /\b(?:you|the user) (?:should|must|need to|have to) (?:buy|sell|hold|invest|trade|borrow|withdraw)\b/iu,
  /\b(?:i|we) recommend(?: that)? (?:you )?(?:buy|sell|hold|invest|put|putting|allocate|allocating)\b/iu,
  /\b(?:buy|sell|trade) (?:it |this |that )?(?:now|immediately|today)\b/iu,
  /\bguaranteed (?:return|profit|gain|growth|income)\b/iu,
  /\brisk[- ]free (?:return|investment|profit|gain)\b/iu,
  /\b(?:cannot|can't|won't) lose (?:money|value)\b/iu,
  /\bwill definitely (?:rise|fall|gain|profit|return)\b/iu,
  /\b(?:a |the )?(?:\d{1,3}\s*\/\s*\d{1,3}|\d{1,3}%\s*\/\s*\d{1,3}%).{0,100}?(?:portfolio|allocation|asset mix|split)?.{0,60}?\b(?:fits|suits|matches) your (?:goals|needs|situation|risk tolerance|time horizon)\b/iu,
  /\b(?:this|that|the|a) (?:portfolio|allocation|asset mix|split).{0,100}?\b(?:fits|suits|matches) your (?:goals|needs|situation|risk tolerance|time horizon)\b/iu,
  /\b(?:use|choose|adopt|maintain|target) (?:a |an |the )?.{0,80}?(?:portfolio|allocation|asset mix|split)\b/iu,
];

const SENSITIVE_IDENTIFIER_PATTERNS: ReadonlyArray<{
  label: string;
  pattern: RegExp;
}> = [
  {
    label: "SSN",
    pattern:
      /\b(?:ssn|social security(?: number)?)\s*(?::|#|is)?\s*\d{3}[- ]?\d{2}[- ]?\d{4}\b|\b\d{3}-\d{2}-\d{4}\b/giu,
  },
  {
    label: "PAYMENT_CARD",
    pattern: /\b(?:\d[ -]?){13,19}\b/gu,
  },
  {
    label: "BANK_ACCOUNT",
    pattern:
      /\b(?:(?:bank|brokerage|checking|savings)\s+)?account\s+(?:number|no\.?)\s*(?::|#|is)?\s*[A-Z0-9-]{4,34}\b|\b(?:aba\s+|bank\s+)?routing\s+(?:number|no\.?)\s*(?::|#|is)?\s*\d{9}\b/giu,
  },
  {
    label: "GOVERNMENT_ID",
    pattern:
      /\b(?:passport|driver'?s? licen[cs]e|state id|national id|government id)\s+(?:number|no\.?)\s*(?::|#|is)?\s*(?=[A-Z0-9-]{4,24}\b)(?=[A-Z0-9-]*\d)[A-Z0-9-]{4,24}\b/giu,
  },
];

export type SensitiveIdentifierRedaction = {
  text: string;
  detected: boolean;
};

/**
 * Removes obvious high-risk identifiers before a question could cross the
 * server boundary. This is deliberately conservative; it is not a general
 * PII detector and callers should still tell people not to submit private data.
 */
export function redactSensitiveIdentifiers(
  text: string,
): SensitiveIdentifierRedaction {
  let redacted = text;
  for (const { label, pattern } of SENSITIVE_IDENTIFIER_PATTERNS) {
    redacted = redacted.replace(pattern, `[REDACTED_${label}]`);
  }
  return { text: redacted, detected: redacted !== text };
}

export function hasSensitiveIdentifier(text: string): boolean {
  return redactSensitiveIdentifiers(text).detected;
}

export function hasPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

export function supportBoundaryFor(text: string): SupportBoundary | null {
  if (CRISIS_PATTERNS.some((pattern) => pattern.test(text))) return "crisis";
  if (DEBT_PATTERNS.some((pattern) => pattern.test(text))) return "debt";
  if (TAX_PATTERNS.some((pattern) => pattern.test(text))) return "tax";
  if (PERSONAL_RECOMMENDATION_PATTERNS.some((pattern) => pattern.test(text))) {
    return "regulated-advice";
  }
  return null;
}

export function isGeneratedFinancialAdviceUnsafe(
  explanation: EducationalExplanation,
): boolean {
  const text = [
    explanation.title,
    explanation.summary,
    ...explanation.keyPoints,
    ...explanation.assumptions,
    ...explanation.tryNext,
  ].join(" ");
  return UNSAFE_GENERATED_PATTERNS.some((pattern) => pattern.test(text));
}

export function boundaryExplanation(
  boundary: SupportBoundary,
  experienceLevel: ExperienceLevel,
): EducationalExplanation {
  const detail =
    experienceLevel === "advanced"
      ? "A professional can evaluate the legal, tax, suitability, cash-flow, and risk details that this educational tool does not collect."
      : "A qualified professional can look at the details that Morrowward intentionally does not collect.";

  if (boundary === "crisis") {
    return {
      title: "Your immediate wellbeing comes first",
      summary:
        "Morrowward cannot safely handle an urgent personal or financial crisis. If you are in immediate danger, contact local emergency services. In the U.S. or Canada, call or text 988 for crisis support; elsewhere, use your local crisis line.",
      keyPoints: [
        "For urgent food, housing, or medical needs, contact local social services or a trusted community organization.",
        "A trusted person nearby may be able to help you take the next safe step.",
      ],
      assumptions: [
        "Your location and circumstances are unknown, so local services may differ.",
      ],
      tryNext: ["Pause the simulation and contact an appropriate local resource now."],
    };
  }

  if (boundary === "debt") {
    return {
      title: "Personal debt needs human context",
      summary:
        "I can explain general debt concepts, but I cannot create a personal debt, bankruptcy, or collections strategy.",
      keyPoints: [
        "Consider a reputable nonprofit credit counselor or qualified attorney for advice about your circumstances.",
        "Be cautious of services promising guaranteed debt relief or demanding large upfront fees.",
      ],
      assumptions: [detail],
      tryNext: ["Ask me to explain interest, minimum payments, or credit utilization in general terms."],
    };
  }

  if (boundary === "tax") {
    return {
      title: "Tax rules depend on your circumstances",
      summary:
        "I can explain general tax vocabulary, but I cannot determine your filing position or provide tax advice.",
      keyPoints: [
        "Rules vary by jurisdiction and can change.",
        "Use current official tax guidance or a qualified tax professional for a decision.",
      ],
      assumptions: [detail],
      tryNext: ["Ask me for a general explanation of capital gains, cost basis, or tax-advantaged accounts."],
    };
  }

  return {
    title: "Let’s keep this educational",
    summary:
      "I can explain how an investment or strategy works, but I cannot tell you what to buy, sell, hold, or allocate for your personal situation.",
    keyPoints: [
      "Suitability depends on goals, time horizon, liquidity needs, taxes, and ability to absorb losses.",
      "Compare tradeoffs and risks rather than treating any outcome as certain.",
    ],
    assumptions: [detail],
    tryNext: ["Ask how diversification, volatility, fees, or time horizon affect an illustrative plan."],
  };
}
