import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAuth, getFirebaseFirestore } from "./_core/firebaseAdmin";
import { CommandError, type CommandPrincipal } from "./trustedIncidentCommands";

function validUid(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9:_-]{8,128}$/.test(value)) throw new CommandError("INVALID_ARGUMENT", "A valid user ID is required.");
  return value;
}

export async function revokeUserSessions(principal: CommandPrincipal, targetUid: unknown) {
  const uid = validUid(targetUid);
  if (principal.role !== "admin" && principal.uid !== uid) throw new CommandError("FORBIDDEN", "Only an administrator or the account owner can revoke sessions.");
  await getFirebaseAuth().revokeRefreshTokens(uid);
  const database = getFirebaseFirestore();
  await database.collection("users").doc(uid).set({ sessionsRevokedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await database.collection("auditEvents").add({ action: "security.sessions_revoked", actorUid: principal.uid, resourceType: "user", resourceId: uid, result: "success", metadata: { selfService: principal.uid === uid }, createdAt: FieldValue.serverTimestamp() });
  return { uid, revoked: true, note: "Existing ID tokens will be rejected on the next authenticated request after revocation is observed." };
}
