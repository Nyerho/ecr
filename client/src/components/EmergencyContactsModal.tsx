import {
  Flame,
  HeartPulse,
  MapPin,
  MessageCircle,
  Phone,
  ShieldAlert,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  DEFAULT_EMERGENCY_CONTACTS,
  subscribeToEmergencyContacts,
  type EmergencyContactRecord,
} from "@/lib/firebase";

const WHATSAPP_REPORT_CHAT = "https://wa.me/2348100760542?text=Hello%20ECR%2C%20I%20need%20community%20help.%20My%20location%20is%3A%20";

 type EmergencyContactsModalProps = {
  open: boolean;
  onClose: () => void;
  onReport?: () => void;
};

const iconForContact = {
  medical: HeartPulse,
  police: ShieldAlert,
  fire: Flame,
  default: Phone,
};

export default function EmergencyContactsModal({
  open,
  onClose,
  onReport,
}: EmergencyContactsModalProps) {
  const [remoteContacts, setRemoteContacts] = useState<
    EmergencyContactRecord[] | null
  >(null);

  useEffect(() => {
    if (!open) return;
    const stop = subscribeToEmergencyContacts(
      contacts => setRemoteContacts(contacts),
      () => setRemoteContacts(null)
    );
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      stop();
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  const contacts: EmergencyContactRecord[] =
    remoteContacts ??
    DEFAULT_EMERGENCY_CONTACTS.map((contact, index) => ({
      ...contact,
      id: `default-${index + 1}`,
    }));

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="emergency-contacts-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-white/70 bg-white p-5 shadow-2xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-5">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-800">
              <Phone size={13} /> Local contacts
            </span>
            <h2
              id="emergency-contacts-title"
              className="mt-4 text-3xl font-black tracking-tight text-slate-950"
            >
              Who do you need to reach?
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Direct contacts for the Agbarho–Ughelli axis. Call the relevant
              authority or hospital first when you can, then use ECR to request
              practical help from verified community members.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close emergency contacts dialog"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">
          <strong>Important:</strong> ECR is not the official emergency
          dispatcher. If there is immediate danger, call the appropriate service
          directly. Numbers can change; verify availability when this directory
          is reviewed before relying on it.
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {contacts.map((contact, index) => {
            const Icon = iconForContact[contact.icon] ?? Phone;
            const telNumbers =
              contact.telNumbers ??
              contact.numbers.map(number =>
                `+234${number.replace(/\D/g, "").replace(/^0/, "")}`
              );
            return (
              <article
                key={contact.id ?? contact.name}
                className={`rounded-2xl border p-4 ${contact.tone}`}
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/80">
                    <Icon size={19} />
                  </span>
                  <div>
                    <h3 className="font-black">{contact.name}</h3>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold opacity-70">
                      <MapPin size={12} /> {contact.area}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 opacity-80">
                  {contact.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {contact.numbers.map((number, numberIndex) => (
                    <a
                      key={`${contact.id ?? contact.name}-${number}`}
                      href={`tel:${telNumbers[numberIndex]}`}
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <Phone size={13} /> {number}
                    </a>
                  ))}
                </div>
                {index === 3 && (
                  <p className="mt-3 text-[10px] leading-4 opacity-60">
                    Hospital phone number from a public facility directory;
                    confirm at deployment review.
                  </p>
                )}
              </article>
            );
          })}
          {!contacts.length && (
            <p className="col-span-full rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              No emergency contacts are currently published.
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-[#063f3d] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <UsersRound className="mt-0.5 shrink-0 text-emerald-300" size={20} />
            <div>
              <h3 className="font-black">Need community help too?</h3>
              <p className="mt-1 text-xs leading-5 text-emerald-50/75">
                Raise an ECR alert after contacting the right authority. Verified
                responders may be able to provide first aid, directions,
                transport support, or a safe handoff.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {onReport && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onReport();
                }}
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#13b981] px-4 py-3 text-xs font-black text-[#022c2b] hover:bg-[#34d399]"
              >
                Raise an ECR alert
              </button>
            )}
            <a
              href={WHATSAPP_REPORT_CHAT}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-xs font-black text-white hover:bg-[#1ebe5d]"
            >
              <MessageCircle size={14} /> WhatsApp report chat
            </a>
            <a
              href="https://whatsapp.com/channel/0029VbEChke5a246BfQBdw0G"
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-xs font-black text-white ring-1 ring-white/20 hover:bg-white/15"
            >
              <MessageCircle size={14} /> Channel updates
            </a>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-200"
          >
            Close
          </button>
        </div>
      </section>
    </div>
  );
}
