import type { Express, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticateBearerToken,
  CommandError,
  createTrustedIncident,
  type CommandPrincipal,
} from "./trustedIncidentCommands";
import { registerTrustedIncidentRoutes } from "./trustedIncidentRoutes";

vi.mock("./trustedIncidentCommands", async importOriginal => ({
  ...(await importOriginal<typeof import("./trustedIncidentCommands")>()),
  authenticateBearerToken: vi.fn(),
  createTrustedIncident: vi.fn(),
}));

const principal = {
  uid: "authenticated-reporter",
  email: "reporter@example.test",
  role: "citizen",
  organizationId: null,
  jurisdictionId: null,
  memberships: [],
  token: { uid: "authenticated-reporter" },
} as unknown as CommandPrincipal;

function createRoute() {
  const post = vi.fn();
  registerTrustedIncidentRoutes({ post, get: vi.fn(), delete: vi.fn() } as unknown as Express);
  const handler = post.mock.calls.find(([path]) => path === "/api/v1/incidents")?.[1] as
    (req: Request, res: Response) => Promise<void>;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { handler, res };
}

describe("trusted incident creation route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authenticateBearerToken).mockResolvedValue(principal);
    vi.mocked(createTrustedIncident).mockResolvedValue({
      id: "incident-fixture",
      publicReference: "ECR-2026-ABC123",
      replayed: false,
    });
  });

  it("uses the authenticated identity even when the body supplies another principal", async () => {
    const { handler, res } = createRoute();
    const body = {
      category: "medical",
      description: "A person needs urgent help",
      commandKey: "report-fixture-001",
      reporterPhone: "+2348000000000",
      principal: { uid: "victim", role: "admin", jurisdictionId: "forged-area" },
      status: "resolved",
    };

    await handler({ body, header: () => "Bearer fixture" } as unknown as Request, res as unknown as Response);

    expect(authenticateBearerToken).toHaveBeenCalledWith("Bearer fixture");
    expect(createTrustedIncident).toHaveBeenCalledWith({
      principal,
      category: body.category,
      description: body.description,
      commandKey: body.commandKey,
      reporterPhone: body.reporterPhone,
      reporterName: undefined,
      locationLabel: undefined,
      latitude: undefined,
      longitude: undefined,
      reporterEmail: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("never creates an incident when authentication fails", async () => {
    const { handler, res } = createRoute();
    vi.mocked(authenticateBearerToken).mockRejectedValue(new CommandError("UNAUTHENTICATED", "Session expired."));

    await handler({ body: {}, header: () => undefined } as unknown as Request, res as unknown as Response);

    expect(createTrustedIncident).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
