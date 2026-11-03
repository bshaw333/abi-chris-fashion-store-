"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";

export default function WholesaleRegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const db = createClient();
      const { error } = await db.auth.signUp({ email: email.trim().toLowerCase(), password });
      if (error) throw error;
      setMessage("Your sign-in account was created. If Supabase asks you to confirm your email, follow its email first. The store must approve your application before wholesale prices appear.");
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create your account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <><SiteNav /><main className="page shell"><div className="auth-wrap">
    <div className="eyebrow">Wholesale account</div><h1 className="page-title">Create sign-in</h1>
    <p className="muted">Use the same email address you entered on your wholesale application. This creates a sign-in account; it does not approve wholesale access.</p>
    <form className="panel stack" onSubmit={submit}>
      <div><label className="fieldlabel" htmlFor="register-email">Email address</label><input id="register-email" className="field" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
      <div><label className="fieldlabel" htmlFor="register-password">Create password</label><input id="register-password" className="field" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
      {message && <div className="notice">{message}</div>}
      <button className="btn" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
    </form>
    <p className="muted">Already have an account? <Link href="/wholesale/login" style={{ color: "var(--green)", fontWeight: 700 }}>Sign in</Link></p>
  </div></main><Footer /></>;
}
