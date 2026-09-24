import { useState } from "react";
import { Send } from "lucide-react";

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

type AIChatBoxProps = {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  height?: string;
  emptyStateMessage?: string;
  suggestedPrompts?: string[];
};

export function AIChatBox({ messages, onSendMessage, isLoading = false, placeholder = "Type a message...", height, emptyStateMessage, suggestedPrompts = [] }: AIChatBoxProps) {
  const [value, setValue] = useState("");

  function submit() {
    const content = value.trim();
    if (!content || isLoading) return;
    onSendMessage(content);
    setValue("");
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="max-h-72 space-y-3 overflow-y-auto p-4" style={height ? { maxHeight: height } : undefined}>
        {messages.length === 0 && emptyStateMessage && <p className="text-sm text-muted-foreground">{emptyStateMessage}</p>}
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`rounded-xl px-3 py-2 text-sm ${message.role === "user" ? "ml-8 bg-primary text-primary-foreground" : "mr-8 bg-muted text-foreground"}`}>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide opacity-60">{message.role}</p>
            <p className="whitespace-pre-wrap leading-6">{message.content}</p>
          </div>
        ))}
        {isLoading && <div className="mr-8 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">Thinking…</div>}
        {!messages.length && suggestedPrompts.length > 0 && <div className="flex flex-wrap gap-2">{suggestedPrompts.map(prompt => <button key={prompt} type="button" onClick={() => onSendMessage(prompt)} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">{prompt}</button>)}</div>}
      </div>
      <div className="flex gap-2 border-t border-border p-3">
        <input value={value} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === "Enter") submit(); }} placeholder={placeholder} className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <button type="button" onClick={submit} disabled={!value.trim() || isLoading} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Send size={16} /></button>
      </div>
    </div>
  );
}
