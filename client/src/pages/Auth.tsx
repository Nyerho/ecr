import { FormEvent, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { LOCAL_AUTH_NOTICE, registerLocalUser, signInLocalUser } from "@/lib/localAuth";

export default function Auth({ mode }: { mode: "sign-in" | "register" }) {
  const [, navigate] = useLocation();
  const isRegister = mode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      if (isRegister) registerLocalUser({ name, email, password });
      else signInLocalUser(email, password);
      navigate("/app");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Could not complete authentication.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f8f7] px-4 py-8 text-slate-950 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-emerald-950/10 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="hidden bg-[#063f3d] p-10 text-white lg:block lg:p-14">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-100 hover:text-white"><ArrowLeft size={16} /> Back to ECR</Link>
            <div className="mt-24"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-300 text-[#063f3d]"><ShieldCheck size={25} /></div><p className="mt-8 text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Emergency Community Response</p><h1 className="mt-4 text-4xl font-black leading-tight">A safer response loop starts with a trusted account.</h1><p className="mt-5 max-w-sm text-sm leading-7 text-emerald-50/75">Create a local pilot account, submit a report, and keep your incident history in this browser while the Firestore foundation is prepared.</p></div>
          </section>
          <section className="p-6 sm:p-10 lg:p-14">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-emerald-700 lg:hidden"><ArrowLeft size={16} /> Back to ECR</Link>
            <div className="mx-auto max-w-md">
              <p className="mt-8 text-xs font-black uppercase tracking-[0.18em] text-emerald-700 lg:mt-0">Local pilot access</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight">{isRegister ? "Create your account" : "Welcome back"}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">{isRegister ? "Register to submit and track your emergency reports." : "Sign in to continue to your ECR reporting workspace."}</p>
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">{LOCAL_AUTH_NOTICE}</div>
              <form onSubmit={submit} className="mt-7 space-y-4">
                {isRegister && <label className="block"><span className="text-sm font-bold text-slate-700">Full name</span><input required value={name} onChange={event => setName(event.target.value)} autoComplete="name" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100" placeholder="Your name" /></label>}
                <label className="block"><span className="text-sm font-bold text-slate-700">Email address</span><input required type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100" placeholder="you@example.com" /></label>
                <label className="block"><span className="text-sm font-bold text-slate-700">Password</span><span className="relative mt-2 block"><input required type={showPassword ? "text" : "password"} minLength={8} value={password} onChange={event => setPassword(event.target.value)} autoComplete={isRegister ? "new-password" : "current-password"} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100" placeholder="At least 8 characters" /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
                {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
                <button disabled={isSubmitting} className="w-full rounded-xl bg-[#063f3d] px-5 py-3.5 text-sm font-black text-white transition hover:bg-[#075b55] disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? "Please wait…" : isRegister ? "Create local account" : "Sign in"}</button>
              </form>
              <p className="mt-7 text-center text-sm text-slate-500">{isRegister ? "Already have an account?" : "New to ECR?"} <Link href={isRegister ? "/sign-in" : "/register"} className="font-black text-emerald-700 hover:text-emerald-900">{isRegister ? "Sign in" : "Create an account"}</Link></p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
