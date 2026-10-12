# Phase 3: Production Private Media

## Implemented flow

1. The trusted API creates an `incidentMedia` intent and a private object path.
2. An authorized reporter or operator requests a short-lived presigned upload URL:

   ```text
   POST /api/v1/incident-media/{mediaId}/upload-url
   ```

3. The client uploads directly to the configured S3-compatible private bucket with the approved content type and size.
4. The client calls:

   ```text
   POST /api/v1/incident-media/{mediaId}/complete
   ```

5. The server verifies object size and content type, downloads the object, sends the bytes to the configured malware scanner, and marks the Firestore metadata `available` only when the scanner returns `{ "clean": true }`.
6. An authorized user requests a five-minute signed download URL:

   ```text
   GET /api/v1/incident-media/{mediaId}/download-url
   ```

   Signed URLs are only issued for media with both `status=available` and `scanStatus=clean`.

The server fails closed when storage or scanning is not configured. Public tracking projections never contain storage paths or download URLs.

## Required server configuration

```env
ECR_MEDIA_BUCKET=ecr-private-production
ECR_MEDIA_REGION=eu-west-1
ECR_MEDIA_ENDPOINT=
ECR_MEDIA_FORCE_PATH_STYLE=false
ECR_MEDIA_ACCESS_KEY_ID=
ECR_MEDIA_SECRET_ACCESS_KEY=
ECR_MALWARE_SCANNER_URL=https://scanner.internal.example/scan
```

The provider is S3-compatible. AWS S3 is the default deployment choice, but a compatible private provider may be used by setting `ECR_MEDIA_ENDPOINT` and `ECR_MEDIA_FORCE_PATH_STYLE=true` where required. Credentials must be stored in the deployment secret manager and never in Vite or mobile environment variables.

## Malware scanner contract

The scanner endpoint receives the raw image bytes in the request body with the original MIME type in `Content-Type`. It also receives:

```text
X-Filename: ecr-private-media
X-Scan-Mode: fail-closed
```

It must return HTTP 2xx JSON:

```json
{ "clean": true }
```

or:

```json
{ "clean": false, "threat": "signature-name" }
```

An unavailable scanner, malformed response, size mismatch, content-type mismatch, or scanner rejection leaves the object unavailable. The current implementation does not delete rejected objects; a production cleanup worker must remove rejected and abandoned objects after the review/retention window.

## Bucket controls required before production

- Private bucket with public access blocked.
- Server-side encryption enabled.
- CORS limited to the deployed web origin and required mobile clients.
- Lifecycle rules for abandoned, rejected, and expired objects.
- Access logs and provider audit logs enabled.
- IAM policy limited to object operations under `private/incidents/*`.
- No long-lived public URLs stored in Firestore or client state.
- Backup and restore procedure tested separately from the primary bucket.
