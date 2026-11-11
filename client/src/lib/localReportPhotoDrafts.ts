import {
  loadIncidentPhotos,
  storeIncidentPhotos,
  type IncidentPhotoDraft,
} from "./localIncidentPhotos";

// Drafts use a separate key so they cannot appear as submitted incident media.
const DRAFT_KEY = "report-photo-drafts";

export function saveReportPhotoDrafts(photos: IncidentPhotoDraft[]): Promise<void> {
  return storeIncidentPhotos(DRAFT_KEY, photos, true);
}

export async function loadReportPhotoDrafts(): Promise<IncidentPhotoDraft[]> {
  const stored = await loadIncidentPhotos(DRAFT_KEY);
  return stored.map(({ blob, ...metadata }) => ({
    ...metadata,
    file: blob instanceof File
      ? blob
      : new File([blob], `ecr-photo-${metadata.id}`, { type: metadata.mimeType }),
  }));
}
