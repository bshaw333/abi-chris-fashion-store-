"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";

export default function WholesalePage() {
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const db = createClient();
      const { error } = await db.from("wholesale_applications").insert({
        contact_name: name,
        business_name: business,
        email,
        phone,
        details,
      });
      if (error) throw error;
      setStatus("Your request has been received. The store team can review it and contact you.");
      setName("");
      setBusiness("");
      setEmail("");
      setPhone("");
      setDetails("");
    } catch {
      setStatus("We could not submit your request right now. Please contact the store team directly.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <SiteNav />
    <main className="page shell">
      <div className="hero-grid" style={{ alignItems: "start" }}>
        <div>
          <div className="eyebrow">For retailers and resellers</div>
          <h1 className="page-title" style={{ fontSize: 44, marginTop: 14 }}>Wholesale, made simple.</h1>
          <p className="muted" style={{ lineHeight: 1.8 }}>Apply for wholesale access to Abi-Chris-Fashion and Store. Once your account is reviewed and approved, sign in to see wholesale prices. Retail prices remain visible to everyone.</p>
          <div className="panel" style={{ marginTop: 25 }}>
            <strong>What happens next?</strong>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.7 }}>1. Send your business details.<br />2. The store team reviews your request.<br />3. Approved customers can sign in to view wholesale prices.</p>
            <Link className="btn secondary" href="/wholesale/login">Already approved? Sign in</Link>
            <p className="muted" style={{ marginBottom: 0, fontSize: 13 }}>After applying, <Link href="/wholesale/register" style={{ color: "var(--green)", fontWeight: 700 }}>create your sign-in account</Link> using the same email address.</p>
          </div>
        </div>
        <form className="panel stack" onSubmit={submit}>
          <h2 style={{ fontFamily: "Manrope", margin: "0 0 5px" }}>Request wholesale access</h2>
          <div><label className="fieldlabel" htmlFor="wholesale-name">Your full name *</label><input id="wholesale-name" className="field" required value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div><label className="fieldlabel" htmlFor="wholesale-business">Business or trading name *</label><input id="wholesale-business" className="field" required value={business} onChange={(event) => setBusiness(event.target.value)} /></div>
          <div><label className="fieldlabel" htmlFor="wholesale-application-email">Email address *</label><input id="wholesale-application-email" className="field" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div><label className="fieldlabel" htmlFor="wholesale-phone">Phone / WhatsApp</label><input id="wholesale-phone" className="field" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Include country code if possible" /></div>
          <div><label className="fieldlabel" htmlFor="wholesale-details">What products and quantities interest you?</label><textarea id="wholesale-details" className="field" rows={3} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Tell us what you plan to buy" /></div>
          {status && <div className="notice">{status}</div>}
          <button className="btn" disabled={busy}>{busy ? "Submitting…" : "Submit application"}</button>
          <p className="muted" style={{ fontSize: 11, margin: 0 }}>Submitting an application does not automatically grant wholesale access.</p>
        </form>
      </div>
    </main>
    <Footer />
  </>;
}
