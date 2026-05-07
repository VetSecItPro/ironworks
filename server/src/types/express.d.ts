export {};

declare global {
  namespace Express {
    interface Request {
      actor: {
        type: "board" | "agent" | "none";
        userId?: string;
        agentId?: string;
        companyId?: string;
        companyIds?: string[];
        isInstanceAdmin?: boolean;
        /**
         * Whether the underlying user's email is verified. Only populated for
         * board actors backed by a real session/user (not local_implicit, not
         * agent tokens). `undefined` means "not applicable" (e.g. local board,
         * agent JWT) and MUST be treated permissively. `false` means the
         * actor is a real user whose email has not yet been verified.
         */
        emailVerified?: boolean;
        keyId?: string;
        runId?: string;
        source?: "local_implicit" | "session" | "board_key" | "agent_key" | "agent_jwt" | "none";
      };
    }
  }
}
