# ADR-0002: Subscription-Aware Rate Limiting

## Status

Accepted

## Context

The original cost governance model relied on cost anomaly detection - flagging usage spikes after they occurred. This was reactive: by the time an alert fired, budget damage was already done. Multi-tenant deployments need proactive enforcement that prevents overspend rather than reporting it. Additionally, different subscription tiers (free, pro, enterprise) require different rate limits, token budgets, and model access.

## Decision

Replace the cost anomaly detection system with a subscription-aware rate limiter that enforces limits before requests reach LLM providers.

Key design points:

1. **Per-company rate limits** derived from subscription tier. Each tier defines requests-per-minute, tokens-per-day, and allowed model list.
2. **Sliding window counters** using in-memory stores (with optional Redis backing for multi-instance deployments).
3. **Graceful degradation** - when a company approaches its limit, the system downgrades model selection (e.g., from opus to sonnet) before hard-blocking.
4. **Budget alerts** fire at 50%, 80%, and 95% of period budget, routed to the company's CFO agent or admin channel.
5. **Override capability** - instance admins can temporarily raise limits for a company without changing their subscription tier.

## Consequences

### Positive

- Prevents bill shock for both operator and tenants.
- Enables self-service tier upgrades as a revenue path.
- Model routing per tier keeps costs predictable per customer.
- Budget alerts give companies time to adjust usage before hitting hard limits.

### Negative

- Adds latency to every LLM request (rate limit check).
- Sliding window state must be durable across server restarts for fairness.
- Tier configuration is another surface area to maintain.

### Neutral

- Cost anomaly detection code can be removed or repurposed as an audit-only reporting layer.
