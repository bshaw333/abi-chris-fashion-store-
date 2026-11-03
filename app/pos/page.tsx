"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SiteNav from "@/components/SiteNav";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { formatSLE } from "@/lib/money";
import { formatDateTime } from "@/lib/datetime";

type PosProduct = {
  product_id: string;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  retail_price: number;
  stock_quantity: number;
  unit_name: string;
  category_name: string;
};
type CartItem = PosProduct & { quantity: number };
type NativeBarcodeDetector = { detect(video: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };
type NativeBarcodeDetectorConstructor = new (options?: { formats: string[] }) => NativeBarcodeDetector;
type PosSaleSummary = { id: string; order_number: string; created_at: string; total: number; payment_status: string; order_status: string };
type SalesSummary = { today: number; yesterday: number; week: number; month: number; todayCount: number; yesterdayCount: number; weekCount: number; monthCount: number; todayPaidCount: number; };
type Receipt = {
  order_number: string;
  created_at: string;
  subtotal: number;
  discount_total: number;
  total: number;
  payment_method: string;
  payment_status: string;
  customer_name: string | null;
  customer_phone: string | null;
  items: { name: string; quantity: number; unit_price: number; line_total: number }[];
};

function freetownDate(value: Date | string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Freetown", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
}
function shiftDate(date: string, days: number) {
  const value = new Date(date + "T00:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function utcStart(date: string) { return date + "T00:00:00.000Z"; }
function cartKey(item: Pick<PosProduct, "product_id" | "variant_id">) {
  return `${item.product_id}:${item.variant_id ?? "base"}`;
}

export default function PosPage() {
  const router = useRouter();
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState("");
  const [staffId, setStaffId] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [cameraScanning, setCameraScanning] = useState(false);
  const [barcodeBusy, setBarcodeBusy] = useState(false);
  const [salesSummary, setSalesSummary] = useState<SalesSummary>({ today: 0, yesterday: 0, week: 0, month: 0, todayCount: 0, yesterdayCount: 0, weekCount: 0, monthCount: 0, todayPaidCount: 0 });
  const [recentSales, setRecentSales] = useState<PosSaleSummary[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [salesError, setSalesError] = useState("");
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentStatus, setPaymentStatus] = useState("paid");
  const [discount, setDiscount] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [savingSale, setSavingSale] = useState(false);
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const loadSalesHistory = useCallback(async (userId: string) => {
    setLoadingSales(true);
    setSalesError("");
    const today = freetownDate(new Date());
    const yesterday = shiftDate(today, -1);
    const weekStart = shiftDate(today, -6);
    const monthStart = today.slice(0, 7) + "-01";
    const queryStart = weekStart < monthStart ? weekStart : monthStart;
    try {
      const db = createClient();
      const rows: PosSaleSummary[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await db.from("orders").select("id,order_number,created_at,total,payment_status,order_status")
          .eq("created_by", userId).eq("sales_channel", "pos")
          .gte("created_at", utcStart(queryStart)).lt("created_at", utcStart(shiftDate(today, 1)))
          .order("created_at", { ascending: false }).range(offset, offset + 999);
        if (error) throw error;
        const page = (data ?? []) as PosSaleSummary[];
        rows.push(...page);
        if (page.length < 1000) break;
        offset += page.length;
      }
      const eligible = rows.filter((sale) => !["cancelled", "refunded"].includes(sale.order_status));
      const dayRows = (day: string) => eligible.filter((sale) => freetownDate(sale.created_at) === day);
      const todayRows = dayRows(today);
      const yesterdayRows = dayRows(yesterday);
      const weekRows = eligible.filter((sale) => freetownDate(sale.created_at) >= weekStart);
      const monthRows = eligible.filter((sale) => freetownDate(sale.created_at) >= monthStart);
      const sum = (items: PosSaleSummary[]) => items.reduce((total, sale) => total + Number(sale.total || 0), 0);
      setSalesSummary({ today: sum(todayRows), yesterday: sum(yesterdayRows), week: sum(weekRows), month: sum(monthRows), todayCount: todayRows.length, yesterdayCount: yesterdayRows.length, weekCount: weekRows.length, monthCount: monthRows.length, todayPaidCount: todayRows.filter((sale) => sale.payment_status === "paid").length });
      setRecentSales(eligible.slice(0, 10));
    } catch (error) {
      setSalesError(error instanceof Error ? error.message : "Could not load your sales summary.");
    } finally {
      setLoadingSales(false);
    }
  }, []);

  useEffect(() => {
    let current = true;
    async function checkStaffAccess() {
      try {
        const db = createClient();
        const { data: { user } } = await db.auth.getUser();
        if (!user) {
          router.replace("/login");
          return;
        }
        const { data: profile, error } = await db.from("profiles").select("full_name,role,is_active").eq("id", user.id).maybeSingle();
        if (error) throw error;
        if (!profile?.is_active || !["owner", "admin", "salesperson"].includes(profile.role)) {
          setMessage("This account does not have active point-of-sale access. Ask the store owner to check its staff role.");
          return;
        }
        setStaffId(user.id);
        setStaffName(profile.full_name || user.email || "Staff member");
        setStaffRole(profile.role);
        setAuthorized(true);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not check staff access.");
      } finally {
        if (current) setCheckingAccess(false);
      }
    }
    void checkStaffAccess();
    return () => { current = false; };
  }, [router]);

  useEffect(() => {
    if (authorized && staffId) void loadSalesHistory(staffId);
  }, [authorized, staffId, loadSalesHistory]);

  useEffect(() => {
    const finishPrinting = () => document.body.classList.remove("printing-receipt");
    window.addEventListener("afterprint", finishPrinting);
    return () => { window.removeEventListener("afterprint", finishPrinting); cameraStreamRef.current?.getTracks().forEach((track) => track.stop()); cameraStreamRef.current = null; };
  }, []);

  useEffect(() => {
    if (!authorized) return;
    let current = true;
    const timer = window.setTimeout(async () => {
      setLoadingProducts(true);
      try {
        const db = createClient();
        const { data, error } = await db.rpc("search_pos_products", { p_search: search.trim(), p_limit: 50 });
        if (error) throw error;
        if (current) setProducts((data ?? []) as PosProduct[]);
      } catch (error) {
        if (current) setMessage(error instanceof Error && error.message.includes("search_pos_products")
          ? "POS setup is not installed yet. The store owner must run supabase/pos-and-analysis-upgrade.sql in the new Supabase project."
          : error instanceof Error ? error.message : "Could not search products.");
      } finally {
        if (current) setLoadingProducts(false);
      }
    }, 220);
    return () => { current = false; window.clearTimeout(timer); };
  }, [search, authorized]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.retail_price * item.quantity, 0), [cart]);
  const discountAmount = Number(discount || 0);
  const total = Math.max(0, subtotal - (Number.isFinite(discountAmount) ? discountAmount : 0));

  function addToCart(product: PosProduct) {
    setMessage("");
    if (product.stock_quantity < 1) {
      setMessage(`${product.product_name}${product.variant_name ? ` / ${product.variant_name}` : ""} is out of stock.`);
      return;
    }
    setCart((current) => {
      const key = cartKey(product);
      const found = current.find((item) => cartKey(item) === key);
      if (found) {
        if (found.quantity >= product.stock_quantity) {
          setMessage("The quantity in the basket is already at the available stock level.");
          return current;
        }
        return current.map((item) => cartKey(item) === key ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...current, { ...product, quantity: 1 }];
    });
  }

  function changeQuantity(item: CartItem, change: number) {
    setCart((current) => current.flatMap((row) => {
      if (cartKey(row) !== cartKey(item)) return [row];
      const nextQuantity = row.quantity + change;
      if (nextQuantity < 1) return [];
      if (nextQuantity > row.stock_quantity) {
        setMessage("The quantity cannot be higher than the currently available stock.");
        return [row];
      }
      return [{ ...row, quantity: nextQuantity }];
    }));
  }

  function stopCameraScan() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraScanning(false);
  }

  async function startCameraScan() {
    const Detector = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorConstructor }).BarcodeDetector;
    if (!navigator.mediaDevices?.getUserMedia) { setMessage("Camera access is not available. Use a scanner or type the product code."); return; }
    try {
      setMessage("");
      // Reveal the video preview before requesting/starting the stream. Some mobile
      // browsers do not reliably start playback while the video is display:none.
      setCameraScanning(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      cameraStreamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Camera view could not be opened.");
      video.srcObject = stream;
      await video.play();
      if (!Detector) {
        setMessage("Camera is open, but barcode scanning is not supported by this browser. Use Chrome on Android, or type the product code below.");
        return;
      }
      const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
      while (cameraStreamRef.current === stream) {
        const codes = await detector.detect(video);
        if (codes[0]?.rawValue) {
          const code = codes[0].rawValue;
          stopCameraScan();
          setSearch(code);
          await scanBarcode(code);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
    } catch (error) {
      stopCameraScan();
      const name = error instanceof DOMException ? error.name : "";
      setMessage(name === "NotAllowedError" || name === "SecurityError"
        ? "Camera permission is blocked. Allow camera access for this website in your browser settings, then reload the page."
        : name === "NotFoundError"
          ? "No camera was found on this device. Use a scanner or type the product code."
          : name === "NotReadableError"
            ? "The camera is busy in another app. Close that app and try again."
            : "Could not start the camera. Open this site using its https link, allow camera access, then try again.");
    }
  }

  async function scanBarcode(value = search) {
    const barcode = value.trim();
    if (!barcode) { searchRef.current?.focus(); return; }
    setBarcodeBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/pos/barcode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ barcode }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not look up that barcode.");
      const matches = (result.matches ?? []) as PosProduct[];
      if (matches.length === 0) { setMessage("No exact barcode match. Choose a product from the search results."); return; }
      if (matches.length > 1) { setMessage("That barcode matches more than one item. Search for the product by name."); return; }
      if (matches[0].stock_quantity < 1) { setMessage(matches[0].product_name + " is out of stock."); return; }
      addToCart(matches[0]);
      setSearch("");
      setMessage(matches[0].product_name + (matches[0].variant_name ? " / " + matches[0].variant_name : "") + " added to the sale.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not look up that barcode.");
    } finally {
      setBarcodeBusy(false);
    }
  }

  async function reopenReceipt(orderId: string) {
    setMessage("");
    try {
      const db = createClient();
      const { data: { user } } = await db.auth.getUser();
      if (!user) throw new Error("Please sign in again to view this receipt.");
      const { data: order, error: orderError } = await db.from("orders")
        .select("id,order_number,created_at,subtotal,discount_total,total,payment_method,payment_status,customer_id")
        .eq("id", orderId).eq("created_by", user.id).eq("sales_channel", "pos").maybeSingle();
      if (orderError || !order) throw new Error("This sale could not be found in your records.");
      const { data: lines, error: linesError } = await db.from("order_items")
        .select("product_name_snapshot,quantity,unit_price,line_total").eq("order_id", order.id);
      if (linesError) throw linesError;
      let customerName: string | null = null;
      let customerPhone: string | null = null;
      if (order.customer_id) {
        const { data: customer } = await db.from("customers").select("full_name,phone").eq("id", order.customer_id).maybeSingle();
        customerName = customer?.full_name ?? null;
        customerPhone = customer?.phone ?? null;
      }
      setReceipt({
        order_number: order.order_number, created_at: order.created_at, subtotal: Number(order.subtotal),
        discount_total: Number(order.discount_total), total: Number(order.total),
        payment_method: order.payment_method || "other", payment_status: order.payment_status,
        customer_name: customerName, customer_phone: customerPhone,
        items: (lines ?? []).map((line) => ({ name: line.product_name_snapshot, quantity: line.quantity, unit_price: Number(line.unit_price), line_total: Number(line.line_total) })),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open this receipt.");
    }
  }

  async function completeSale(event: FormEvent) {
    event.preventDefault();
    if (!cart.length) { setMessage("Add at least one product before recording a sale."); return; }
    if (!Number.isFinite(discountAmount) || discountAmount < 0 || discountAmount > subtotal) {
      setMessage("Discount must be zero or less than the product subtotal.");
      return;
    }
    setSavingSale(true);
    setMessage("");
    try {
      const db = createClient();
      const { data, error } = await db.rpc("record_pos_sale", {
        p_items: cart.map((item) => ({ product_id: item.product_id, variant_id: item.variant_id, quantity: item.quantity })),
        p_payment_method: paymentMethod,
        p_payment_status: paymentStatus,
        p_discount_total: discountAmount,
        p_customer_name: customerName.trim() || null,
        p_customer_phone: customerPhone.trim() || null,
      });
      if (error) throw error;
      setReceipt(data as Receipt);
      setMessage("Sale recorded successfully. Receipt " + (data as Receipt).order_number + ".");
      setCart([]);
      setDiscount("");
      setCustomerName("");
      setCustomerPhone("");
      const { data: refreshed, error: refreshError } = await db.rpc("search_pos_products", { p_search: search.trim(), p_limit: 50 });
      if (!refreshError) setProducts((refreshed ?? []) as PosProduct[]);
      if (staffId) void loadSalesHistory(staffId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record this sale. Check current stock and try again.");
    } finally {
      setSavingSale(false);
    }
  }

  function printReceipt() {
    if (!receipt) return;
    document.body.classList.add("printing-receipt");
    window.print();
  }

  async function signOut() {
    const db = createClient();
    await db.auth.signOut();
    router.replace("/login");
  }

  return <>
    <SiteNav />
    <main className="page shell">
      <div className="pos-heading"><div><div className="eyebrow">Store counter</div><h1 className="page-title">Point of sale</h1><p className="muted">Signed in as {staffName || "team member"}. Search the catalogue, check retail prices, and record a counter sale.</p></div><div className="row-actions">{["owner", "admin"].includes(staffRole) && <button className="btn secondary" type="button" onClick={() => router.push("/admin")}>Admin dashboard</button>}<button className="btn ghost" type="button" onClick={signOut}>Sign out</button></div></div>
      {message && <div className="notice" role="status" style={{ margin: "18px 0" }}>{message}</div>}
      {checkingAccess ? <div className="panel">Checking staff access…</div> : !authorized ? <div className="panel"><p>This page is for active store staff.</p><button className="btn secondary" onClick={() => router.push("/login")}>Go to staff sign in</button></div> : <><section className="pos-sales-summary" aria-label="Your sales totals">{([["Today", salesSummary.today, salesSummary.todayCount, salesSummary.todayPaidCount], ["Yesterday", salesSummary.yesterday, salesSummary.yesterdayCount, null], ["Last 7 days", salesSummary.week, salesSummary.weekCount, null], ["This month", salesSummary.month, salesSummary.monthCount, null]] as const).map(([label, amount, count, paid]) => <article className="pos-summary-card" key={label}><span>{label}</span><strong>{loadingSales ? "Loading…" : formatSLE(amount)}</strong><small>{loadingSales ? " " : count + " sale" + (count === 1 ? "" : "s") + (paid !== null ? " · " + paid + " paid" : "")}</small></article>)}</section>{salesError && <p className="muted" role="status">Your sales totals are temporarily unavailable. Refresh the page to try again.</p>}<p className="pos-helper muted">Totals include your recorded sales, including unpaid sales, and exclude cancelled or refunded sales.</p><div className="pos-layout">
        <section className="panel pos-products">
          <h2>Find a product</h2>
          <label className="fieldlabel" htmlFor="pos-search">Search by name, or scan a barcode / SKU</label>
          <div className="pos-scan-row"><input ref={searchRef} id="pos-search" className="field" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void scanBarcode(); } }} placeholder="Search or scan a product code…" autoComplete="off" /><button type="button" className="smallbtn" disabled={barcodeBusy} onClick={() => search.trim() ? void scanBarcode() : searchRef.current?.focus()}>{barcodeBusy ? "Looking…" : search.trim() ? "Add code" : "Use scanner"}</button><button type="button" className="smallbtn" disabled={barcodeBusy || cameraScanning} onClick={() => void startCameraScan()}>{cameraScanning ? "Scanning…" : "Use camera"}</button>{cameraScanning && <button type="button" className="smallbtn" onClick={stopCameraScan}>Stop</button>}</div><video ref={videoRef} className="pos-camera-view" muted playsInline aria-label="Camera barcode preview" style={{ display: cameraScanning ? "block" : "none" }} />
          <p className="muted pos-helper">Only retail prices are shown. Cost and wholesale prices are not available in this screen.</p>
          {loadingProducts ? <p className="muted">Searching…</p> : <div className="pos-results">{products.map((product) => <article className="pos-product" key={cartKey(product)}>
            <div><strong>{product.product_name}{product.variant_name ? ` / ${product.variant_name}` : ""}</strong><span>{product.category_name} · {product.stock_quantity > 0 ? `${product.stock_quantity} available` : "Out of stock"}</span></div>
            <strong className="pos-price">{formatSLE(product.retail_price)}</strong>
            <button type="button" className="smallbtn" disabled={product.stock_quantity < 1} onClick={() => addToCart(product)}>Add</button>
          </article>)}{!products.length && <div className="empty">No products found. Try another name or product code.</div>}</div>}
        </section>

        <form className="panel pos-cart" onSubmit={completeSale}>
          <div className="section-head"><div><h2>Current sale</h2><p>{cart.length} product line{cart.length === 1 ? "" : "s"}</p></div><button className="smallbtn" type="button" disabled={!cart.length} onClick={() => setCart([])}>Clear</button></div>
          <div className="pos-cart-lines">{cart.map((item) => <div className="pos-cart-line" key={cartKey(item)}>
            <div><strong>{item.product_name}{item.variant_name ? ` / ${item.variant_name}` : ""}</strong><span>{formatSLE(item.retail_price)} each</span></div>
            <div className="pos-quantity"><button type="button" className="smallbtn" aria-label={`Remove one ${item.product_name}`} onClick={() => changeQuantity(item, -1)}>−</button><strong>{item.quantity}</strong><button type="button" className="smallbtn" aria-label={`Add one ${item.product_name}`} onClick={() => changeQuantity(item, 1)}>+</button></div>
            <strong>{formatSLE(item.retail_price * item.quantity)}</strong>
          </div>)}{!cart.length && <div className="empty">Search for a product and add it to this sale.</div>}</div>
          <div className="formgrid pos-details">
            <div><label className="fieldlabel" htmlFor="pos-customer">Customer name (optional)</label><input id="pos-customer" className="field" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></div>
            <div><label className="fieldlabel" htmlFor="pos-phone">Customer phone (optional)</label><input id="pos-phone" className="field" type="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></div>
            <div><label className="fieldlabel" htmlFor="pos-payment">Payment method *</label><select id="pos-payment" className="field" required value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option></select></div>
            <div><label className="fieldlabel" htmlFor="pos-payment-status">Payment received?</label><select id="pos-payment-status" className="field" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}><option value="paid">Yes, paid in full</option><option value="unpaid">No, unpaid sale</option></select></div>
            <div className="full"><label className="fieldlabel" htmlFor="pos-discount">Discount for this sale (SLE)</label><input id="pos-discount" className="field" type="number" min="0" step=".01" max={subtotal} value={discount} onChange={(event) => setDiscount(event.target.value)} /></div>
          </div>
          <div className="pos-totals"><div><span>Subtotal</span><strong>{formatSLE(subtotal)}</strong></div><div><span>Discount</span><strong>− {formatSLE(discountAmount)}</strong></div><div className="pos-grand-total"><span>Total</span><strong>{formatSLE(total)}</strong></div></div>
          <button className="btn pos-submit" disabled={!cart.length || savingSale}>{savingSale ? "Recording sale…" : "Complete sale and update stock"}</button>
          <p className="muted pos-helper">The sale is saved to the store records. Stock and the price are verified by the database when you complete it.</p>
        </form>
      </div><section className="panel pos-history"><div className="section-head"><div><h2>Recent sales</h2><p>Your latest counter sales</p></div></div>{loadingSales && !recentSales.length ? <p className="muted">Loading your sales…</p> : recentSales.length ? <div className="pos-history-list">{recentSales.map((sale) => <article className="pos-history-row" key={sale.id}><div><strong>{sale.order_number}</strong><span>{formatDateTime(sale.created_at)} · {sale.payment_status.replaceAll("_", " ")}</span></div><strong>{formatSLE(sale.total)}</strong><button type="button" className="smallbtn" onClick={() => void reopenReceipt(sale.id)}>View receipt</button></article>)}</div> : <p className="muted">No counter sales recorded yet.</p>}</section></>}

      {receipt && <div className="receipt-backdrop" role="dialog" aria-modal="true" aria-labelledby="pos-receipt-title" onClick={(event) => { if (event.target === event.currentTarget) setReceipt(null); }}>
        <article className="receipt-sheet">
          <div className="receipt-actions"><button type="button" className="btn secondary" onClick={() => setReceipt(null)}>Close</button><button type="button" className="btn" onClick={printReceipt}>Print / Save as PDF</button></div>
          <header className="receipt-header"><div className="brandmark">AC</div><div><h2 id="pos-receipt-title">Abi-Chris Fashion and Store</h2><p>Point of sale receipt</p></div></header>
          <div className="receipt-order-meta"><div><span>Receipt number</span><strong>{receipt.order_number}</strong></div><div><span>Date</span><strong>{formatDateTime(receipt.created_at)}</strong></div></div>
          {(receipt.customer_name || receipt.customer_phone) && <section className="receipt-customer"><h3>Customer</h3>{receipt.customer_name && <strong>{receipt.customer_name}</strong>}{receipt.customer_phone && <span>{receipt.customer_phone}</span>}</section>}
          <table className="receipt-items"><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>{receipt.items.map((item, index) => <tr key={`${receipt.order_number}-${index}`}><td>{item.name}</td><td>{item.quantity}</td><td>{formatSLE(item.line_total)}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Subtotal</th><th>{formatSLE(receipt.subtotal)}</th></tr>{Number(receipt.discount_total) > 0 && <tr><th colSpan={2}>Discount</th><th>− {formatSLE(receipt.discount_total)}</th></tr>}<tr><th colSpan={2}>Total</th><th>{formatSLE(receipt.total)}</th></tr></tfoot></table>
          <div className="receipt-payment"><span>Payment method: <strong>{receipt.payment_method.replaceAll("_", " ")}</strong></span><span>Status: <strong>{receipt.payment_status}</strong></span></div>
          <p className="receipt-thanks">Thank you for shopping with Abi-Chris.</p>
        </article>
      </div>}
    </main>
    <Footer />
  </>;
}
