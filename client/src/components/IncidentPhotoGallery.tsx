import { useEffect, useState } from "react";
import { Camera, Images, LoaderCircle } from "lucide-react";
import { loadIncidentPhotos, photoKindLabel, type StoredIncidentPhoto } from "@/lib/localIncidentPhotos";

type DisplayPhoto = { photo: StoredIncidentPhoto; url: string };

export default function IncidentPhotoGallery({ incidentId, publicReference }: { incidentId: number; publicReference: string }) {
  const [photos, setPhotos] = useState<DisplayPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let urls: string[] = [];
    setLoading(true);
    setError(false);
    loadIncidentPhotos(incidentId)
      .then(records => {
        if (!active) return;
        urls = records.map(record => URL.createObjectURL(record.blob));
        setPhotos(records.map((photo, index) => ({ photo, url: urls[index] })));
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [incidentId]);

  if (loading) {
    return <div className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500"><LoaderCircle size={14} className="animate-spin" /> Loading attached photos…</div>;
  }
  if (error) {
    return <p role="status" className="mt-5 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Photos could not be read from this browser. The incident report remains available.</p>;
  }
  if (!photos.length) return null;

  return (
    <section className="mt-5 rounded-2xl border border-cyan-100 bg-cyan-50/50 p-4" aria-label={`Photos attached to ${publicReference}`}>
      <div className="flex items-center gap-2 text-sm font-black text-cyan-950"><Images size={16} /> Report photos <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-cyan-800">{photos.length}</span></div>
      <p className="mt-1 text-xs leading-5 text-cyan-900/70">Images are stored in this browser for the local prototype; do not treat this view as a secure shared response system.</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map(({ photo, url }) => (
          <a key={photo.id} href={url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-cyan-100 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-600">
            <img src={url} alt={`${photoKindLabel(photo.kind)} for ${publicReference}`} className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
            <span className="flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-bold text-slate-700"><Camera size={13} className="text-cyan-700" />{photoKindLabel(photo.kind)}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
