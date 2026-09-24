import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextFor(role: "user" | "admin"): TrpcContext {
  return {
    user: {
      id: role === "admin" ? 99 : 42,
      openId: `${role}-fixture`,
      email: `${role}@example.test`,
      name: role === "admin" ? "Authorized Operator" : "Citizen Fixture",
      loginMethod: "test",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("ECR security boundaries", () => {
  it("rejects operations queue access for a normal citizen", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(caller.operations.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects operations mutations for a normal citizen before any database call", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(caller.operations.update({ incidentId: 1, status: "resolved" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects oversized descriptions and malformed command keys", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(caller.incidents.create({
      category: "other",
      description: "x".repeat(2001),
      commandKey: "bad",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects coordinates that are not numeric strings", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(caller.incidents.create({
      category: "medical",
      description: "A person needs urgent help",
      latitude: "<script>alert(1)</script>",
      commandKey: "valid-command-001",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("does not expose an incident identifier without a valid positive integer", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(caller.incidents.get({ incidentId: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
