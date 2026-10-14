# Phase 3: Analytics and Reporting

## Implemented

The trusted backend exposes:

```text
GET /api/v1/operations/analytics?days=30
```

The endpoint accepts periods from 7 to 90 days and is restricted to administrators, dispatchers, and coordinators. Non-admin operators are scoped to their active organization. Each request writes an `analytics.viewed` audit event.

The response contains aggregates only:

- total, active, and resolved incident counts;
- resolution rate and average resolution time when event timestamps are available;
- counts by workflow status;
- counts by incident category;
- counts by organization, capped at the first 20 groups;
- daily incident volume.

It does not return descriptions, contact details, precise coordinates, reporter IDs, media paths, or public tracking URLs.

The admin workspace now includes an additive **Analytics** tab with:

- 30-day report, active-response, resolved, and resolution-rate cards;
- daily demand trend;
- workflow status mix;
- incident category distribution.

The current dashboard also renders safely from the already-authorized admin incident subscription, so the visual view remains useful while a deployment migrates to the trusted analytics endpoint. Production deployments should prefer the endpoint for organization-scoped institutional dashboards.

## Operational safeguards

- Do not expose analytics to citizen-facing routes.
- Keep organization and jurisdiction filters enforced server-side.
- Avoid small-cell breakdowns that could identify a reporter in a sparse area.
- Treat exports as sensitive and audit them separately from ordinary dashboard reads.
- Revisit aggregation and suppression thresholds with the privacy reviewer before a public or cross-organization report is published.
