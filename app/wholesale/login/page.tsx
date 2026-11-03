"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteNav from "@/components/SiteNav";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";

export default function WholesaleLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const db = createClient();
      const { error: signInError } = await db.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      router.push("/wholesale/prices");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <SiteNav />
    <main className="page shell">
      <div className="auth-wrap">
        <div className="eyebrow">Approved wholesale customers</div>
        <h1 className="page-title">Wholesale sign in</h1>
        <p className="muted">Sign in to check your wholesale prices. Access is available only after the store approves your account.</p>
        <form className="panel stack" onSubmit={submit}>
          <div><label className="fieldlabel" htmlFor="wholesale-email">Email address</label><input id="wholesale-email" className="field" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div><label className="fieldlabel" htmlFor="wholesale-password">Password</label><input id="wholesale-password" className="field" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          {error && <div className="notice error">{error}</div>}
          <button className="btn" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="muted" style={{ fontSize: 13 }}>Need access? <Link href="/wholesale" style={{ color: "var(--green)", fontWeight: 700 }}>Apply for wholesale</Link></p>
      </div>
    </main>
    <Footer />
  </>;
}
