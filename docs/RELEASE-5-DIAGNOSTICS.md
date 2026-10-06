# Release 5 — Connection diagnostics

Release 5 adds a safe, local troubleshooting view across the web app and shared Expo mobile app.

## Delivered

- Web users can open **Diagnostics** from the responsive header menu.
- Android and iOS users can open **Connection diagnostics** from More.
- The view reports only non-sensitive local readiness signals:
  - browser/device network state,
  - Firebase configuration availability on web,
  - location API support,
  - notification permission state,
  - shared Expo platform information on mobile.
- Web diagnostics refresh automatically when the browser goes online or offline and supports a manual refresh.
- Web users can copy a short diagnostic summary for support without copying report descriptions, addresses, phone numbers, coordinates, or account identifiers.
- The mobile view checks Expo notification permission state and explicitly labels operating-system-managed network and location checks.
- Existing offline queue, draft recovery, dark appearance, report, Chatter, and notification workflows are unchanged.

## Privacy and safety boundary

Diagnostics are a troubleshooting aid, not a delivery receipt. A healthy network or configured Firebase client does not mean that an emergency report was accepted. The report receipt remains the only confirmation of a confirmed write, and pending offline reports remain clearly marked as not delivered.

The diagnostics view never reads incident records, report text, precise location, contact details, or authentication identifiers. It does not request location permission or notification permission.

## Platform alignment

The mobile implementation is in the shared `mobile/App.tsx` Expo surface, so Android and iOS expose the same diagnostics labels and behavior.

## Test checklist

1. Open web Diagnostics from desktop and mobile-width menus.
2. Toggle browser connectivity and confirm the network row updates.
3. Confirm Copy summary contains only check labels and readiness results.
4. Open mobile More → Connection diagnostics on Android and iOS builds.
5. Confirm opening diagnostics does not request new location or notification permissions.
6. Run `cd mobile && npx tsc --noEmit`.
7. Run `pnpm exec vite build` and `pnpm exec vitest run`.
8. Check conflict markers and whitespace errors.
