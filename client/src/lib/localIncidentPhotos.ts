export type IncidentPhotoKind = "missing_person" | "scene" | "other";

export type LocalIncidentPhoto = {
  id: string;
  kind: IncidentPhotoKind;
  mimeType: string;
  size: number;
  createdAt: string;
};

export type IncidentPhotoDraft = LocalIncidentPhoto & { file: File };
export type StoredIncidentPhoto = LocalIncidentPhoto & { blob: Blob };

export const MAX_INCIDENT_PHOTOS = 3;
export const MAX_INCIDENT_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_INCIDENT_PHOTO_TOTAL_BYTES = 16 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DATABASE_NAME = "ecr-local-media";
const DATABASE_VERSION = 1;
const STORE_NAME = "incidentPhotos";

export function validateIncidentPhotoFiles(
  files: readonly Pick<Blob, "type" | "size">[],
  existingCount = 0,
  existingBytes = 0,
): string | null {
  if (existingCount + files.length > MAX_INCIDENT_PHOTOS) {
    return `Add up to ${MAX_INCIDENT_PHOTOS} photos per report.`;
  }
  let totalBytes = existingBytes;
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
      return "Choose a JPEG, PNG, or WebP image.";
    }
    if (file.size <= 0 || file.size > MAX_INCIDENT_PHOTO_BYTES) {
      return "Each image must be smaller than 8 MB and cannot be empty.";
    }
    totalBytes += file.size;
  }
  if (totalBytes > MAX_INCIDENT_PHOTO_TOTAL_BYTES) {
    return "The combined photo size must be 16 MB or less.";
  }
  return null;
}

export function createIncidentPhotoDraft(file: File, kind: IncidentPhotoKind): IncidentPhotoDraft {
  return {
    id: crypto.randomUUID(),
    kind,
    mimeType: file.type,
    size: file.size,
    createdAt: new Date().toISOString(),
    file,
  };
}

function openPhotoDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser does not support local photo storage."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("incidentId", "incidentId", { unique: false });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open local photo storage."));
    request.onblocked = () => reject(new Error("Close other ECR tabs and try storing the photos again."));
  });
}

export async function storeIncidentPhotos(incidentId: number, photos: IncidentPhotoDraft[]): Promise<void> {
  if (!photos.length) return;
  const issue = validateIncidentPhotoFiles(photos.map(photo => photo.file));
  if (issue) throw new Error(issue);
  const database = await openPhotoDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      for (const photo of photos) {
        const { file, ...metadata } = photo;
        store.put({ ...metadata, incidentId, blob: file });
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save incident photos."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Incident photo save was cancelled."));
    });
  } finally {
    database.close();
  }
}

export async function loadIncidentPhotos(incidentId: number): Promise<StoredIncidentPhoto[]> {
  const database = await openPhotoDatabase();
  try {
    return await new Promise<StoredIncidentPhoto[]>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).index("incidentId").getAll(incidentId);
      request.onsuccess = () => resolve(request.result as StoredIncidentPhoto[]);
      request.onerror = () => reject(request.error ?? new Error("Could not load incident photos."));
    });
  } finally {
    database.close();
  }
}

export async function deleteIncidentPhotos(incidentId: number): Promise<void> {
  const database = await openPhotoDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.index("incidentId").openKeyCursor(incidentId);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove incident photos."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Photo removal was cancelled."));
    });
  } finally {
    database.close();
  }
}

export function photoKindLabel(kind: IncidentPhotoKind): string {
  if (kind === "missing_person") return "Person / identifying photo";
  if (kind === "scene") return "Scene / landmark";
  return "Other context";
}
