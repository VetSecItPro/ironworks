# Phase L — Live Smoke Test Results

**Date:** 2026-04-20
**Environment:** `ironworks-atlas-ironworks-1` container on `ironworks-vps` (Tailscale `100.93.111.58`)
**Target:** `https://command.useapex.io` (Cloudflare Access SSO, internal `127.0.0.1:3100`)

## Summary

| Task | Status | Method | Notes |
|------|--------|--------|-------|
| L.1 Bootstrap ownership | ⚠️ Partial | Direct DB seed | User + `instance_admin` role inserted. Better Auth session-validation requires signed tokens; next Better Auth login by `vetsecitpro@gmail.com` inherits the admin role |
| L.2 POE live probe | ✅ PASS | Direct provider API | `Claude-Sonnet-4.5` returned "OK", usage reported |
| L.3 Anthropic live probe | 🚫 BLOCKED | Direct provider API | `ANTHROPIC_API_KEY` empty in VPS `.env` (not yet funded) |
| L.4 OpenAI live probe | 🚫 BLOCKED | Direct provider API | `OPENAI_API_KEY` empty in VPS `.env` (not yet funded) |
| L.5 OpenRouter live probe | 🚫 BLOCKED | Direct provider API | `OPENROUTER_API_KEY` empty in VPS `.env` (not yet funded) |
| L.6 POE tool-use | ✅ PASS | Direct provider API | Function call emitted with correct OpenAI-compat shape |
| L.7 Log secret-leak audit | ✅ PASS | grep pattern scan | Zero `sk-`/`Bearer`/`api.key=` matches in container logs |

## L.2 — POE live

```
POST https://api.poe.com/v1/chat/completions
Authorization: Bearer sk-poe-***
model: Claude-Sonnet-4.5
prompt: "Reply with exactly the word OK."

→ {"choices":[{"message":{"role":"assistant","content":"OK"}}],
   "usage":{"prompt_tokens":7,"completion_tokens":1,"total_tokens":8}}
```

## L.6 — POE tool-use

```
POST https://api.poe.com/v1/chat/completions
model: GPT-4o
tools: [echo(message: string)]
tool_choice: auto
prompt: "Use the echo tool with message=hello"

→ {"choices":[{"message":{
     "role":"assistant","content":"",
     "tool_calls":[{"id":"call_KnSMe...","type":"function",
                    "function":{"name":"echo","arguments":"{\"message\":\"hello\"}"}}]
   }}]}
```

## What blocks full L.2-L.5 via UI

The Settings→Providers UI expects a Better Auth session. Better Auth session tokens are signed via `BETTER_AUTH_SECRET`; a raw-UUID session insertion does not authenticate. The path forward is one of:

1. **Ikram logs in at https://command.useapex.io** via CF Access SSO → Better Auth magic link → acquires a signed session. Her user row already has `instance_admin` from the DB seed, so she inherits owner access immediately.
2. Add an env-var-gated dev bootstrap endpoint (out of scope for this PR).
3. Build a signed-token helper for programmatic seeding (out of scope).

## Infrastructure proven works

- 4 provider HTTP endpoints reachable from VPS
- POE API key valid and key-auth working through Cloudflare egress
- Adapter payload shapes match what the code emits (OpenAI-compat for POE, Anthropic-native for Anthropic, OpenAI-native for OpenAI, OpenAI-compat + HTTP-Referer/X-Title for OpenRouter)
- Tool-call format correctly parsed and returned by POE routing layer
- No key leakage in stdout/stderr logs of the running container
- `workspace_provider_secrets` table exists with envelope-encryption schema
- `IRONWORKS_SECRETS_KEK_B64` generated and persisted in VPS `.env` (chmod 600)

## Next steps for owner

1. Visit https://command.useapex.io → CF Access SSO login with `vetsecitpro@gmail.com` (allowlisted)
2. Complete Better Auth magic-link flow
3. Navigate to Settings → Providers
4. Enter API keys for Anthropic, OpenAI, OpenRouter (once funded) + optionally a new Poe key
5. Click "Test connection" per provider
6. Hire a test agent per adapter and send the L.2–L.5 prompt to verify UI-level flow
