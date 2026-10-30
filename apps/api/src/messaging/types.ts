import type { Request } from "express";

/**
 * Abstraction over the inbound SMS provider. Phase 1 implements this for
 * Twilio (see ./twilio.ts); a conditional future Phase 3 SendBlue swap is a
 * new sibling file implementing the same interface — handler.ts never
 * needs to change.
 */
export interface MessagingProvider {
  parseInbound(req: Request): { from: string; body: string };
  verify(req: Request): boolean;
  send(to: string, body: string): Promise<void>;
}
