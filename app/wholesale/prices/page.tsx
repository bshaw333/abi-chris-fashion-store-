"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteNav from "@/components/SiteNav";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { formatSLE } from "@/lib/money";

type WholesaleProduct = {
  id: string;
  name: string;
  description: string | null;
  retail_price: number;
  wholesale_price: number | null;
  unit_name: string;
  category_name: string | null;
  image_url: string | null;
};

export default function WholesalePricesPage() {
  const router = useRouter();
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const db = createClient();
        const { data: { user } } = await db.auth.getUser();
        if (!user) {
          router.replace("/wholesale/login");
          return;
        }
        if (active) setEmail(user.email ?? "");

        const { data: isApproved, error: approvalError } = await db.rpc("is_wholesale_customer");
        if (approvalError) throw approvalError;
        if (!isApproved) {
          if (active) setMessage("Your account is signed in but has not been approved for wholesale pricing yet. Please contact the store team.");
          return;
        }

        const { data, error } = await db.rpc("get_wholesale_products");
        if (error) throw error;
        if (active) {
          setApproved(true);
          setProducts((data ?? []) as WholesaleProduct[]);
        }
      } catch {
        if (active) setMessage("Wholesale prices could not be loaded. Please try again or contact the store team.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [router]);

  async function signOut() {
    const db = createClient();
    await db.auth.signOut();
    router.push("/wholesale/login");
    router.refresh();
  }

  return <>
    <SiteNav />
    <main className="page shell">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 15, flexWrap: "wrap" }}>
        <div><div className="eyebrow">Wholesale account</div><h1 className="page-title">Wholesale catalogue</h1><p className="muted">Signed in as {email || "customer"}</p></div>
        <button className="btn secondary" onClick={signOut}>Sign out</button>
      </div>
      {loading ? <div className="panel" style={{ marginTop: 24 }}>Checking wholesale access…</div>
        : !approved ? <div className="notice" style={{ marginTop: 24 }}>{message || "This account is not approved for wholesale pricing."}</div>
          : products.length ? <div className="product-grid" style={{ marginTop: 24 }}>
            {products.map((product) => <article className="product-card" key={product.id}>
              <div className="product-image">{product.image_url ? <img src={product.image_url} alt={product.name} /> : <span>Product image</span>}</div>
              <div className="product-body">
                <div className="category">{product.category_name || "General merchandise"}</div>
                <h3>{product.name}</h3>
                {product.description && <p className="muted" style={{ fontSize: 13 }}>{product.description}</p>}
                <div className="product-meta">Retail: {formatSLE(product.retail_price)}</div>
                <div className="product-price">Wholesale: {product.wholesale_price == null ? "Contact store" : formatSLE(product.wholesale_price)}</div>
                <div className="product-meta">Per {product.unit_name}</div>
              </div>
            </article>)}
          </div> : <div className="empty" style={{ marginTop: 24 }}>No published products are available yet.</div>}
    </main>
    <Footer />
  </>;
}
