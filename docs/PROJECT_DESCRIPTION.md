# Devpost project description draft

## Morrowward

**Small steps. A future you can see.**

Morrowward is a local-first financial future simulator built to replace intimidation with hope. It helps adults—especially first-time investors—see how a modest weekly habit might compound over decades, practice investing without risking real money, and learn the concepts behind what they see.

The experience begins with a simple horizon: your current age, the age you are planning toward, a starting balance, and a weekly contribution. Morrowward immediately reveals three editable illustrative scenarios, separates contributions from growth, and shows an inflation-adjusted view. Users can then complete a weekly habit, buy fractional shares of six simulated assets, explore financial-literacy lessons, and ask a bounded GPT-5.6 educator for a plain-language explanation.

The simulator does not rely on AI for math. Its finance engine is deterministic, testable, and available offline. Plans and simulated holdings remain in the browser; no account, brokerage connection, or personal identity is required. The optional GPT-5.6 educator receives a bounded question, experience level, education topic, and at most four illustrative values: years remaining, weekly contribution, return, and inflation. It never receives a starting balance, practice holdings, transaction history, identity, or medical story. Its structured output must explain assumptions, avoid individualized buy/sell instructions, and include an educational disclaimer. When the API is unavailable, Morrowward provides useful deterministic explanations and a cached educational brief.

The mission is personal. At age ten, Dave was diagnosed with Type 1 diabetes and knew he would need to plan for a future with lifelong medical needs. Savings from a paper route bought his first Commodore 64, where daily experiments in BASIC started a path into technology. Morrowward carries that lesson forward: a small repeated action can change what feels possible twenty years from now.

Codex accelerated product definition, architecture, parallel implementation, financial property tests, AI guardrails, accessibility, offline design, documentation, and end-to-end verification. GPT-5.6 powers the bounded educator and daily educational brief; it never calculates projections or executes financial activity.

Morrowward is an educational simulation, not financial, investment, tax, or legal advice. Illustrative results are not guarantees.

## Built with

React, TypeScript, Vite/vinext, Next.js-compatible routes, Dexie/IndexedDB, OpenAI Responses API with GPT-5.6, Vitest, fast-check, Vercel-compatible deployment, and Codex.
