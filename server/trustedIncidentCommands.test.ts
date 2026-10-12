import { describe, expect, it } from "vitest";
import {
  authenticateBearerToken,
  CommandError,
  isAllowedIncidentTransition,
} from "./trustedIncidentCommands";

describe("trusted incident command boundaries", () => {
  it("allows only explicit operational state transitions", () => {
    expect(isAllowedIncidentTransition("received", "triaged")).toBe(true);
    expect(isAllowedIncidentTransition("triaged", "assigned")).toBe(true);
    expect(isAllowedIncidentTransition("resolved", "closed")).toBe(true);
    expect(isAllowedIncidentTransition("received", "resolved")).toBe(false);
    expect(isAllowedIncidentTransition("closed", "responding")).toBe(false);
  });

  it("requires a Firebase bearer token before touching backend services", async () => {
    await expect(authenticateBearerToken(undefined)).rejects.toMatchObject<Partial<CommandError>>({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });

  it("rejects an empty bearer token", async () => {
    await expect(authenticateBearerToken("Bearer ")).rejects.toMatchObject<Partial<CommandError>>({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });
});
