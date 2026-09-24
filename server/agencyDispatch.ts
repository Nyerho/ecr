export type AgencyCandidate = {
  id: number;
  name: string;
  type: "dispatch" | "police" | "fire" | "medical" | "disaster" | "community" | "other";
  latitude: string | null;
  longitude: string | null;
  serviceAreaGeoJson?: string | null;
  isVerified: boolean;
  isActive: boolean;
};

export type DispatchIncident = {
  category: string;
  latitude: string | null;
  longitude: string | null;
};

const preferredTypes: Record<string, AgencyCandidate["type"][]> = {
  medical: ["medical", "dispatch", "other"],
  fire: ["fire", "dispatch", "other"],
  security: ["police", "dispatch", "other"],
  road_accident: ["dispatch", "police", "medical", "other"],
  disaster: ["disaster", "dispatch", "police", "other"],
  rescue: ["dispatch", "fire", "medical", "other"],
  missing_person: ["police", "dispatch", "other"],
  other: ["dispatch", "police", "other"],
};

function numberOrNull(value: string | null | undefined) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = Math.PI / 180;
  const deltaLat = (lat2 - lat1) * radians;
  const deltaLon = (lon2 - lon1) * radians;
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInRing(point: [number, number], ring: Array<[number, number]>) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index] ?? [0, 0];
    const [previousX, previousY] = ring[previous] ?? [0, 0];
    const intersects = y > point[1] !== previousY > point[1] && point[0] < ((previousX - x) * (point[1] - y)) / ((previousY - y) || Number.EPSILON) + x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInServiceArea(incidentLat: number | null, incidentLon: number | null, geoJson?: string | null) {
  if (incidentLat === null || incidentLon === null || !geoJson) return false;
  try {
    const geometry = JSON.parse(geoJson) as { type?: string; coordinates?: unknown };
    if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
      const rings = geometry.coordinates as Array<Array<[number, number]>>;
      return Boolean(rings[0] && pointInRing([incidentLon, incidentLat], rings[0]) && !rings.slice(1).some(ring => pointInRing([incidentLon, incidentLat], ring)));
    }
    if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
      return (geometry.coordinates as Array<Array<Array<[number, number]>>>).some(polygon => Boolean(polygon[0] && pointInRing([incidentLon, incidentLat], polygon[0]) && !polygon.slice(1).some(ring => pointInRing([incidentLon, incidentLat], ring))));
    }
  } catch {
    return false;
  }
  return false;
}

export function selectNearestAgency(incident: DispatchIncident, agencies: AgencyCandidate[]) {
  const incidentLat = numberOrNull(incident.latitude);
  const incidentLon = numberOrNull(incident.longitude);
  const allowed = agencies.filter(agency => agency.isActive && agency.isVerified);
  if (!allowed.length) return null;

  const preference = preferredTypes[incident.category] ?? preferredTypes.other;
  const ranked = allowed.map(agency => {
    const agencyLat = numberOrNull(agency.latitude);
    const agencyLon = numberOrNull(agency.longitude);
    const typeRank = preference.indexOf(agency.type);
    const inServiceArea = pointInServiceArea(incidentLat, incidentLon, agency.serviceAreaGeoJson);
    const geographicDistance = incidentLat !== null && incidentLon !== null && agencyLat !== null && agencyLon !== null
      ? distanceKm(incidentLat, incidentLon, agencyLat, agencyLon)
      : Number.POSITIVE_INFINITY;
    return { agency, inServiceArea, typeRank: typeRank === -1 ? preference.length + 1 : typeRank, geographicDistance };
  });

  ranked.sort((left, right) => Number(right.inServiceArea) - Number(left.inServiceArea) || left.typeRank - right.typeRank || left.geographicDistance - right.geographicDistance || left.agency.id - right.agency.id);
  return ranked[0]?.agency ?? null;
}

export function buildAgencyNotificationPayload(incident: { publicReference: string; category: string; description: string; locationLabel: string | null; latitude: string | null; longitude: string | null; reporterPhone: string | null; reporterEmail: string | null }) {
  return {
    kind: "ecr.incident.received",
    reference: incident.publicReference,
    category: incident.category,
    description: incident.description,
    location: { label: incident.locationLabel, latitude: incident.latitude, longitude: incident.longitude },
    reporter: { phone: incident.reporterPhone, email: incident.reporterEmail },
    deliveryNote: "Queued in ECR until an approved agency SMS, voice, or webhook connector is enabled.",
  };
}
