import type {
  EducationTopic,
  ExperienceLevel,
} from "../contracts";

export const EDUCATION_PATH_IDS = [
  "start-here",
  "build-the-habit",
  "understand-risk",
  "go-deeper",
] as const;

export type EducationPathId = (typeof EDUCATION_PATH_IDS)[number];

export type EducationPrompt = {
  id: string;
  question: string;
  topic: EducationTopic;
};

export type EducationPath = {
  id: EducationPathId;
  eyebrow: string;
  title: string;
  description: string;
  promptSets: Record<ExperienceLevel, EducationPrompt[]>;
};

export type EducationResourceTier =
  | "primary"
  | "authoritative"
  | "research"
  | "supplemental";

export type EducationResourceLink = {
  label: string;
  source: string;
  href: string;
  tier: EducationResourceTier;
};

export type EducationIconKey =
  | "bitcoin"
  | "book"
  | "calendar"
  | "clock"
  | "compass"
  | "landmark"
  | "line-chart"
  | "piggy-bank"
  | "sliders"
  | "trending-up"
  | "wallet";

export type EducationResource = {
  id: string;
  pathId: EducationPathId;
  topic: EducationTopic;
  title: string;
  kicker: string;
  description: string;
  icon: EducationIconKey;
  links: EducationResourceLink[];
};

export const EDUCATION_PATHS: EducationPath[] = [
  {
    id: "start-here",
    eyebrow: "01 · Foundations",
    title: "Start Here",
    description:
      "Learn the building blocks: saving, investing, ownership, compounding, and purchasing power.",
    promptSets: {
      new: [
        {
          id: "new-saving-vs-investing",
          question: "What is the difference between saving and investing?",
          topic: "general",
        },
        {
          id: "new-compounding",
          question: "How does compounding work in plain language?",
          topic: "compounding",
        },
        {
          id: "new-stock-vs-etf",
          question: "What is the difference between a stock and an ETF?",
          topic: "etfs",
        },
        {
          id: "new-inflation",
          question: "What does inflation-adjusted value mean?",
          topic: "inflation",
        },
      ],
      familiar: [
        {
          id: "familiar-savings-role",
          question:
            "How do emergency savings and long-term investing serve different goals?",
          topic: "risk",
        },
        {
          id: "familiar-compound-growth",
          question:
            "How is compound growth different from a simple annual return?",
          topic: "compounding",
        },
        {
          id: "familiar-stock-etf-exposure",
          question: "How do stocks and ETFs create different exposure?",
          topic: "etfs",
        },
        {
          id: "familiar-real-return",
          question: "How do nominal return, inflation, and real return connect?",
          topic: "inflation",
        },
      ],
      advanced: [
        {
          id: "advanced-liquidity-horizon",
          question:
            "How do liquidity needs and time horizon change the role of invested assets?",
          topic: "risk",
        },
        {
          id: "advanced-cagr-path",
          question:
            "What does CAGR summarize, and what does it hide about the path?",
          topic: "compounding",
        },
        {
          id: "advanced-fund-structure",
          question:
            "How do ETF structure, concentration, and tracking change risk?",
          topic: "etfs",
        },
        {
          id: "advanced-real-sensitivity",
          question:
            "How sensitive is a long-horizon real value to return and inflation assumptions?",
          topic: "inflation",
        },
      ],
    },
  },
  {
    id: "build-the-habit",
    eyebrow: "02 · Consistency",
    title: "Build the Habit",
    description:
      "See how repeatable contributions, time in the market, and costs shape a long journey.",
    promptSets: {
      new: [
        {
          id: "new-weekly-investing",
          question: "What does investing the same amount each week do?",
          topic: "dollar-cost-averaging",
        },
        {
          id: "new-small-amounts",
          question: "Can a small weekly amount really matter over 20 years?",
          topic: "compounding",
        },
        {
          id: "new-strong-days",
          question: "Why can missing a few strong market days matter?",
          topic: "market-timing",
        },
        {
          id: "new-etf-fees",
          question: "Why do ETF fees matter if they look so small?",
          topic: "etfs",
        },
      ],
      familiar: [
        {
          id: "familiar-dca-shares",
          question:
            "How does dollar-cost averaging change the number of shares purchased?",
          topic: "dollar-cost-averaging",
        },
        {
          id: "familiar-contribution-rate",
          question:
            "How do contribution rate and time compare with return assumptions?",
          topic: "compounding",
        },
        {
          id: "familiar-timing-decisions",
          question:
            "Why does leaving and re-entering a market require two timing decisions?",
          topic: "market-timing",
        },
        {
          id: "familiar-fee-drag",
          question: "How can recurring fees compound into long-term return drag?",
          topic: "etfs",
        },
      ],
      advanced: [
        {
          id: "advanced-periodic-vs-lump",
          question:
            "How does periodic investing differ from staging an available lump sum?",
          topic: "dollar-cost-averaging",
        },
        {
          id: "advanced-cash-flow-return",
          question:
            "How do recurring cash flows affect an investor's realized return?",
          topic: "compounding",
        },
        {
          id: "advanced-best-day-bias",
          question:
            "What can strongest-day studies teach, and what selection bias should I notice?",
          topic: "market-timing",
        },
        {
          id: "advanced-expense-tracking",
          question:
            "How do expense ratios, spreads, and tracking difference affect ETF outcomes?",
          topic: "etfs",
        },
      ],
    },
  },
  {
    id: "understand-risk",
    eyebrow: "03 · Tradeoffs",
    title: "Understand Risk",
    description:
      "Name volatility, drawdowns, concentration, diversification, and speculative risk without panic.",
    promptSets: {
      new: [
        {
          id: "new-twenty-percent-drop",
          question: "What does a 20% market drop mean?",
          topic: "volatility",
        },
        {
          id: "new-diversification",
          question: "How does diversification help, and what can it not do?",
          topic: "diversification",
        },
        {
          id: "new-risk-reward",
          question: "Why can higher possible returns come with more risk?",
          topic: "risk",
        },
        {
          id: "new-crypto-risk",
          question: "Why can crypto prices move so much?",
          topic: "crypto",
        },
      ],
      familiar: [
        {
          id: "familiar-risk-differences",
          question:
            "How are volatility, drawdown, and permanent loss different?",
          topic: "volatility",
        },
        {
          id: "familiar-diversification-limits",
          question:
            "How do asset allocation and diversification manage different risks?",
          topic: "diversification",
        },
        {
          id: "familiar-concentration",
          question:
            "How does concentration change both upside and downside?",
          topic: "risk",
        },
        {
          id: "familiar-crypto-layers",
          question:
            "What market, custody, protocol, and fraud risks exist in crypto?",
          topic: "crypto",
        },
      ],
      advanced: [
        {
          id: "advanced-sequence-risk",
          question:
            "How do volatility and sequence risk affect a long-horizon path?",
          topic: "volatility",
        },
        {
          id: "advanced-correlation",
          question:
            "How do correlation and concentration limit diversification?",
          topic: "diversification",
        },
        {
          id: "advanced-risk-capacity",
          question:
            "How are risk capacity, risk tolerance, and risk requirement different?",
          topic: "risk",
        },
        {
          id: "advanced-crypto-tail-risk",
          question:
            "How do liquidity, custody, protocol, and regulatory tail risks interact in cryptoassets?",
          topic: "crypto",
        },
      ],
    },
  },
  {
    id: "go-deeper",
    eyebrow: "04 · Advanced concepts",
    title: "Go Deeper",
    description:
      "Explore return measurement, company ownership, market terminology, and options mechanics.",
    promptSets: {
      new: [
        {
          id: "new-cagr",
          question: "What does CAGR mean?",
          topic: "compounding",
        },
        {
          id: "new-stock-ownership",
          question: "What do I actually own when I buy a stock?",
          topic: "stocks",
        },
        {
          id: "new-options-terms",
          question:
            "What are calls, puts, strike price, and expiration?",
          topic: "options",
        },
        {
          id: "new-market-words",
          question: "What do bull market, bear market, and drawdown mean?",
          topic: "volatility",
        },
      ],
      familiar: [
        {
          id: "familiar-cagr-return",
          question:
            "How is CAGR different from an investor's personal return?",
          topic: "compounding",
        },
        {
          id: "familiar-stock-price-business",
          question:
            "Why can a good business and a good stock price be different questions?",
          topic: "stocks",
        },
        {
          id: "familiar-option-direction",
          question:
            "Why can an option lose value even when the stock moves in the expected direction?",
          topic: "options",
        },
        {
          id: "familiar-beta-drawdown",
          question:
            "How do beta, volatility, and maximum drawdown describe different things?",
          topic: "volatility",
        },
      ],
      advanced: [
        {
          id: "advanced-time-weighted",
          question:
            "How do CAGR, time-weighted return, and money-weighted return differ?",
          topic: "compounding",
        },
        {
          id: "advanced-equity-drivers",
          question:
            "How do cash flows, expectations, dilution, and valuation multiples affect equity returns?",
          topic: "stocks",
        },
        {
          id: "advanced-option-greeks",
          question:
            "How do delta, theta, implied volatility, and leverage shape option risk?",
          topic: "options",
        },
        {
          id: "advanced-drawdown-recovery",
          question:
            "Why does a loss require a larger percentage gain to recover?",
          topic: "volatility",
        },
      ],
    },
  },
];

export const EDUCATION_RESOURCES: EducationResource[] = [
  {
    id: "saving-and-investing",
    pathId: "start-here",
    topic: "general",
    title: "Saving and investing",
    kicker: "Give each dollar a job",
    description:
      "Separate near-term reserves from long-term assets, then learn the basic roadmap for goals, debt, emergencies, and investing.",
    icon: "piggy-bank",
    links: [
      {
        label: "Saving and investing roadmap",
        source: "Investor.gov",
        href: "https://www.investor.gov/introduction-investing/investing-basics/save-and-invest",
        tier: "primary",
      },
    ],
  },
  {
    id: "compounding",
    pathId: "start-here",
    topic: "compounding",
    title: "Compounding",
    kicker: "Let time participate",
    description:
      "See how growth can build on contributions and earlier growth—and why a smooth rate is still only an illustration.",
    icon: "trending-up",
    links: [
      {
        label: "Compound interest calculator",
        source: "Investor.gov",
        href: "https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator",
        tier: "primary",
      },
      {
        label: "Compound interest",
        source: "Grokipedia",
        href: "https://grokipedia.com/page/Compound_interest",
        tier: "supplemental",
      },
    ],
  },
  {
    id: "stocks-and-bonds",
    pathId: "start-here",
    topic: "stocks",
    title: "Stocks and bonds",
    kicker: "Ownership versus lending",
    description:
      "Compare owning a share of a business with lending to an issuer, including the different sources of return and loss.",
    icon: "landmark",
    links: [
      {
        label: "Stocks: frequently asked questions",
        source: "Investor.gov",
        href: "https://www.investor.gov/introduction-investing/investing-basics/investment-products/stocks",
        tier: "primary",
      },
      {
        label: "Bonds and fixed-income products",
        source: "Investor.gov",
        href: "https://www.investor.gov/introduction-investing/investing-basics/investment-products/bonds-or-fixed-income-products/bonds",
        tier: "primary",
      },
      {
        label: "Stock",
        source: "Grokipedia",
        href: "https://grokipedia.com/page/Stock",
        tier: "supplemental",
      },
    ],
  },
  {
    id: "inflation",
    pathId: "start-here",
    topic: "inflation",
    title: "Inflation and purchasing power",
    kicker: "Future dollars, today's meaning",
    description:
      "Understand why nominal dollars and inflation-adjusted dollars answer different questions.",
    icon: "wallet",
    links: [
      {
        label: "Purchasing power and constant dollars",
        source: "U.S. Bureau of Labor Statistics",
        href: "https://www.bls.gov/cpi/factsheets/purchasing-power-constant-dollars.htm",
        tier: "primary",
      },
      {
        label: "Inflation",
        source: "Grokipedia",
        href: "https://grokipedia.com/page/Inflation",
        tier: "supplemental",
      },
    ],
  },
  {
    id: "dollar-cost-averaging",
    pathId: "build-the-habit",
    topic: "dollar-cost-averaging",
    title: "Dollar-cost averaging",
    kicker: "Build a repeatable rhythm",
    description:
      "Learn what regular equal-dollar contributions do, what they do not guarantee, and how price changes affect units purchased.",
    icon: "calendar",
    links: [
      {
        label: "Dollar-cost averaging glossary",
        source: "Investor.gov",
        href: "https://www.investor.gov/introduction-investing/investing-basics/glossary/dollar-cost-averaging",
        tier: "primary",
      },
      {
        label: "Dollar-cost averaging",
        source: "Grokipedia",
        href: "https://grokipedia.com/page/Dollar_cost_averaging",
        tier: "supplemental",
      },
    ],
  },
  {
    id: "small-habits",
    pathId: "build-the-habit",
    topic: "compounding",
    title: "Small amounts over time",
    kicker: "Make the first step visible",
    description:
      "Explore why a modest sustainable habit can become meaningful when it is repeated over many years.",
    icon: "piggy-bank",
    links: [
      {
        label: "Small savings add up to big money",
        source: "Investor.gov",
        href: "https://www.investor.gov/introduction-investing/investing-basics/save-and-invest/small-savings-add-big-money",
        tier: "primary",
      },
      {
        label: "Compound annual growth rate",
        source: "Grokipedia",
        href: "https://grokipedia.com/page/Compound_annual_growth_rate",
        tier: "supplemental",
      },
    ],
  },
  {
    id: "etfs-and-fees",
    pathId: "build-the-habit",
    topic: "etfs",
    title: "ETFs and fees",
    kicker: "Look inside the basket",
    description:
      "Learn how pooled funds work, why holdings and concentration matter, and how recurring costs can reduce outcomes.",
    icon: "wallet",
    links: [
      {
        label: "Exchange-traded funds",
        source: "Investor.gov",
        href: "https://www.investor.gov/introduction-investing/investing-basics/investment-products/mutual-funds-and-exchange-traded-2",
        tier: "primary",
      },
      {
        label: "Exchange-traded fund",
        source: "Grokipedia",
        href: "https://grokipedia.com/page/Exchange-traded_fund",
        tier: "supplemental",
      },
    ],
  },
  {
    id: "time-in-market",
    pathId: "build-the-habit",
    topic: "market-timing",
    title: "Time in the market",
    kicker: "Days you cannot predict",
    description:
      "Study why a few unusually strong days can affect a long result, while remembering that remaining invested still carries risk.",
    icon: "clock",
    links: [
      {
        label: "Introduction to long-term investing",
        source: "Investor.gov",
        href: "https://www.investor.gov/introduction-investing",
        tier: "primary",
      },
      {
        label: "Impact of missing strong market days",
        source: "Fidelity Learning Center",
        href: "https://www.fidelity.com/learning-center/trading-investing/should-i-sell-my-stocks-now",
        tier: "research",
      },
      {
        label: "Market timing",
        source: "Grokipedia",
        href: "https://grokipedia.com/page/Market_timing",
        tier: "supplemental",
      },
    ],
  },
  {
    id: "diversification",
    pathId: "understand-risk",
    topic: "diversification",
    title: "Diversification",
    kicker: "Spread exposure",
    description:
      "See how combining different assets can reduce concentration without eliminating market loss.",
    icon: "compass",
    links: [
      {
        label: "Asset allocation and diversification",
        source: "Investor.gov",
        href: "https://www.investor.gov/introduction-investing/getting-started/asset-allocation",
        tier: "primary",
      },
      {
        label: "Diversification in finance",
        source: "Grokipedia",
        href: "https://grokipedia.com/page/Diversification_(finance)",
        tier: "supplemental",
      },
    ],
  },
  {
    id: "risk-and-volatility",
    pathId: "understand-risk",
    topic: "volatility",
    title: "Risk, volatility, and drawdowns",
    kicker: "Name the tradeoffs",
    description:
      "Distinguish moving prices, temporary declines, permanent loss, liquidity needs, and emotional pressure.",
    icon: "line-chart",
    links: [
      {
        label: "Volatility",
        source: "FINRA",
        href: "https://www.finra.org/investors/investing/investing-basics/volatility",
        tier: "authoritative",
      },
      {
        label: "Investment risk",
        source: "FINRA",
        href: "https://www.finra.org/investors/investing/investing-basics/risk",
        tier: "authoritative",
      },
      {
        label: "Volatility in finance",
        source: "Grokipedia",
        href: "https://grokipedia.com/page/Volatility_(finance)",
        tier: "supplemental",
      },
    ],
  },
  {
    id: "crypto-assets",
    pathId: "understand-risk",
    topic: "crypto",
    title: "Crypto assets",
    kicker: "Technology plus uncertainty",
    description:
      "Review market, custody, protocol, fraud, liquidity, and regulatory risks before treating price as the whole story.",
    icon: "bitcoin",
    links: [
      {
        label: "Crypto assets",
        source: "Investor.gov",
        href: "https://www.investor.gov/additional-resources/spotlight/crypto-assets",
        tier: "primary",
      },
      {
        label: "Crypto assets overview",
        source: "FINRA",
        href: "https://www.finra.org/investors/investing/investment-products/crypto-assets/overview",
        tier: "authoritative",
      },
      {
        label: "Cryptocurrency",
        source: "Grokipedia",
        href: "https://grokipedia.com/page/Cryptocurrency",
        tier: "supplemental",
      },
    ],
  },
  {
    id: "return-measurement",
    pathId: "go-deeper",
    topic: "compounding",
    title: "CAGR and personal return",
    kicker: "One number, many paths",
    description:
      "Learn what an annualized growth rate summarizes and why cash-flow timing and volatility can make an investor's experience different.",
    icon: "sliders",
    links: [
      {
        label: "Performance claims and hypothetical results",
        source: "Investor.gov",
        href: "https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-47",
        tier: "primary",
      },
      {
        label: "Compound annual growth rate",
        source: "Grokipedia",
        href: "https://grokipedia.com/page/Compound_annual_growth_rate",
        tier: "supplemental",
      },
    ],
  },
  {
    id: "options",
    pathId: "go-deeper",
    topic: "options",
    title: "Options basics",
    kicker: "Contracts, leverage, and time",
    description:
      "Learn calls, puts, strike price, premium, expiration, time decay, and why direction alone does not determine an outcome.",
    icon: "sliders",
    links: [
      {
        label: "Options: from A to Z",
        source: "FINRA",
        href: "https://www.finra.org/investors/insights/options-z-basics-greeks",
        tier: "authoritative",
      },
      {
        label: "Option in finance",
        source: "Grokipedia",
        href: "https://grokipedia.com/page/Option_(finance)",
        tier: "supplemental",
      },
    ],
  },
  {
    id: "terminology",
    pathId: "go-deeper",
    topic: "general",
    title: "Investing terminology",
    kicker: "Build a shared vocabulary",
    description:
      "Use a broad glossary when a ticker, account, market, or product term is unfamiliar.",
    icon: "book",
    links: [
      {
        label: "Investor glossary",
        source: "Investor.gov",
        href: "https://www.investor.gov/introduction-investing/investing-basics/glossary",
        tier: "primary",
      },
    ],
  },
];

const DEFAULT_PATH_ID: EducationPathId = "start-here";

export function inferEducationTopic(question: string): EducationTopic {
  const normalized = question.toLowerCase();
  const matchers: Array<[EducationTopic, RegExp]> = [
    ["compounding", /\bcompound(?:ing|ed)?|cagr|future value|annualized\b/u],
    ["diversification", /\bdiversif|asset allocation|correlation|portfolio mix\b/u],
    ["volatility", /\bvolatil|price swing|drawdown|bear market|bull market|beta\b/u],
    ["inflation", /\binflation|purchasing power|real return|nominal return\b/u],
    [
      "dollar-cost-averaging",
      /\bdollar.?cost|dca|regular contributions?|same amount each week|periodic investing\b/u,
    ],
    [
      "market-timing",
      /\bmarket timing\b|\btime in the market\b|\b(?:best|strong(?:est)?) (?:market )?days?\b|\bmissing (?:the |a few )?(?:best|strong(?:est)?) days?\b/iu,
    ],
    ["options", /\boptions?|calls?|puts?|strike price|expiration|delta|theta\b/u],
    ["crypto", /\bcrypto|bitcoin|btc|ether|ethereum|eth|protocol risk\b/u],
    ["etfs", /\betfs?|exchange.?traded fund|expense ratio|tracking difference\b/u],
    ["stocks", /\bstocks?|shares?|equity|equities|company ownership\b/u],
    [
      "risk",
      /\brisk|loss|lose money|liquidity|concentration|emergency savings\b/u,
    ],
  ];
  return (
    matchers.find(([, pattern]) => pattern.test(normalized))?.[0] ??
    "general"
  );
}

export function educationPath(
  pathId: EducationPathId,
): EducationPath {
  return (
    EDUCATION_PATHS.find((candidate) => candidate.id === pathId) ??
    EDUCATION_PATHS[0]
  );
}

export function educationPrompts(
  pathId: EducationPathId,
  experience: ExperienceLevel,
): EducationPrompt[] {
  return educationPath(pathId).promptSets[experience];
}

export function educationResources(
  pathId: EducationPathId,
): EducationResource[] {
  return EDUCATION_RESOURCES.filter(
    (resource) => resource.pathId === pathId,
  );
}

export function educationPathForTopic(
  topic: EducationTopic,
): EducationPathId {
  return (
    EDUCATION_RESOURCES.find((resource) => resource.topic === topic)?.pathId ??
    DEFAULT_PATH_ID
  );
}

export function relatedEducationPrompts(
  topic: EducationTopic,
  experience: ExperienceLevel,
  currentQuestion = "",
): EducationPrompt[] {
  const normalizedCurrent = currentQuestion.trim().toLowerCase();
  const pathId = educationPathForTopic(topic);
  return educationPrompts(pathId, experience)
    .filter(
      (prompt) =>
        prompt.question.trim().toLowerCase() !== normalizedCurrent,
    )
    .slice(0, 3);
}

export function resourceTierLabel(
  tier: EducationResourceTier,
): string {
  switch (tier) {
    case "primary":
      return "Primary resource";
    case "authoritative":
      return "Authoritative education";
    case "research":
      return "Industry research";
    case "supplemental":
      return "Supplemental reading · Grokipedia";
  }
}
