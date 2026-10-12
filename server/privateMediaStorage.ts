import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

let client: S3Client | null = null;

function requireStorageConfig() {
  if (!ENV.mediaBucket || !ENV.mediaRegion || !ENV.mediaAccessKeyId || !ENV.mediaSecretAccessKey) {
    throw new Error("Private media storage is not configured. Set ECR_MEDIA_BUCKET, ECR_MEDIA_REGION, ECR_MEDIA_ACCESS_KEY_ID, and ECR_MEDIA_SECRET_ACCESS_KEY.");
  }
}

function storageClient() {
  requireStorageConfig();
  if (!client) {
    client = new S3Client({
      region: ENV.mediaRegion,
      endpoint: ENV.mediaEndpoint || undefined,
      forcePathStyle: ENV.mediaForcePathStyle,
      credentials: { accessKeyId: ENV.mediaAccessKeyId, secretAccessKey: ENV.mediaSecretAccessKey },
    });
  }
  return client;
}

export function isPrivateMediaConfigured() {
  return Boolean(ENV.mediaBucket && ENV.mediaRegion && ENV.mediaAccessKeyId && ENV.mediaSecretAccessKey);
}

export async function createPrivateMediaUploadUrl(input: { storagePath: string; mimeType: string; byteSize: number }) {
  const command = new PutObjectCommand({ Bucket: ENV.mediaBucket, Key: input.storagePath, ContentType: input.mimeType, ContentLength: input.byteSize, Metadata: { ecrScanStatus: "pending" } });
  return getSignedUrl(storageClient(), command, { expiresIn: 600 });
}

export async function readPrivateMediaObject(storagePath: string) {
  const response = await storageClient().send(new GetObjectCommand({ Bucket: ENV.mediaBucket, Key: storagePath }));
  if (!response.Body) throw new Error("Private media object has no body.");
  const bytes = Buffer.from(await response.Body.transformToByteArray());
  return { bytes, contentType: response.ContentType || "application/octet-stream", contentLength: response.ContentLength ?? bytes.length, etag: response.ETag ?? null };
}

export async function assertPrivateMediaObject(storagePath: string, expected: { mimeType: string; byteSize: number }) {
  const head = await storageClient().send(new HeadObjectCommand({ Bucket: ENV.mediaBucket, Key: storagePath }));
  if (head.ContentLength !== expected.byteSize || head.ContentType !== expected.mimeType) throw new Error("Uploaded media metadata does not match the approved media intent.");
  return { etag: head.ETag ?? null };
}

export async function createPrivateMediaDownloadUrl(storagePath: string, mimeType: string) {
  const command = new GetObjectCommand({ Bucket: ENV.mediaBucket, Key: storagePath, ResponseContentType: mimeType, ResponseContentDisposition: "inline" });
  return getSignedUrl(storageClient(), command, { expiresIn: 300 });
}

export async function scanPrivateMedia(bytes: Buffer, mimeType: string) {
  if (!ENV.malwareScannerUrl) throw new Error("Malware scanning is not configured; media remains blocked.");
  const response = await fetch(ENV.malwareScannerUrl, { method: "POST", headers: { "Content-Type": mimeType, "X-Filename": "ecr-private-media", "X-Scan-Mode": "fail-closed" }, body: bytes as unknown as BodyInit, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Malware scanner returned HTTP ${response.status}.`);
  const result = await response.json().catch(() => null) as { clean?: unknown; threat?: unknown } | null;
  if (result?.clean !== true) return { clean: false, threat: typeof result?.threat === "string" ? result.threat.slice(0, 200) : "scanner_rejected" };
  return { clean: true, threat: null };
}
