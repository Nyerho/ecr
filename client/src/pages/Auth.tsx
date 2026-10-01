import { FormEvent, useState } from "react";
import { Link, useLocation } from "wouter";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { firebaseSetupMessage, registerFirebaseUser, signInFirebaseUser } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";

export default function Auth({ mode }: { mode: "sign-in" | "register" }) {
  const [, navigate] = useLocation();
  const isRegister = mode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      if (firebaseSetupMessage()) throw new Error(firebaseSetupMessage());
      if (isRegister) await registerFirebaseUser({ name, email, password });
      else await signInFirebaseUser(email, password);
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
            <BrandLogo className="w-36" imageClassName="rounded-xl" label="ECR home" />
            <div className="mt-14"><BrandLogo variant="3d" className="w-52" imageClassName="rounded-2xl shadow-2xl shadow-black/20" label="ECR 3D logo home" /></div><div className="mt-10"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-300 text-[#063f3d]"><ShieldCheck size={25} /></div><p className="mt-8 text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Emergency Community Response</p><h1 className="mt-4 text-4xl font-black leading-tight">A safer response loop starts with a trusted account.</h1><p className="mt-5 max-w-sm text-sm leading-7 text-emerald-50/75">Sign in securely with Firebase Authentication, submit a report, and track your incident history from any device.</p></div>
          </section>
          <section className="p-6 sm:p-10 lg:p-14">
            <BrandLogo className="w-28 lg:hidden" imageClassName="rounded-xl" label="ECR home" />
            <div className="mx-auto max-w-md">
              <p className="mt-8 text-xs font-black uppercase tracking-[0.18em] text-emerald-700 lg:mt-0">Secure Firebase access</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight">{isRegister ? "Create your account" : "Welcome back"}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">{isRegister ? "Register to submit and track your emergency reports." : "Sign in to continue to your ECR reporting workspace."}</p>
              <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900">Your account and session are managed by Firebase Authentication. Your profile and role are stored in Firestore.</div>
              <form onSubmit={submit} className="mt-7 space-y-4">
                {isRegister && <label className="block"><span className="text-sm font-bold text-slate-700">Full name</span><input required value={name} onChange={event => setName(event.target.value)} autoComplete="name" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100" placeholder="Your name" /></label>}
                <label className="block"><span className="text-sm font-bold text-slate-700">Email address</span><input required type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100" placeholder="you@example.com" /></label>
                <label className="block"><span className="text-sm font-bold text-slate-700">Password</span><span className="relative mt-2 block"><input required type={showPassword ? "text" : "password"} minLength={8} value={password} onChange={event => setPassword(event.target.value)} autoComplete={isRegister ? "new-password" : "current-password"} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100" placeholder="At least 8 characters" /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
                {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
                <Button type="submit" disabled={isSubmitting} className="h-12 w-full rounded-xl bg-[#063f3d] text-sm font-black text-white hover:bg-[#075b55]">{isSubmitting ? "Please wait…" : isRegister ? "Create account" : "Sign in"}</Button>
              </form>
              <p className="mt-7 text-center text-sm text-slate-500">{isRegister ? "Already have an account?" : "New to ECR?"} <Link href={isRegister ? "/sign-in" : "/register"} className="font-black text-emerald-700 hover:text-emerald-900">{isRegister ? "Sign in" : "Create an account"}</Link></p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
