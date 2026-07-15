# Morrowward privacy disclosure

Morrowward is local-first and does not require an account. Plan inputs, simulated cash, practice holdings, and transaction history are stored in the user's browser. Market Journey calculations use those local plan values and ephemeral display controls; they do not request external market data or send the resulting synthetic path anywhere. Exported backups leave the browser only when the user explicitly saves or imports a file.

When the optional educator is used, Morrowward sends the question, selected experience level, requested education topic, and—if a client supplies it—only the bounded illustrative fields accepted by the API contract: years remaining, weekly contribution, illustrative return, and illustrative inflation. It does not send names, email addresses, birthdates, brokerage credentials, actual holdings, transaction history, starting balance, or Dave's personal story.

The server rejects obvious Social Security, payment-card, bank-account, routing, passport, and government-ID patterns before calling OpenAI. This narrow filter reduces accidental disclosure but cannot identify every form of personal or sensitive information. Users should not enter private information in educator questions.

Morrowward sends OpenAI Responses API requests with `store: false`. That prevents response application-state storage for the request, but it is not the same as Zero Data Retention. OpenAI's default API controls may retain prompts and responses in abuse-monitoring logs for up to 30 days, or longer when legally required. Eligible API organizations can apply for Modified Abuse Monitoring or Zero Data Retention. OpenAI also states that API data is not used to train its models by default unless the organization explicitly opts in. Current details are in [OpenAI's API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint).

Daily-brief generation sends only the app's fixed, delayed educational sample facts—not a user's plan, educator question, or practice activity. The optional durable brief store contains only the validated generated brief and uses a date-keyed 48-hour expiry.

If the OpenAI key or network is unavailable, the educator uses deterministic fallback content. If the optional brief store is absent or unavailable, the app safely serves its in-process/deterministic brief. Morrowward does not contain a path for real trades and does not send portfolio data to a brokerage.
