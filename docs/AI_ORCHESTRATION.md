# AI orchestration and media provenance

Morrowward uses a small, bounded team of AI systems for the jobs they are best
suited to perform. The product does **not** hand financial calculations or user
decisions to a model.

## What orchestrated the build

The primary Codex build session runs GPT-5.6 Sol. Codex decomposed product
feedback into parallel, reviewable workstreams, assigned focused implementation
and review tasks to subagents, inspected their changes in the shared repository,
and consolidated only the work that passed the project's contracts and tests.

For the July 15 practice-market and media pass, the workstreams were:

- daily quote contracts, source validation, persistence migration, and API tests;
- the automatically updated practice-market interface and accessible asset-detail dialog;
- a new optional xAI image, video, narration, validation, and composition pipeline;
- primary-session integration, security review, visual review, browser QA, and
  release documentation.

This is orchestration, not unsupervised authority. Each subagent received a
bounded task and file scope. The primary Codex session remained responsible for
integration decisions, full-suite verification, and the final commit.

## Where GPT-5.6 appears in the product

GPT-5.6 powers the optional financial-literacy educator, daily educational
brief, and daily public-quote snapshot. The educator receives a bounded
question, experience level, topic, and at most four illustrative planning
values. The quote job instead receives only the fixed eleven-symbol public
allowlist and strict quote contract. Neither request receives a user's complete
plan, portfolio, transaction history, identity, or health story.

The model explains; tested TypeScript calculates. Projection values, simulated
purchases, Market Journey paths, state migration, and portfolio accounting stay
in deterministic code. If the model or network is unavailable, Morrowward keeps
working with deterministic educational fallbacks.

For current market quotes, the primary Production cron makes one batched
Responses API request after the regular U.S. equity session. It requires hosted
`web_search`, uses `store: false` and strict structured output, requests source
metadata, and permits at most one search tool call. Search-backed content is
accepted only after per-asset identity, observation-time, schema, and evidence
validation. A URL citation is attached only to the quote object it annotates;
hosted `oai-finance` evidence receives no invented link. The shared snapshot retains
its update time and freshness; the UI describes it
as **refreshed daily**, never real-time.

The cron is backed by a self-healing first-load path. If a daily snapshot is
missing or stale, one normal quote request may start generation in the
background while visitors continue with saved or synthetic values. The initiating
screen makes two bounded observation-only rechecks so a finished snapshot can
appear without a reload; those reads cannot start another generation. Warm-runtime
singleflight and a 12-hour Redis/KV `NX` retry guard coordinate that work. Normal
reads reuse a successful snapshot for up to 24 hours, while the cron uses a UTC-day
policy to avoid a near-boundary every-other-day skip. Persistent failures retry no
more frequently than once per 12 hours. This uses
GPT-5.6 as a bounded, source-backed retrieval agent—not as an investment model.

Primary references: [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search),
[OpenAI API pricing](https://developers.openai.com/api/docs/pricing), and
[Vercel Cron Jobs](https://vercel.com/docs/cron-jobs/quickstart).

## Why xAI is used for selected media

The optional pipeline is prepared to use xAI's Grok Imagine image and video APIs
as specialized creative tools for motivational media. Codex owns the campaign
brief, prompts, generation calls, validation rules, review rubric, and any
product integration. If selected media ships, it will never supply a quote,
market price, projection, risk score, or financial recommendation.

The complete pipeline was authored from scratch in `scripts/grok/` during this
hackathon. It can:

1. validate campaign manifests before any paid request;
2. generate multiple image candidates from concrete, text-free prompts;
3. request a short visual-only historical interpretation;
4. create narration with a built-in synthetic voice rather than cloning or
   imitating a historical person's voice;
5. compose web-ready video, narration, and captions; and
6. keep raw review candidates outside Git until a candidate passes review.

The workflow is informed by lessons from earlier creative experiments, but no
prior script, prompt file, or generated asset was copied into Morrowward.

## Historical-figure boundary

Any historical greeting is labeled **AI-generated historical interpretation**.
It is not presented as archival footage, an authentic recording, or the person's
real voice. Authentic quotations are kept short, attributed to a specific work,
and checked against a public-domain or primary source. Original connective
dialogue is explicitly part of the interpretation.

The proposed first campaign uses Marcus Aurelius and a line from *Meditations* 5.1 in the
public-domain George Long translation: “I am rising to the work of a human
being.” Any accepted media must also provide a transcript/captions, a non-motion
poster, and user-controlled playback with no autoplay.

Source: [Project Gutenberg, *The Thoughts of the Emperor Marcus Aurelius
Antoninus*](https://www.gutenberg.org/ebooks/6920).

## Review gates

Generated media is a candidate, not an accepted asset. Before integration,
Codex and Dave review original-resolution outputs for:

- malformed anatomy, duplicated objects, pseudo-text, logos, and watermarks;
- historical and product-story fit without implying endorsement;
- contrast, crop safety, mobile layout, and theme compatibility;
- transcript accuracy, audio levels, duration, and reduced-motion behavior;
- truthful AI labeling, source attribution, and non-advice boundaries; and
- file size, format, loading behavior, and offline fallback.

Only selected, optimized derivatives are eligible for `public/`. Raw candidates
remain ignored in `.media-review/`, and secrets remain server- or local-script
only.

## Reproducibility and cost control

The media scripts require `XAI_API_KEY` only in the local shell. They print no
secret values, validate inputs before generation, bound the number and duration
of requests, save machine-readable manifests, and fail without silently
inventing successful output. The key is not used by the browser and is not
needed to run, test, or judge Morrowward.

Official API references:

- [xAI image generation](https://docs.x.ai/developers/model-capabilities/images/generation)
- [xAI video generation](https://docs.x.ai/developers/model-capabilities/video/generation)
- [xAI text-to-speech](https://docs.x.ai/developers/model-capabilities/audio/text-to-speech)
