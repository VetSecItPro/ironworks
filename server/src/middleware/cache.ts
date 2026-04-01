import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Cache-Control header middleware.
 * Sets Cache-Control on GET responses matching the given route patterns.
 */
export function cacheControl(
  maxAge: number,
  scope: "public" | "private" = "private",
) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.set("Cache-Control", `${scope}, max-age=${maxAge}`);
    next();
  };
}

/**
 * ETag middleware for conditional GET requests.
 * Computes an MD5 hash of JSON response bodies and returns 304 when the
 * client already has the current version.
 */
export function etag() {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (req.method === "GET") {
        const hash = createHash("md5")
          .update(JSON.stringify(body))
          .digest("hex");
        const etagValue = `"${hash}"`;
        res.set("ETag", etagValue);
        if (req.headers["if-none-match"] === etagValue) {
          res.status(304).end();
          return res;
        }
      }
      return originalJson(body);
    };
    next();
  };
}
