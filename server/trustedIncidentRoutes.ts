import type { Express, Request, Response } from "express";
import {
  authenticateBearerToken,
  assignTrustedIncident,
  CommandError,
  createTrustedIncident,
  listTrustedOperations,
  upsertOrganizationMembership,
  respondToTrustedAssignment,
  transitionTrustedIncident,
} from "./trustedIncidentCommands";

function sendCommandError(res: Response, error: unknown) {
  if (error instanceof CommandError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  console.error("[TrustedCommands] unexpected error", error);
  res.status(500).json({ error: "Trusted command failed.", code: "INTERNAL" });
}

async function withPrincipal(req: Request, res: Response) {
  try {
    return await authenticateBearerToken(req.header("authorization"));
  } catch (error) {
    sendCommandError(res, error);
    return null;
  }
}

export function registerTrustedIncidentRoutes(app: Express) {
  app.post("/api/v1/incidents", async (req, res) => {
    const principal = await withPrincipal(req, res);
    if (!principal) return;
    try {
      const result = await createTrustedIncident({ principal, ...req.body });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      sendCommandError(res, error);
    }
  });

  app.post("/api/v1/incidents/:incidentId/transition", async (req, res) => {
    const principal = await withPrincipal(req, res);
    if (!principal) return;
    try {
      const result = await transitionTrustedIncident({
        principal,
        incidentId: req.params.incidentId,
        nextStatus: req.body?.nextStatus,
        expectedVersion: req.body?.expectedVersion,
        commandKey: req.body?.commandKey,
        note: req.body?.note,
      });
      res.status(200).json(result);
    } catch (error) {
      sendCommandError(res, error);
    }
  });

  app.post("/api/v1/incidents/:incidentId/assign", async (req, res) => {
    const principal = await withPrincipal(req, res);
    if (!principal) return;
    try {
      const result = await assignTrustedIncident({
        principal,
        incidentId: req.params.incidentId,
        responderUid: req.body?.responderUid,
        organizationId: req.body?.organizationId,
        commandKey: req.body?.commandKey,
        note: req.body?.note,
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      sendCommandError(res, error);
    }
  });

  app.post("/api/v1/assignments/:assignmentId/respond", async (req, res) => {
    const principal = await withPrincipal(req, res);
    if (!principal) return;
    try {
      const result = await respondToTrustedAssignment({
        principal,
        assignmentId: req.params.assignmentId,
        decision: req.body?.decision,
        commandKey: req.body?.commandKey,
        note: req.body?.note,
      });
      res.status(200).json(result);
    } catch (error) {
      sendCommandError(res, error);
    }
  });

  app.get("/api/v1/operations/queue", async (req, res) => {
    const principal = await withPrincipal(req, res);
    if (!principal) return;
    try {
      res.status(200).json({ incidents: await listTrustedOperations(principal) });
    } catch (error) {
      sendCommandError(res, error);
    }
  });

  app.post("/api/v1/organizations/:organizationId/memberships", async (req, res) => {
    const principal = await withPrincipal(req, res);
    if (!principal) return;
    try {
      const result = await upsertOrganizationMembership({
        principal,
        uid: req.body?.uid,
        organizationId: req.params.organizationId,
        jurisdictionId: req.body?.jurisdictionId,
        role: req.body?.role,
      });
      res.status(200).json(result);
    } catch (error) {
      sendCommandError(res, error);
    }
  });
}
