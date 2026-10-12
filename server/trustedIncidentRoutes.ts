import type { Express, Request, Response } from "express";
import {
  authenticateBearerToken,
  assignTrustedIncident,
  CommandError,
  createTrustedIncident,
  expireStaleAssignments,
  listTrustedOperations,
  recordNotificationDelivery,
  upsertOrganizationMembership,
  respondToTrustedAssignment,
  transitionTrustedIncident,
} from "./trustedIncidentCommands";
import { previewRetention } from "./retentionCommands";
import { completeTrustedMediaUpload, createTrustedMediaDownloadUrl, createTrustedMediaIntent, createTrustedMediaUploadUrl, listTrustedIncidentMedia } from "./mediaCommands";
import { processPrivateMediaRetention } from "./mediaRetentionCommands";
import { revokeUserSessions } from "./securityCommands";

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

  app.post("/api/v1/operations/expire-assignments", async (req, res) => {
    const principal = await withPrincipal(req, res);
    if (!principal) return;
    try {
      res.status(200).json(await expireStaleAssignments(principal, req.body?.staleAfterMinutes));
    } catch (error) {
      sendCommandError(res, error);
    }
  });

  app.post("/api/v1/notifications/:deliveryId/outcome", async (req, res) => {
    const principal = await withPrincipal(req, res);
    if (!principal) return;
    try {
      res.status(200).json(await recordNotificationDelivery({
        principal,
        deliveryId: req.params.deliveryId,
        status: req.body?.status,
        errorMessage: req.body?.errorMessage,
      }));
    } catch (error) {
      sendCommandError(res, error);
    }
  });

  app.get("/api/v1/operations/retention/preview", async (req, res) => {
    const principal = await withPrincipal(req, res);
    if (!principal) return;
    try {
      res.status(200).json(await previewRetention(principal));
    } catch (error) {
      sendCommandError(res, error);
    }
  });

  app.post("/api/v1/operations/media-retention", async (req, res) => {
    const principal = await withPrincipal(req, res);
    if (!principal) return;
    try {
      res.status(200).json(await processPrivateMediaRetention(principal, req.body?.execute === true));
    } catch (error) {
      sendCommandError(res, error);
    }
  });

  app.post("/api/v1/security/me/revoke-sessions", async (req, res) => {
    const principal = await withPrincipal(req, res);
    if (!principal) return;
    try {
      res.status(200).json(await revokeUserSessions(principal, principal.uid));
    } catch (error) {
      sendCommandError(res, error);
    }
  });

  app.post("/api/v1/security/users/:uid/revoke-sessions", async (req, res) => {
    const principal = await withPrincipal(req, res);
    if (!principal) return;
    try {
      res.status(200).json(await revokeUserSessions(principal, req.params.uid));
    } catch (error) {
      sendCommandError(res, error);
    }
  });

  app.post("/api/v1/incidents/:incidentId/media-intents", async (req, res) => {
    const principal = await withPrincipal(req, res);
    if (!principal) return;
    try {
      const result = await createTrustedMediaIntent({
        principal,
        incidentId: req.params.incidentId,
        commandKey: req.body?.commandKey,
        kind: req.body?.kind,
        mimeType: req.body?.mimeType,
        byteSize: req.body?.byteSize,
        originalName: req.body?.originalName,
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      sendCommandError(res, error);
    }
  });

  app.get("/api/v1/incidents/:incidentId/media", async (req, res) => {
    const principal = await withPrincipal(req, res);
    if (!principal) return;
    try {
      res.status(200).json({ media: await listTrustedIncidentMedia(principal, req.params.incidentId) });
    } catch (error) {
      sendCommandError(res, error);
    }
  });

  app.post("/api/v1/incident-media/:mediaId/upload-url", async (req, res) => {
    const principal = await withPrincipal(req, res);
    if (!principal) return;
    try {
      res.status(200).json(await createTrustedMediaUploadUrl(principal, req.params.mediaId));
    } catch (error) {
      sendCommandError(res, error);
    }
  });

  app.post("/api/v1/incident-media/:mediaId/complete", async (req, res) => {
    const principal = await withPrincipal(req, res);
    if (!principal) return;
    try {
      res.status(200).json(await completeTrustedMediaUpload(principal, req.params.mediaId));
    } catch (error) {
      sendCommandError(res, error);
    }
  });

  app.get("/api/v1/incident-media/:mediaId/download-url", async (req, res) => {
    const principal = await withPrincipal(req, res);
    if (!principal) return;
    try {
      res.status(200).json(await createTrustedMediaDownloadUrl(principal, req.params.mediaId));
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
