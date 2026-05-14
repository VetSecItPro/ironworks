# API reference

The canonical API surface is the Express route handlers under
`server/src/routes/`. A stale `doc/openapi.yaml` previously documented
11 of ~456 routes (<3% coverage) and was deleted on 2026-05-14 to
prevent it from being mistaken for an authoritative reference.

To enumerate the current routes locally:

```bash
grep -rn "router\.\(get\|post\|put\|patch\|delete\)" server/src/routes/
```

Every route file is small and self-documenting. Auth gates are
explicit (`assertCompanyAccess`, `assertCanWrite`, `requireInstanceAdmin`)
and easy to grep. Request/response shapes are Zod schemas at the top
of each handler.

If a partner or customer needs a structured API reference, regenerate
on demand. Don't reintroduce a hand-maintained spec - it drifted to
<3% coverage in the previous iteration. Use a route-introspection
emitter (e.g. tsoa, express-zod-api) or hand the consumer the route
files directly.

Closes SEC-API-HIGH-007 (see `docs/adr/2026-05-10-sec-deferred-decisions.md`).
