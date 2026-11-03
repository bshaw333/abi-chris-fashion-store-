"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, ShoppingBag, X } from "lucide-react";

export default function SiteNav() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  return <><div className="topbar">Your trusted destination for fashion, home & building essentials</div><header className="nav"><div className="shell navinner">
    <Link className="brand" href="/"><span className="brandmark">AC</span><span>Abi-Chris<small>Fashion and Store</small></span></Link>
    <nav id="main-navigation" className={`navlinks ${open ? "open" : ""}`}><Link onClick={()=>setOpen(false)} href="/#shop">Shop</Link><Link onClick={()=>setOpen(false)} href="/wholesale">Wholesale</Link><Link onClick={()=>setOpen(false)} href="/login">Staff login</Link><Link className="btn" onClick={()=>setOpen(false)} href="/#shop"><ShoppingBag size={16}/> Explore store</Link></nav>
    <button className="btn ghost mobile-toggle" type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="main-navigation" onClick={()=>setOpen(!open)}>{open ? <X size={18}/> : <Menu size={18}/>}</button>
  </div></header></>;
}
