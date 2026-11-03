"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteNav from "@/components/SiteNav";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";

export default function StaffPasswordSetupPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const db = createClient();
        const { data, error: sessionError } = await db.auth.getSession();
        if (!active) return;
        if (sessionError) throw sessionError;
        setHasSession(Boolean(data.session));

        const params = new URLSearchParams(window.location.search);
        const authError = params.get("error_description") || params.get("error");
        if (authError) setError("This setup link is invalid or has expired. Request a fresh password link from Staff login.");
        else if (!data.session) setError("We couldn’t verify this setup link. Request a fresh password link from Staff login.");
      } catch {
        if (active) setError("We couldn’t verify this setup link. Request a fresh password link from Staff login.");
      } finally {
        if (active) setReady(true);
      }
    };
    void initialize();
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 8) {
      setError("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match. Please enter them again.");
      return;
    }

    setBusy(true);
    try {
      const db = createClient();
      const { data, error: updateError } = await db.auth.updateUser({ password });
      if (updateError) throw updateError;
      if (!data.user) throw new Error("Your account could not be verified. Please request a fresh setup link.");
      setMessage("Your password is set. You can now sign in to the store.");
      window.setTimeout(() => router.replace("/login"), 1200);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "We couldn’t save your password. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <><SiteNav/><main className="page shell"><div className="auth-wrap">
    <div className="eyebrow">Secure team access</div>
    <h1 className="page-title">Set your staff password</h1>
    <p className="muted">Choose a password for your Abi-Chris staff account. Keep it private.</p>
    <form className="panel stack" onSubmit={submit}>
      {!ready ? <p className="muted" role="status">Checking your secure link…</p> : hasSession ? <>
        <div><label className="fieldlabel" htmlFor="staff-password">New password</label><input id="staff-password" className="field" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} /></div>
        <div><label className="fieldlabel" htmlFor="staff-password-confirm">Confirm new password</label><input id="staff-password-confirm" className="field" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></div>
        {error && <div className="notice error" role="alert">{error}</div>}
        {message && <div className="notice" role="status">{message}</div>}
        <button className="btn" disabled={busy}>{busy ? "Saving password…" : "Save password"}</button>
      </> : <>
        {error && <div className="notice error" role="alert">{error}</div>}
        <p className="muted" style={{margin:0}}>Open the newest password setup email on this device, or request another link from Staff login.</p>
        <Link className="btn" href="/login">Go to Staff login</Link>
      </>}
    </form>
  </div></main><Footer/></>;
}
