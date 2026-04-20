# Provider Settings - Configuring API Keys

This guide explains how workspace owners configure provider API keys so agents can call
external LLMs (Poe, Anthropic, OpenAI, OpenRouter) through IronWorks.

## Why centralize keys per workspace

Each IronWorks company (workspace) maintains its own key store. Centralizing keys at the
workspace level means:

- **One rotation point** - rotate once, every agent picks it up immediately.
- **Zero per-agent config** - agents reference the provider by type; they never hold a key.
- **Least-privilege scope** - keys are encrypted at rest with a workspace-scoped DEK.
  A compromised agent session cannot exfiltrate the raw key.
- **Clean audit trail** - every key write and test is logged via `logActivity`.

Provider keys can also be supplied as environment variables (`ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, etc.) for CI/CD pipelines. The precedence order is:

1. **Workspace DB row** (highest) - set via Settings UI.
2. **Environment variable** (`{PROVIDER}_API_KEY`) - fallback for dev/CI.
3. **None** - agent run fails with a clear error; no silent degradation.

Workspace keys override env vars. Use env vars for staging/CI; use the Settings UI for
production workspaces.

---

## Accessing the Settings page

1. Open your company in IronWorks.
2. Navigate to **Settings** in the left sidebar.
3. Select the **Providers** tab.

> **Required role:** `owner` or `operator`.
> Members with the `viewer` role see the provider list with masked last-4 values only.
> They cannot add, update, remove, or test keys.

---

## Supported providers

### Poe
- **Signup:** https://poe.com/api_key
- **Key prefix:** `sk-poe-`
- **Notes:** Subscription account required. Key grants access to all models available
  on your Poe tier (GPT-4o, Claude, Gemini, etc.).

### Anthropic
- **Signup:** https://console.anthropic.com/settings/keys
- **Key prefix:** `sk-ant-`
- **Notes:** Billed per token. Supports Claude Haiku, Sonnet, Opus, and future variants.
  Ensure your account has sufficient credit or a payment method on file.

### OpenAI
- **Signup:** https://platform.openai.com/api-keys
- **Key prefix:** `sk-`
- **Notes:** Billed per token. The key prefix `sk-` is shared across project keys and
  service account keys; both are supported. Enable usage limits in the OpenAI dashboard
  to avoid runaway costs.

### OpenRouter
- **Signup:** https://openrouter.ai/keys
- **Key prefix:** `sk-or-v1-`
- **Notes:** Routes to 200+ models from a single key. Useful if you want agents to use
  different underlying models without managing separate provider accounts.

---

## Saving a key

1. On the **Providers** tab, locate the provider card.
2. Paste your API key into the **API Key** field.
3. Click **Save**.
4. Click **Test connection**.
5. Wait for the result:
   - **PASS** - key is valid and the provider is reachable. The card shows the last-4
     characters of the key as confirmation.
   - **FAIL** - see the [Troubleshooting](#troubleshooting) section below.

The raw key is never displayed again after saving. Only the last-4 characters are shown
in the UI as a visual confirmation that a key exists.

---

## Rotating a key

Entering a new key and clicking **Save** replaces the previous key immediately. There is
no dual-valid window - the old key is overwritten in a single atomic DB write. If the new
key fails the connection test, you must re-enter a working key; IronWorks does not retain
the previous value.

**Rotation checklist:**

1. Generate a new key in your provider's dashboard.
2. Paste it into the Settings UI and click **Save**.
3. Run **Test connection** and confirm **PASS**.
4. Revoke the old key in your provider's dashboard.

---

## Removing a key

Click **Remove** on the provider card. The row is soft-deleted via `disabled_at` - the
ciphertext is retained for audit purposes but the resolver treats the provider as
unconfigured.

Any agent whose adapter type references the removed provider will fail its next run with
a clear error (`No valid API key found for provider: {provider}`). To restore service,
save a new key for that provider.

---

## Security details

| Property | Implementation |
|---|---|
| Storage | AES-256-GCM envelope encryption at rest. A per-row DEK is encrypted with `IRONWORKS_SECRETS_KEK_B64` (your server's master key). Only the ciphertext lives in the DB. |
| Transit | HTTPS only. The key is transmitted to the server once on save and never returned in any API response. |
| UI display | Last-4 characters only. The full key is never echoed. |
| Scope | RLS restricts DB rows to your workspace. An operator in workspace A cannot read workspace B's keys at either the API or DB layer. |
| Audit log | Every create, update, and remove is written to `logActivity` with actor, timestamp, and masked key suffix. |
| Kill-switch | Set `ADAPTER_DISABLE_{PROVIDER}=1` on the server to disable a provider platform-wide without touching the DB. |

> **Server requirement:** `IRONWORKS_SECRETS_KEK_B64` must be set. Generate a 32-byte
> random key:
>
> ```bash
> openssl rand -base64 32
> ```
>
> Store this in your production secret manager (AWS Secrets Manager, Doppler, etc.).
> If this variable is unset, the server will refuse to start.

---

## Troubleshooting

### 401 Unauthorized
The key is invalid or has been revoked. Verify the key in your provider's dashboard,
then re-enter it. Common causes: copy/paste trailing whitespace, key deleted upstream,
or wrong key for the environment (e.g. a test-mode key used in prod).

### 429 Too Many Requests
You have hit your provider's rate limit. IronWorks will retry with exponential backoff
up to 3 times, then fail the run. Options:
- Wait and retry the test manually.
- Request a rate-limit increase from your provider.
- Set `{PROVIDER}_RATE_LIMIT_PER_MIN` to a lower value so IronWorks self-throttles
  before hitting the provider ceiling.

### 500 / Provider outage
The provider is experiencing an outage. Check their status page:
- Poe: https://poe.com
- Anthropic: https://status.anthropic.com
- OpenAI: https://status.openai.com
- OpenRouter: https://status.openrouter.ai

No action needed on your end. IronWorks will succeed on the next agent run once the
provider recovers.

### Test passes but agents still fail
Verify the agent's adapter type is set to the provider you configured. An agent using
`claude-local` will not use the Anthropic HTTP key - switch the agent's adapter to
`anthropic-api` in the agent config.

---

## Related docs

- [HTTP Adapter Family overview](../HTTP-ADAPTER-FAMILY.md) - architecture and adapter
  comparison
- [Creating an adapter](../adapters/creating-an-adapter.md) - writing a new HTTP adapter
- [Porting to upstream](../porting-to-upstream.md) - contributing this code back
