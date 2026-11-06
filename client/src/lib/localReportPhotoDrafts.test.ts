import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadIncidentPhotos, storeIncidentPhotos } from "./localIncidentPhotos";
import { loadReportPhotoDrafts, saveReportPhotoDrafts } from "./localReportPhotoDrafts";

vi.mock("./localIncidentPhotos", () => ({
  loadIncidentPhotos: vi.fn(),
  storeIncidentPhotos: vi.fn(),
}));

describe("local report photo drafts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("restores stored image blobs as files that the picker can preview and download", async () => {
    const blob = new Blob(["photo bytes"], { type: "image/png" });
    vi.mocked(loadIncidentPhotos).mockResolvedValue([{
      id: "photo-1",
      kind: "scene",
      mimeType: "image/png",
      size: blob.size,
      createdAt: "2026-11-06T12:00:00.000Z",
      blob,
    }]);

    const [restored] = await loadReportPhotoDrafts();
    expect(restored.file).toBeInstanceOf(File);
    expect(restored.file.type).toBe("image/png");
    expect(await restored.file.text()).toBe("photo bytes");
    expect(restored.kind).toBe("scene");
    expect(restored).not.toHaveProperty("blob");
  });

  it("replaces draft storage atomically, including removing the final photo", async () => {
    vi.mocked(storeIncidentPhotos).mockResolvedValue();
    await saveReportPhotoDrafts([]);
    expect(storeIncidentPhotos).toHaveBeenCalledWith("report-photo-drafts", [], true);
  });
});
