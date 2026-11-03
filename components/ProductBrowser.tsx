"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { PackageOpen, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatSLE } from "@/lib/money";

const PAGE_SIZE = 24;
const BASKET_STORAGE_KEY = "abi-chris-store-basket-v1";

type Product = {
  id: string;
  name: string;
  description: string | null;
  retail_price: number;
  image_url: string | null;
  category_name: string | null;
  total_count?: number;
};
type ProductOption = { id: string; variant_name: string; attributes: { size?: string; colour?: string }; retail_price: number; is_available: boolean };
type BasketLine = { key: string; product_id: string; variant_id: string | null; name: string; price: number; quantity: number };

export default function ProductBrowser() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState("");
  const [retrySearch, setRetrySearch] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [resultCount, setResultCount] = useState(0);
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [basketReady, setBasketReady] = useState(false);
  const [basketMessage, setBasketMessage] = useState("");
  const [choosingProduct, setChoosingProduct] = useState<Product | null>(null);
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [selectedOption, setSelectedOption] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash_on_delivery");
  const [submitting, setSubmitting] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");
  const requestVersion = useRef(0);

  async function loadCatalogue(searchTerm: string, pageOffset: number) {
    const db = createClient();
    const { data, error } = await db.rpc("search_public_products", {
      search_term: searchTerm.trim() || null,
      result_limit: PAGE_SIZE,
      result_offset: pageOffset,
    });
    if (!error) {
      const rows = (data ?? []) as Product[];
      return { rows, count: Number(rows[0]?.total_count ?? 0) };
    }

    // Older database setups may have the secure public_products view but not the
    // optional paged-search function. Fall back to that narrow view, never products.
    const safeTerm = searchTerm.trim().replace(/[,%()\\"*]/g, " ").replace(/\s+/g, " ");
    let fallback = db.from("public_products")
      .select("id,name,description,retail_price,category_name,image_url", { count: "exact" })
      .order("name", { ascending: true })
      .range(pageOffset, pageOffset + PAGE_SIZE - 1);
    if (safeTerm) {
      const pattern = `%${safeTerm}%`;
      fallback = fallback.or(`name.ilike.${pattern},description.ilike.${pattern},category_name.ilike.${pattern}`);
    }
    const viewResult = await fallback;
    if (viewResult.error) throw viewResult.error;
    return { rows: (viewResult.data ?? []) as Product[], count: viewResult.count ?? 0 };
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(BASKET_STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const safeLines = parsed.filter((item): item is BasketLine => Boolean(item)
            && typeof item.key === "string"
            && typeof item.product_id === "string"
            && (item.variant_id === null || typeof item.variant_id === "string")
            && typeof item.name === "string"
            && typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0
            && typeof item.quantity === "number" && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 50);
          setBasket(safeLines);
        }
      }
    } catch {
      try { window.localStorage.removeItem(BASKET_STORAGE_KEY); } catch { /* Browser storage may be disabled. */ }
    } finally {
      setBasketReady(true);
    }
  }, []);

  useEffect(() => {
    if (!basketReady) return;
    try {
      window.localStorage.setItem(BASKET_STORAGE_KEY, JSON.stringify(basket));
    } catch {
      setBasketMessage("Your basket is available now, but this browser could not save it for a later visit.");
    }
  }, [basket, basketReady]);

  useEffect(() => {
    const version = ++requestVersion.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setMessage("");
      try {
        if (version !== requestVersion.current) return;
        const { rows, count } = await loadCatalogue(query, 0);
        if (version !== requestVersion.current) return;
        setProducts(rows);
        setResultCount(count);
        setOffset(rows.length);
        setHasMore(rows.length < count);
      } catch {
        if (version === requestVersion.current) {
          setProducts([]);
          setMessage("The shop catalogue could not be loaded. Check the database setup, then try again.");
        }
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query, retrySearch]);

  async function loadMore() {
    if (loading || loadingMore || !hasMore) return;
    const version = requestVersion.current;
    setLoadingMore(true);
    try {
      const { rows } = await loadCatalogue(query, offset);
      if (version !== requestVersion.current) return;
      setProducts((current) => [...current, ...rows]);
      setOffset((current) => current + rows.length);
      setHasMore(offset + rows.length < resultCount);
    } catch {
      setMessage("More products could not be loaded. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
  }

  function addLine(product: Product, option?: ProductOption) {
    const key = option?.id ?? product.id;
    const name = option ? `${product.name} — ${option.variant_name}` : product.name;
    if ((basket.find((item) => item.key === key)?.quantity ?? 0) >= 50) {
      setBasketMessage("The limit is 50 of each product or variation per order.");
      return;
    }
    const line: BasketLine = {
      key, product_id: product.id, variant_id: option?.id ?? null, name,
      price: option?.retail_price ?? product.retail_price, quantity: 1,
    };
    setBasket((current) => {
      const existing = current.find((item) => item.key === key);
      return existing ? current.map((item) => item.key === key ? { ...item, quantity: item.quantity + 1 } : item) : [...current, line];
    });
    setBasketMessage(`${name} added. Your basket is saved on this device if you refresh the page.`);
    setOrderMessage("");
  }

  async function chooseProduct(product: Product) {
    setOrderMessage("");
    try {
      const db = createClient();
      const { data, error } = await db.rpc("get_public_product_variants", { p_product_id: product.id });
      if (error) throw error;
      const productOptions = (data ?? []) as ProductOption[];
      if (!productOptions.length) addLine(product);
      else {
        setChoosingProduct(product);
        setOptions(productOptions);
        setSelectedOption(productOptions.find((option) => option.is_available)?.id ?? "");
      }
    } catch {
      setOrderMessage("Shopping setup is not ready yet. The store team needs to apply the customer order SQL upgrade first.");
    }
  }

  function changeQuantity(key: string, quantity: number) {
    setBasket((current) => quantity < 1 ? current.filter((line) => line.key !== key) : current.map((line) => line.key === key ? { ...line, quantity: Math.min(quantity, 50) } : line));
    if (quantity < 1) setBasketMessage("Product removed from your basket.");
  }

  async function submitOrder(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const whatsappTab = window.open("about:blank", "_blank");
    setSubmitting(true);
    setOrderMessage("");
    try {
      const db = createClient();
      const { data, error } = await db.rpc("submit_online_order", {
        p_customer_name: customerName,
        p_customer_email: customerEmail,
        p_customer_phone: customerPhone,
        p_delivery_address: deliveryAddress,
        p_payment_method: paymentMethod,
        p_items: basket.map((line) => ({ product_id: line.product_id, variant_id: line.variant_id, quantity: line.quantity })),
      });
      if (error) throw error;
      const itemSummary = basket.map((line) => `${line.quantity} x ${line.name}`).join("\n");
      const whatsappMessage = [
        `Hello Abi-Chris, I have submitted online order request ${data}.`,
        "Please confirm product availability, delivery or collection arrangements, and the final delivery fee.",
        "",
        "Items:",
        itemSummary,
        `Name: ${customerName.trim()}`,
        `Phone / WhatsApp: ${customerPhone.trim()}`,
        `Payment preference: ${paymentMethod.replaceAll("_", " ")}`,
        "The complete order details are saved on the website. Please confirm availability, final prices, delivery fee, and payment. No payment has been taken.",
      ].join("\n");
      const whatsappNumber = (process.env.NEXT_PUBLIC_STORE_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
      const whatsappUrl = whatsappNumber
        ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`
        : `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;
      setOrderMessage(`Order request ${data} is saved on the website. Opening WhatsApp so you can send the order details to the store.`);
      if (whatsappTab) {
        whatsappTab.opener = null;
        whatsappTab.location.href = whatsappUrl;
      } else {
        window.location.assign(whatsappUrl);
      }
      setBasket([]);
      setBasketMessage("");
      setCheckoutOpen(false);
    } catch (error) {
      whatsappTab?.close();
      const detail = error instanceof Error ? error.message.toLowerCase() : "";
      setOrderMessage(detail.includes("stock") || detail.includes("available")
        ? "One or more items are no longer available in that quantity. Please review your basket and try again."
        : "We could not save your order just now. Your basket is still saved on this device; please try again or contact the store.");
    } finally {
      setSubmitting(false);
    }
  }

  const basketTotal = basket.reduce((sum, line) => sum + line.price * line.quantity, 0);

  return <>
    <form className="search" style={{ marginBottom: 20 }} onSubmit={submitSearch}>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all products and categories…" aria-label="Search all products and categories" />
      <button className="btn" type="submit" aria-label="Search"><Search size={17} /></button>
      {query && <button className="btn secondary" type="button" onClick={() => setQuery("")}>Clear</button>}
    </form>
    <p className="muted" aria-live="polite" style={{ margin: "0 0 14px", fontSize: 13 }}>{loading ? "Searching products…" : `${resultCount} ${resultCount === 1 ? "product" : "products"} found`}</p>
    <div className="product-grid">
      {loading ? <div className="empty">Searching the catalogue…</div>
        : products.length ? products.map((product) => <article className="product-card" key={product.id}>
          <div className="product-image">{product.image_url ? <img src={product.image_url} alt={product.name} /> : <PackageOpen className="placeholder" size={38} />}</div>
          <div className="product-body">
            <div className="category">{product.category_name || "General merchandise"}</div>
            <h3>{product.name}</h3>
            <div className="product-price">{formatSLE(product.retail_price)}</div>
            <div className="product-meta">Stock is checked when you submit your order</div>
            <button className="smallbtn" style={{ marginTop: 12 }} onClick={() => chooseProduct(product)}>Add to basket</button>
          </div>
        </article>)
          : <div className="empty"><PackageOpen size={28} /><p>{message || "No published products match your search yet."}</p>{message ? <button className="btn secondary" onClick={() => setRetrySearch((value) => value + 1)}>Try again</button> : <span>Try another search or check back as the catalogue grows.</span>}</div>}
    </div>
    {hasMore && <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
      <button className="btn secondary" onClick={loadMore} disabled={loading || loadingMore}>{loadingMore ? "Loading…" : "Load more products"}</button>
    </div>}
    {choosingProduct && <div className="panel" style={{ marginTop: 22 }}>
      <div className="section-head"><div><h3 style={{ margin: 0 }}>Choose a size or colour</h3><p>{choosingProduct.name}</p></div><button className="smallbtn" onClick={() => setChoosingProduct(null)}>Close</button></div>
      <div className="stack" style={{ maxWidth: 500 }}>
        <select className="field" value={selectedOption} onChange={(event) => setSelectedOption(event.target.value)}>
          <option value="">Select a variation</option>
          {options.map((option) => <option key={option.id} value={option.id} disabled={!option.is_available}>{option.variant_name}{option.is_available ? ` · ${formatSLE(option.retail_price)}` : " · out of stock"}</option>)}
        </select>
        <button className="btn" disabled={!selectedOption || !options.find((option) => option.id === selectedOption)?.is_available} onClick={() => { const option = options.find((item) => item.id === selectedOption); if (option && choosingProduct) addLine(choosingProduct, option); setChoosingProduct(null); }}>Add selected variation</button>
      </div>
    </div>}
    {basketMessage && <p className="notice" role="status" aria-live="polite" style={{ marginTop: 18 }}>{basketMessage} <a href="#customer-basket" style={{ fontWeight: 700, textDecoration: "underline" }}>View basket</a></p>}
    <section id="customer-basket" className="panel" style={{ marginTop: 26 }}>
      <div className="section-head"><div><h2 style={{ margin: 0 }}>Your basket ({basket.reduce((sum, line) => sum + line.quantity, 0)})</h2><p>Online order request</p></div>{basket.length > 0 && <button className="smallbtn" onClick={() => { setBasket([]); setBasketMessage("Basket cleared."); setOrderMessage(""); }}>Clear basket</button>}</div>
      {basket.length ? <>
        <div className="table-wrap"><table><thead><tr><th>Product</th><th>Price</th><th>Quantity</th><th>Line total</th><th></th></tr></thead><tbody>
          {basket.map((line) => <tr key={line.key}><td>{line.name}</td><td>{formatSLE(line.price)}</td><td><input className="field" style={{ width: 90 }} type="number" min="0" max="50" value={line.quantity} onChange={(event) => changeQuantity(line.key, Number(event.target.value))} /></td><td>{formatSLE(line.price * line.quantity)}</td><td><button className="smallbtn" onClick={() => changeQuantity(line.key, 0)}>Remove</button></td></tr>)}
        </tbody></table></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 14 }}><strong>Products total: {formatSLE(basketTotal)}</strong><button className="btn" onClick={() => setCheckoutOpen((open) => !open)}>{checkoutOpen ? "Close checkout" : "Continue to checkout"}</button></div>
        {checkoutOpen && <form className="formgrid" style={{ marginTop: 20 }} onSubmit={submitOrder}>
          <div><label className="fieldlabel" htmlFor="order-name">Your name *</label><input id="order-name" className="field" required value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></div>
          <div><label className="fieldlabel" htmlFor="order-email">Email *</label><input id="order-email" className="field" type="email" required value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} /></div>
          <div><label className="fieldlabel" htmlFor="order-phone">Phone / WhatsApp *</label><input id="order-phone" className="field" required value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></div>
          <div><label className="fieldlabel" htmlFor="order-address">Delivery or collection address *</label><input id="order-address" className="field" required value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} /></div>
          <div><label className="fieldlabel" htmlFor="order-payment">How do you plan to pay?</label><select id="order-payment" className="field" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash_on_delivery">Cash on delivery / collection</option><option value="mobile_money">Mobile money (store will provide instructions)</option><option value="bank_transfer">Bank transfer (store will provide instructions)</option></select></div>
          <div className="full notice">Submitting creates an unpaid order request. The store must confirm product availability and delivery fee. This website does not collect payment.</div>
          <div className="full"><button className="btn" disabled={submitting}>{submitting ? "Sending order…" : "Submit order request"}</button></div>
        </form>}
      </> : <p className="muted">Your basket is empty. Add products above to start an order.</p>}
      {orderMessage && <div className="notice" style={{ marginTop: 16 }}>{orderMessage}</div>}
    </section>
  </>;
}
