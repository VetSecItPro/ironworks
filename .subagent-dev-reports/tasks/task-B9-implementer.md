AGENT: implementer
TASK: B.9 tool-normalize
STATUS: DONE
FILES_CREATED: 2
FILES_MODIFIED: 2
TESTS_ADDED: 26
RED_VERIFIED: YES (22/26 failed against stub; 4 passed vacuously on throw expectations)
GREEN: 177/177 (26 new + 151 pre-existing)
TYPECHECK_PKG: PASS
TYPECHECK_WORKSPACE: PASS
DEPENDENCY_ADDED: ajv@8.18.0
PARALLEL_TOOL_CALLS_VERIFIED: YES (3-call OpenAI + 2-call Anthropic batches, IDs preserved)
BIDIRECTIONAL_ROUND_TRIP: YES (ToolInvocation -> OpenAI wire -> fromProviderToolCall -> ToolInvocation)
COMMENTING: WHY-only inline; JSDoc on all exports

FILES:
  packages/adapter-utils/src/http/tool-normalize.ts       (replaced stub)
  packages/adapter-utils/src/http/__tests__/tool-normalize.test.ts  (new)
  packages/adapter-utils/package.json                     (ajv dep added)

CONCERNS:
  - NodeNext module resolution with esModuleInterop required `import { Ajv }` named
    export instead of default import — `import Ajv from 'ajv'` resolved to the
    namespace object rather than the constructor under NodeNext. Fixed with named import.
  - Ajv validator cache keyed on JSON.stringify(schema) — correct for stable schemas.
    Schemas with undefined values would serialize to different strings; callers should
    ensure schemas are plain JSON-serializable objects (already guaranteed by ToolDefinition type).
