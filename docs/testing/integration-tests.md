# HTTP Adapter Integration Tests

The integration test harness fires one real API call per HTTP adapter to verify live
connectivity end-to-end. It is a liveness probe, not a regression suite - it confirms
that keys are valid, the adapter wires correctly, and the response path returns a usage
summary.

## Prerequisites

At least one of the following environment variables must be set. Adapters whose key is
absent are skipped automatically - they do not cause the run to fail.

| Adapter | Environment variable |
|---|---|
| `poe_api` | `POE_API_KEY` |
| `anthropic_api` | `ANTHROPIC_API_KEY` |
| `openai_api` | `OPENAI_API_KEY` |
| `openrouter_api` | `OPENROUTER_API_KEY` |

## Setting keys

**Option A - shell exports (ephemeral, recommended for one-off runs):**

```bash
export POE_API_KEY="sk-poe-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-proj-..."
export OPENROUTER_API_KEY="sk-or-v1-..."
```

**Option B - `.env.local` at repo root (persistent, gitignored):**

```
POE_API_KEY=sk-poe-...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
OPENROUTER_API_KEY=sk-or-v1-...
```

`tsx` picks up `.env.local` automatically via Node's `--env-file` flag if you pass it
explicitly, or you can load it with `dotenv` before running. The simplest approach is
shell exports.

## Running

```bash
pnpm test:integration
```

Equivalent to:

```bash
tsx scripts/test-integration-http-adapters.ts
```

## Expected output shape

```
IronWorks HTTP Adapter Integration Test Harness
================================================
Prompt : "Reply with exactly the word OK"
MaxTok : 100

------------------------------------------------------------
  Adapter: poe_api  (model: claude-haiku-4-5)
------------------------------------------------------------
  PASS
  durationMs   : 1243
  inputTokens  : 12
  outputTokens : 2
  costCents    : 0.0003

------------------------------------------------------------
  Adapter: anthropic_api  (model: claude-haiku-4-5)
------------------------------------------------------------
  PASS
  durationMs   : 987
  inputTokens  : 12
  outputTokens : 2
  costCents    : 0.0003

------------------------------------------------------------
  Adapter: openai_api  (model: gpt-5-mini)
------------------------------------------------------------
  SKIP — env key not set

------------------------------------------------------------
  Adapter: openrouter_api  (model: google/gemini-2.5-flash)
------------------------------------------------------------
  PASS
  durationMs   : 1101
  inputTokens  : 12
  outputTokens : 2
  costCents    : 0.0001

------------------------------------------------------------
  SUMMARY
------------------------------------------------------------
  PASS   poe_api
  PASS   anthropic_api
  SKIP   openai_api
  PASS   openrouter_api

3/3 attempted adapters passed. 1 skipped (no key).
```

Exit code is `0` when all attempted adapters pass, `1` if any attempted adapter fails.
A SKIP never causes a non-zero exit.

## Cost estimate

Each run fires at most 4 API calls with `max_tokens: 100` and a 5-token prompt.
Approximate cost:

| Provider | Model | Estimated cost/run |
|---|---|---|
| Poe | claude-haiku-4-5 | ~$0.0003 |
| Anthropic | claude-haiku-4-5 | ~$0.0003 |
| OpenAI | gpt-5-mini | ~$0.0002 |
| OpenRouter | gemini-2.5-flash | ~$0.0001 |
| **Total (all 4)** | | **~$0.001** |

A full run with all four keys set costs approximately $0.001 - $0.01.

## CI note

This harness is NOT wired into GitHub Actions CI. Running it in CI would require live
API keys as secrets and incur real cost on every PR. It is a manual gate - run it
before cutting a release or after a significant change to adapter HTTP logic.

To run it in CI intentionally, add the keys as repository secrets and create a separate
workflow job that calls `pnpm test:integration`. Guard it with `if: github.ref ==
'refs/heads/main'` or a manual trigger (`workflow_dispatch`) to avoid running on every PR.
