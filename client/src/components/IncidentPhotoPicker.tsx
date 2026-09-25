import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Images, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createIncidentPhotoDraft,
  MAX_INCIDENT_PHOTOS,
  MAX_INCIDENT_PHOTO_BYTES,
  MAX_INCIDENT_PHOTO_TOTAL_BYTES,
  photoKindLabel,
  validateIncidentPhotoFiles,
  type IncidentPhotoDraft,
  type IncidentPhotoKind,
} from "@/lib/localIncidentPhotos";

const PHOTO_KINDS: Array<{ value: IncidentPhotoKind; label: string }> = [
  { value: "missing_person", label: "Missing person / identifying photo" },
  { value: "scene", label: "Incident scene / landmark" },
  { value: "other", label: "Other useful context" },
];

export default function IncidentPhotoPicker({
  category,
  photos,
  onChange,
}: {
  category: string;
  photos: IncidentPhotoDraft[];
  onChange: (photos: IncidentPhotoDraft[]) => void;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const nextKind = useRef<IncidentPhotoKind>(category === "missing_person" ? "missing_person" : "scene");
  const [kind, setKind] = useState<IncidentPhotoKind>(nextKind.current);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    const urls = Object.fromEntries(photos.map(photo => [photo.id, URL.createObjectURL(photo.file)]));
    setPreviews(urls);
    return () => Object.values(urls).forEach(url => URL.revokeObjectURL(url));
  }, [photos]);

  useEffect(() => {
    const defaultKind: IncidentPhotoKind = category === "missing_person" ? "missing_person" : "scene";
    nextKind.current = defaultKind;
    setKind(defaultKind);
  }, [category]);

  function acceptFiles(fileList: FileList | null, photoKind: IncidentPhotoKind) {
    if (!fileList?.length) return;
    const incoming = Array.from(fileList);
    const existingBytes = photos.reduce((total, photo) => total + photo.size, 0);
    const issue = validateIncidentPhotoFiles(incoming, photos.length, existingBytes);
    if (issue) {
      toast.error(issue);
      return;
    }
    onChange([...photos, ...incoming.map(file => createIncidentPhotoDraft(file, photoKind))]);
  }

  function choose(kindValue: IncidentPhotoKind, source: "camera" | "gallery") {
    setKind(kindValue);
    nextKind.current = kindValue;
    if (source === "camera") cameraInput.current?.click();
    else galleryInput.current?.click();
  }

  const remainingSlots = MAX_INCIDENT_PHOTOS - photos.length;
  const totalSize = photos.reduce((total, photo) => total + photo.size, 0);

  return (
    <section className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4" aria-label="Optional incident photos">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-cyan-800"><Images size={18} /></span>
        <div>
          <p className="text-sm font-black text-cyan-950">Add photos (optional)</p>
          <p className="mt-1 text-xs leading-5 text-cyan-900/75">
            {category === "missing_person"
              ? "A clear, recent photo of the missing person can help identify them. You can also add a safe scene or landmark photo."
              : "A safe scene or landmark photo can help responders understand what is happening."}
          </p>
        </div>
      </div>

      <label className="mt-4 block text-xs font-black text-slate-700">
        Photo type
        <select value={kind} onChange={event => { const selectedKind = event.target.value as IncidentPhotoKind; nextKind.current = selectedKind; setKind(selectedKind); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-cyan-500">
          {PHOTO_KINDS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={!remainingSlots} onClick={() => choose(kind, "camera")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#063f3d] px-3 py-3 text-xs font-black text-white hover:bg-[#075b55] disabled:cursor-not-allowed disabled:opacity-50"><Camera size={16} /> Take photo with camera</button>
        <button type="button" disabled={!remainingSlots} onClick={() => choose(kind, "gallery")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-3 text-xs font-black text-slate-700 ring-1 ring-slate-200 hover:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"><ImagePlus size={16} /> Choose from photos</button>
      </div>
      <input ref={cameraInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" aria-label="Take an incident photo" onChange={event => { acceptFiles(event.currentTarget.files, nextKind.current); event.currentTarget.value = ""; }} />
      <input ref={galleryInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" aria-label="Choose incident photos" onChange={event => { acceptFiles(event.currentTarget.files, nextKind.current); event.currentTarget.value = ""; }} />

      <p className="mt-2 text-[11px] leading-5 text-slate-500">Up to {MAX_INCIDENT_PHOTOS} JPEG, PNG, or WebP images. Max 8 MB each / 16 MB total. Photos stay in this browser in the local prototype and are not synced to other devices.</p>
      <p className="mt-1 text-[11px] leading-5 text-amber-900"><strong>Safety:</strong> Don’t approach danger or delay calling emergency services to take a photo. Avoid sharing graphic images or photos of uninvolved people.</p>

      {photos.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map(photo => <div key={photo.id} className="overflow-hidden rounded-xl border border-cyan-100 bg-white"><img src={previews[photo.id]} alt={`Preview: ${photoKindLabel(photo.kind)}`} className="aspect-[4/3] w-full object-cover" /><div className="flex items-center justify-between gap-2 px-2.5 py-2"><span className="min-w-0 text-[10px] font-bold leading-4 text-slate-700">{photoKindLabel(photo.kind)}<span className="block font-normal text-slate-400">{(photo.size / (1024 * 1024)).toFixed(1)} MB</span></span><button type="button" onClick={() => onChange(photos.filter(item => item.id !== photo.id))} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove ${photoKindLabel(photo.kind)}`}><Trash2 size={15} /></button></div></div>)}</div>}
      <div className="mt-3 flex justify-between text-[11px] font-semibold text-slate-500"><span>{photos.length}/{MAX_INCIDENT_PHOTOS} photos</span><span>{(totalSize / (1024 * 1024)).toFixed(1)} MB / {(MAX_INCIDENT_PHOTO_TOTAL_BYTES / (1024 * 1024)).toFixed(0)} MB</span></div>
    </section>
  );
}
