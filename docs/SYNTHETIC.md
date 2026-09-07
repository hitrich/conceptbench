# Experimental synthetic comparisons

ConceptLab works with human CSV feedback even when no model is configured. All bundled ratings are fabricated and prominently labeled. Real feedback imports require anonymous respondent IDs, study/concept version IDs, a single question ID, a 1–5 rating, a collection timestamp with offset, a recruitment description and an explicit consent/relevance confirmation. Invalid rows return errors and save nothing. Neither a CSV upload nor a high synthetic score establishes demand.

## Optional provider configuration

The only generation provider implemented is OpenAI's fixed HTTPS API origin. Configure these **server-side** values in the private deployment environment:

```dotenv
MODEL_API_KEY=YOUR_PRIVATE_PROVIDER_KEY
MODEL_NAME=YOUR_SUPPORTED_MODEL
EMBEDDING_MODEL=text-embedding-3-small
MODEL_INPUT_USD_PER_MILLION=YOUR_CURRENT_INPUT_PRICE
MODEL_OUTPUT_USD_PER_MILLION=YOUR_CURRENT_OUTPUT_PRICE
EMBEDDING_USD_PER_MILLION=YOUR_CURRENT_EMBEDDING_PRICE
```

Use a model supporting Chat Completions, JSON-schema structured output, and `max_completion_tokens`. Consult the provider's current model capabilities and pricing; the app deliberately has no default generation model or price assumptions. Restart web and worker together after changes. A compatible live model response and current prices still require operator verification; repository tests use a mock transport and do not spend provider credits.

The user selects 1–10 synthetic draws per concept and an explicit USD cap within the owner's project limit. The app freezes concept stimuli and versions, audience, question, model names, two five-point anchor sets, upstream SSR revision, prices and budget metadata at run creation. Human CSV comments and customer activity are not inserted into provider prompts. The selected audience/concept descriptions and generated reactions are sent to the configured provider; users must confirm they contain no sensitive customer data.

## Methods and saved evidence

Every concept uses isolated contexts in a fixed order. The comparison includes direct Likert prompting, a Likert follow-up after a free-text reaction, and SSR applied to the same reaction. A pooled development-human distribution is calculated when compatible development data exists. Related concept groups cannot cross development/held-out splits. Anchors are fixed and cannot be tuned against held-out labels through the UI.

SSR calls the **unmodified** NumPy kernel from `pymc-labs/semantic-similarity-rating`, version 1.1.0, commit `86dcd2597c7824e4fd6546b884c5500c43a4b022`. Five finite nonzero anchor vectors are required; equal/degenerate similarities fail instead of producing an invented rating. See [upstream provenance and license](../backend/core/vendor/ssr/NOTICE.md).

Responses are stored before aggregation and can be inspected in ConceptLab. Distributions and means are descriptive. Wasserstein distances compare aligned rating distributions. Ordering agreement is unavailable with fewer than five shared concepts or near ties, and remains descriptive otherwise. Partial or unbalanced runs do not produce a ranked shortlist. No calibrated agreement threshold, bootstrap uncertainty benchmark, persona realism, willingness-to-pay inference, or SaaS domain validation is claimed.

## Spending and failures

The worker runs requests serially. Before each dispatch it locks the run, checks cancellation/permission/lease, and reserves a conservative request bound using frozen prices, UTF-8 input bytes plus framing, and a 300-token output cap. It settles reported usage after success. The hard ceiling is 201 requests for the largest supported run, including anchor and reaction embeddings.

A timeout or crash after submission is an **uncertain provider outcome**. The reserved cost remains accounted for and that request is not blindly replayed. Resume preserves completed responses and does not charge again for them. The lease uses a fencing token, heartbeat and bounded attempts. Cancellation prevents further dispatch; an already submitted provider request can still complete or be billed. Owner budget reductions are checked before subsequent calls. Provider-side spending limits are still useful because the app cannot control billing outside these requests or compensate for incorrectly configured prices.

The credential-free checks cover scoring goldens, complete mocked runs, budget exhaustion, cancellation, revoked access, crash recovery and ambiguous-cost accounting. Promoting synthetic output beyond “experimental” requires a separately recruited, consented human benchmark with fixed stimuli/questions, grouped held-out data, repeated model draws, prespecified metrics and independent evaluation. That empirical work is a release gate.
