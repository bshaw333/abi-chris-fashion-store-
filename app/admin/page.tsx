"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteNav from "@/components/SiteNav";
import Footer from "@/components/Footer";
import ClearBusinessDataButton from "@/components/ClearBusinessDataButton";
import { createClient } from "@/lib/supabase/client";
import { formatSLE } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/datetime";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  description: string | null;
  retail_price: number;
  wholesale_price: number | null;
  cost_price: number;
  is_published: boolean;
  stock_quantity: number;
  low_stock_threshold: number;
  category_name?: string | null;
};

type Category = { id: string; name: string; slug: string; parent_id: string | null };
type AuditEntry = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: { before?: Record<string, unknown>; after?: Record<string, unknown> };
  created_at: string;
  actor_name?: string;
};
type TeamMember = { id: string; full_name: string; role: string; is_active: boolean };
type ProductVariant = {
  id: string; product_id: string; sku: string | null; variant_name: string;
  attributes: { size?: string; colour?: string };
  retail_price: number | null; wholesale_price: number | null; cost_price: number;
  stock_quantity: number; low_stock_threshold: number; is_active: boolean;
};
type WholesaleApplication = {
  id: string; contact_name: string; business_name: string; email: string;
  phone: string | null; details: string | null; status: string; created_at: string;
};
type OnlineOrder = {
  id: string; order_number: string; customer_id: string; created_at: string;
  order_status: string; payment_status: string; payment_method: string | null; total: number;
  customer?: { full_name: string; email: string | null; phone: string | null; address: string | null };
  lines?: { product_name_snapshot: string; quantity: number; line_total: number }[];
};
type ProfitSummary = { paid_sales: number; product_cost: number; operating_expenses: number; net_profit: number; fully_paid_orders: number; excluded_orders: number };
type SalesAnalysisDay = { sale_date: string; merchandise_sales: number; delivery_fees: number; paid_orders: number };
type BestSeller = { product_name: string; units_sold: number; net_product_sales: number };
type SalesAnalysis = { from_date: string; to_date: string; merchandise_sales: number; delivery_fees: number; paid_orders: number; daily_sales: SalesAnalysisDay[]; best_sellers: BestSeller[] };

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { value += '"'; index++; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"' && value.length === 0) quoted = true;
    else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += char;
  }
  if (value.length || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

function csvEscape(value: string | number | null | undefined) {
  const rawText = String(value ?? "");
  const text = /^[\t\r ]*[=+\-@]/.test(rawText) ? `'${rawText}` : rawText;
  return `"${text.replace(/"/g, '""')}"`;
}

function auditLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = { INSERT: "Created", UPDATE: "Updated", DELETE: "Removed" };
  return labels[action.toUpperCase()] ?? auditLabel(action);
}

function auditValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return "Updated";
  if (/(price|cost|amount|total)/i.test(field) && typeof value === "number") return formatSLE(value);
  return String(value);
}

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [role, setRole] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditReady, setAuditReady] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("salesperson");
  const [staffInviteBusy, setStaffInviteBusy] = useState(false);
  const [staffInviteMessage, setStaffInviteMessage] = useState("");
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [variantName, setVariantName] = useState("");
  const [variantSize, setVariantSize] = useState("");
  const [variantColour, setVariantColour] = useState("");
  const [variantSku, setVariantSku] = useState("");
  const [variantRetail, setVariantRetail] = useState("");
  const [variantWholesale, setVariantWholesale] = useState("");
  const [variantCost, setVariantCost] = useState("0");
  const [variantStock, setVariantStock] = useState("0");
  const [variantLowThreshold, setVariantLowThreshold] = useState("5");
  const [receiveQuantity, setReceiveQuantity] = useState<Record<string, string>>({});
  const [applications, setApplications] = useState<WholesaleApplication[]>([]);
  const [applicationsReady, setApplicationsReady] = useState(true);
  const [onlineOrders, setOnlineOrders] = useState<OnlineOrder[]>([]);
  const [receiptOrder, setReceiptOrder] = useState<OnlineOrder | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [ordersReady, setOrdersReady] = useState(true);
  const [profitReady, setProfitReady] = useState(true);
  const [profitSummary, setProfitSummary] = useState<ProfitSummary | null>(null);
  const [today, setToday] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expensePaymentMethod, setExpensePaymentMethod] = useState("");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryParentId, setNewCategoryParentId] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const [analysisPeriod, setAnalysisPeriod] = useState("30");
  const [salesAnalysis, setSalesAnalysis] = useState<SalesAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [importingProducts, setImportingProducts] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [savingProduct, setSavingProduct] = useState(false);
  const [exportingProducts, setExportingProducts] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [retail, setRetail] = useState("");
  const [wholesale, setWholesale] = useState("");
  const [cost, setCost] = useState("");
  const [stock, setStock] = useState("0");
  const [lowStockThreshold, setLowStockThreshold] = useState("5");
  const [description, setDescription] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [published, setPublished] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  async function load() {
    const db = createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }

    setUser(user.email ?? "");
    const { data: profile } = await db
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !["owner", "admin"].includes(profile.role)) {
      setMessage("Your account does not have administrator access. Ask an owner to assign the correct role.");
      setBusy(false);
      return;
    }

    setRole(profile.role);
    const [productResult, categoryResult, auditResult, staffResult, applicationResult, orderResult, customerResult, orderLineResult, profitResult] = await Promise.all([
      db.from("products")
        .select("id,name,sku,retail_price,wholesale_price,cost_price,description,is_published,stock_quantity,low_stock_threshold,category_id")
        .order("created_at", { ascending: false })
        .limit(500),
      db.from("categories").select("id,name,slug,parent_id").order("name"),
      db.from("audit_logs").select("id,actor_id,action,entity_type,entity_id,details,created_at").order("created_at", { ascending: false }).limit(25),
      db.from("profiles").select("id,full_name,role,is_active"),
      db.from("wholesale_applications").select("id,contact_name,business_name,email,phone,details,status,created_at").order("created_at", { ascending: false }).limit(100),
      db.from("orders").select("id,order_number,customer_id,created_at,order_status,payment_status,payment_method,total").eq("sales_channel", "online").order("created_at", { ascending: false }).limit(100),
      db.from("customers").select("id,full_name,email,phone,address"),
      db.from("order_items").select("order_id,product_name_snapshot,quantity,line_total"),
      db.rpc("get_admin_profit_summary"),
    ]);

    if (productResult.error) {
      setMessage(productResult.error.message);
    } else {
      const rows = productResult.data ?? [];
      setProducts(rows.map((product) => ({
        ...product,
        category_name: (() => {
          const category = categoryResult.data?.find((item) => item.id === product.category_id);
          const parent = categoryResult.data?.find((item) => item.id === category?.parent_id);
          return category ? (parent ? `${parent.name} / ${category.name}` : category.name) : null;
        })(),
      })));
    }

    if (categoryResult.error) setMessage(categoryResult.error.message);
    else if (categoryResult.data) setCategories(categoryResult.data);
    if (!auditResult.error && auditResult.data) {
      const staffNames = new Map((staffResult.data ?? []).map((member) => [member.id, member.full_name]));
      setAuditEntries((auditResult.data as AuditEntry[]).map((entry) => ({
        ...entry,
        actor_name: entry.actor_id ? staffNames.get(entry.actor_id) : undefined,
      })));
    } else setAuditReady(false);
    if (!staffResult.error && staffResult.data) setTeamMembers(staffResult.data as TeamMember[]);
    if (!applicationResult.error && applicationResult.data) setApplications(applicationResult.data as WholesaleApplication[]);
    else setApplicationsReady(false);
    if (!orderResult.error && !customerResult.error && !orderLineResult.error && orderResult.data) {
      const customersById = new Map((customerResult.data ?? []).map((customer) => [customer.id, customer]));
      const linesByOrder = new Map<string, OnlineOrder["lines"]>();
      for (const line of orderLineResult.data ?? []) {
        linesByOrder.set(line.order_id, [...(linesByOrder.get(line.order_id) ?? []), line]);
      }
      setOnlineOrders((orderResult.data as OnlineOrder[]).map((order) => ({
        ...order, customer: customersById.get(order.customer_id), lines: linesByOrder.get(order.id) ?? [],
      })));
    } else setOrdersReady(false);
    if (!profitResult.error && profitResult.data?.[0]) setProfitSummary(profitResult.data[0] as ProfitSummary);
    else setProfitReady(false);
    setBusy(false);
  }

  useEffect(() => {
    const currentDate = new Date().toISOString().slice(0, 10);
    setToday(currentDate);
    setExpenseDate(currentDate);
  }, []);

  useEffect(() => {
    const finishPrinting = () => document.body.classList.remove("printing-receipt");
    window.addEventListener("afterprint", finishPrinting);
    return () => window.removeEventListener("afterprint", finishPrinting);
  }, []);

  useEffect(() => {
    if (!receiptOrder) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReceiptOrder(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [receiptOrder]);

  function printOrderReceipt() {
    if (!receiptOrder) return;
    document.body.classList.add("printing-receipt");
    window.print();
  }

  useEffect(() => {
    load().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Could not load dashboard");
      setBusy(false);
    });
  }, []);

  useEffect(() => {
    if (activeSection !== "analyse" || !["owner", "admin"].includes(role)) return;
    let current = true;
    async function loadAnalysis() {
      setAnalysisLoading(true);
      setAnalysisError("");
      try {
        const end = new Date();
        const start = new Date(end);
        start.setUTCDate(start.getUTCDate() - Number(analysisPeriod) + 1);
        const db = createClient();
        const { data, error } = await db.rpc("get_admin_sales_analysis", {
          p_from_date: start.toISOString().slice(0, 10),
          p_to_date: end.toISOString().slice(0, 10),
        });
        if (error) throw error;
        if (current) setSalesAnalysis(data as SalesAnalysis);
      } catch (error) {
        if (current) setAnalysisError(error instanceof Error ? error.message : "Could not load sales analysis.");
      } finally {
        if (current) setAnalysisLoading(false);
      }
    }
    void loadAnalysis();
    return () => { current = false; };
  }, [activeSection, analysisPeriod, role]);

  useEffect(() => {
    if (activeSection !== "product" || !editingProductId) return;
    const frame = window.requestAnimationFrame(() => document.getElementById("product-form")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [activeSection, editingProductId]);

  async function addCategory() {
    const categoryName = newCategoryName.trim();
    if (!categoryName) {
      setMessage("Enter a name for the category.");
      return;
    }

    const parent = categories.find((category) => category.id === newCategoryParentId);
    const baseSlug = slugify(categoryName);
    if (!baseSlug) {
      setMessage("Please use a category name containing letters or numbers.");
      return;
    }
    const slug = parent ? `${parent.slug}-${baseSlug}` : baseSlug;

    setMessage("");
    try {
      const db = createClient();
      const { data, error } = await db
        .from("categories")
        .insert({ name: categoryName, slug, parent_id: parent?.id ?? null })
        .select("id,name,slug,parent_id")
        .single();

      if (error) throw error;
      const created = data as Category;
      setCategories((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryId(created.id);
      setNewCategoryName("");
      setNewCategoryParentId("");
      setShowCategoryForm(false);
      setMessage(`“${created.name}” was added and selected for this product.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add the category.");
    }
  }

  async function addExpense(event: FormEvent) {
    event.preventDefault();
    if (savingExpense) return;
    const amount = Number(expenseAmount);
    if (!expenseCategory.trim() || !expenseDescription.trim() || !Number.isFinite(amount) || amount <= 0) {
      setMessage("Enter an expense category, description, and amount greater than zero.");
      return;
    }
    setSavingExpense(true);
    try {
      const db = createClient();
      const { data: { user } } = await db.auth.getUser();
      if (!user) throw new Error("Please sign in again.");
      const { error } = await db.from("expenses").insert({
        expense_date: expenseDate, category: expenseCategory.trim(), description: expenseDescription.trim(),
        amount, payment_method: expensePaymentMethod || null, recorded_by: user.id,
      });
      if (error) throw error;
      setExpenseCategory(""); setExpenseDescription(""); setExpenseAmount(""); setExpensePaymentMethod("");
      setMessage("Expense recorded. The profit estimate has been refreshed.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record this expense.");
    } finally {
      setSavingExpense(false);
    }
  }

  async function addStaffProfile(event: FormEvent) {
    event.preventDefault();
    setStaffInviteBusy(true);
    setStaffInviteMessage("");
    try {
      const response = await fetch("/api/staff/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newStaffEmail, fullName: newStaffName, role: newStaffRole }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not send the staff invitation.");
      setTeamMembers((current) => [...current, result.member as TeamMember]);
      setNewStaffEmail("");
      setNewStaffName("");
      setNewStaffRole("salesperson");
      setStaffInviteMessage(`Invitation sent to ${newStaffEmail.trim()}. They can set their own password from the email.`);
    } catch (error) {
      setStaffInviteMessage(error instanceof Error ? error.message : "Could not send this staff invitation.");
    } finally {
      setStaffInviteBusy(false);
    }
  }

  async function updateStaff(member: TeamMember, changes: Partial<Pick<TeamMember, "role" | "is_active">>) {
    try {
      const db = createClient();
      const { error } = await db.from("profiles").update(changes).eq("id", member.id);
      if (error) throw error;
      setTeamMembers((current) => current.map((item) => item.id === member.id ? { ...item, ...changes } : item));
      setMessage(`Updated access for ${member.full_name || member.id.slice(0, 8)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update staff access.");
    }
  }

  async function openVariants(product: Product) {
    setVariantProduct(product);
    setEditingVariantId(null);
    setVariantName("");
    setVariantSize("");
    setVariantColour("");
    setVariantSku("");
    setVariantRetail("");
    setVariantWholesale("");
    setVariantCost("0");
    setVariantStock("0");
    setVariantLowThreshold("5");
    const db = createClient();
    const { data, error } = await db.rpc("get_admin_product_variants", { p_product_id: product.id });
    if (error) {
      setMessage("Variation setup is not ready yet. Apply the catalogue and inventory SQL upgrade, then try again.");
      setVariants([]);
      return;
    }
    setVariants((data ?? []) as ProductVariant[]);
    document.getElementById("variant-manager")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function editVariant(variant: ProductVariant) {
    setEditingVariantId(variant.id);
    setVariantName(variant.variant_name);
    setVariantSize(variant.attributes?.size ?? "");
    setVariantColour(variant.attributes?.colour ?? "");
    setVariantSku(variant.sku ?? "");
    setVariantRetail(variant.retail_price == null ? "" : String(variant.retail_price));
    setVariantWholesale(variant.wholesale_price == null ? "" : String(variant.wholesale_price));
    setVariantCost(String(variant.cost_price));
    setVariantStock("0");
    setVariantLowThreshold(String(variant.low_stock_threshold));
  }

  async function saveVariant(event: FormEvent) {
    event.preventDefault();
    if (!variantProduct) return;
    try {
      const db = createClient();
      const args = {
        p_variant_name: variantName.trim(), p_size: variantSize, p_colour: variantColour,
        p_sku: variantSku || null,
        p_retail_price: variantRetail ? Number(variantRetail) : null,
        p_wholesale_price: variantWholesale ? Number(variantWholesale) : null,
        p_cost_price: Number(variantCost || 0),
      };
      const result = editingVariantId
        ? await db.rpc("update_product_variant", { p_variant_id: editingVariantId, ...args, p_low_stock_threshold: Number(variantLowThreshold) })
        : await db.rpc("create_product_variant", { p_product_id: variantProduct.id, ...args, p_initial_stock: Number(variantStock || 0), p_low_stock_threshold: Number(variantLowThreshold) });
      if (result.error) throw result.error;
      setMessage(editingVariantId ? "Variation details updated." : "Product variation added.");
      await openVariants(variantProduct);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save this variation.");
    }
  }

  async function receiveVariantStock(variant: ProductVariant) {
    const quantity = Number(receiveQuantity[variant.id] ?? 0);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setMessage("Enter a whole-number quantity greater than zero to record stock received.");
      return;
    }
    try {
      const db = createClient();
      const { error } = await db.rpc("receive_variant_stock", {
        p_variant_id: variant.id, p_quantity: quantity, p_notes: "Stock received through admin dashboard",
      });
      if (error) throw error;
      setReceiveQuantity((current) => ({ ...current, [variant.id]: "" }));
      setMessage(`Received ${quantity} for ${variant.variant_name}. Stock history was updated.`);
      if (variantProduct) await openVariants(variantProduct);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record the stock receipt.");
    }
  }

  async function reviewApplication(application: WholesaleApplication, decision: "approved" | "rejected") {
    const prompt = decision === "approved"
      ? `Approve ${application.business_name}? Their sign-in account must already be created and confirmed with ${application.email}.`
      : `Reject the wholesale application from ${application.business_name}?`;
    if (!window.confirm(prompt)) return;
    try {
      const db = createClient();
      const { error } = await db.rpc("review_wholesale_application", { p_application_id: application.id, p_decision: decision });
      if (error) throw error;
      setMessage(decision === "approved" ? `Approved ${application.business_name}. They can sign in with ${application.email} to see wholesale prices.` : `Rejected ${application.business_name}'s application.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not review this application.");
    }
  }

  async function manageOnlineOrder(order: OnlineOrder, action: "confirm" | "paid" | "cancel") {
    const prompt = action === "confirm"
      ? `Confirm order ${order.order_number}? This checks current stock and deducts it from inventory. Payment will still be unpaid.`
      : action === "paid"
        ? `Record payment for ${order.order_number}? Only continue after you have verified that the money was received.`
        : `Cancel pending order ${order.order_number}?`;
    if (!window.confirm(prompt)) return;
    const rpc = action === "confirm" ? "confirm_online_order" : action === "paid" ? "mark_online_order_paid" : "cancel_online_order";
    try {
      const db = createClient();
      const { error } = await db.rpc(rpc, { p_order_id: order.id });
      if (error) throw error;
      setMessage(action === "confirm" ? `Order ${order.order_number} confirmed and stock committed.` : action === "paid" ? `Payment recorded for order ${order.order_number}.` : `Order ${order.order_number} cancelled.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update this order.");
    }
  }

  async function addProduct(event: FormEvent) {
    event.preventDefault();
    if (savingProduct) return;
    setMessage("");
    if (imageFiles.some((file) => !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024)) {
      setMessage("Each photo must be an image smaller than 5 MB.");
      return;
    }
    setSavingProduct(true);
    try {
      const db = createClient();
      const { data: { user } } = await db.auth.getUser();
      if (!user) throw new Error("Please sign in again.");
      const wasEditing = Boolean(editingProductId);

      const values = {
        name,
        sku: sku || null,
        category_id: categoryId || null,
        retail_price: Number(retail),
        wholesale_price: wholesale ? Number(wholesale) : null,
        cost_price: Number(cost || 0),
        stock_quantity: Number(stock || 0),
        low_stock_threshold: Number(lowStockThreshold || 0),
        description: description || null,
        is_published: published,
      };
      let productId = editingProductId;
      if (productId) {
        const { error } = await db.from("products").update(values).eq("id", productId);
        if (error) throw error;
      } else {
        const { data, error } = await db.from("products").insert({ ...values, created_by: user.id }).select("id").single();
        if (error) throw error;
        productId = data.id;
        setEditingProductId(productId);
      }

      if (imageFiles.length && productId) {
        for (const [index, imageFile] of imageFiles.entries()) {
          const safeFileName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const imagePath = `${productId}/${crypto.randomUUID()}-${safeFileName}`;
          const { error: uploadError } = await db.storage.from("product-images").upload(imagePath, imageFile, {
            contentType: imageFile.type,
            upsert: false,
          });
          if (uploadError) throw uploadError;

          const imageUrl = db.storage.from("product-images").getPublicUrl(imagePath).data.publicUrl;
          const { error: imageRowError } = await db.from("product_images").insert({
            product_id: productId,
            image_url: imageUrl,
            alt_text: name,
            sort_order: imageFiles.length - index,
          });
          if (imageRowError) throw imageRowError;
        }
      }

      setMessage(wasEditing ? "Product changes saved." : "Product saved successfully.");
      setEditingProductId(null);
      setName("");
      setSku("");
      setCategoryId("");
      setImageFiles([]);
      setRetail("");
      setWholesale("");
      setCost("");
      setStock("0");
      setLowStockThreshold("5");
      setDescription("");
      setPublished(false);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Product could not be saved.");
    } finally {
      setSavingProduct(false);
    }
  }

  function editProduct(product: Product) {
    setActiveSection("product");
    setEditingProductId(product.id);
    setName(product.name);
    setSku(product.sku ?? "");
    setCategoryId(product.category_id ?? "");
    setRetail(String(product.retail_price));
    setWholesale(product.wholesale_price == null ? "" : String(product.wholesale_price));
    setCost(String(product.cost_price ?? 0));
    setStock(String(product.stock_quantity));
    setLowStockThreshold(String(product.low_stock_threshold ?? 5));
    setDescription(product.description ?? "");
    setImageFiles([]);
    setPublished(product.is_published);
    setMessage(`Editing “${product.name}”.`);
  }

  function cancelEdit() {
    setEditingProductId(null);
    setName("");
    setSku("");
    setCategoryId("");
    setRetail("");
    setWholesale("");
    setCost("");
    setStock("0");
    setLowStockThreshold("5");
    setDescription("");
    setImageFiles([]);
    setPublished(false);
    setMessage("Editing cancelled.");
  }

  async function toggle(product: Product) {
    try {
      const db = createClient();
      const { error } = await db
        .from("products")
        .update({ is_published: !product.is_published })
        .eq("id", product.id);
      if (error) throw error;
      setProducts((current) => current.map((item) => item.id === product.id
        ? { ...item, is_published: !product.is_published }
        : item));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update product.");
    }
  }

  async function handleBusinessDataCleared() {
    setProfitSummary({ paid_sales: 0, product_cost: 0, operating_expenses: 0, net_profit: 0, fully_paid_orders: 0, excluded_orders: 0 });
    setOnlineOrders([]);
    setReceiptOrder(null);
    setSalesAnalysis(null);
    setMessage("");
    await load();
  }

  async function signOut() {
    const db = createClient();
    await db.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
    const content = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function downloadProductTemplate() {
    downloadCsv("abi-chris-product-template.csv", [
      ["name", "sku", "category", "description", "retail_price", "wholesale_price", "cost_price", "stock_quantity", "low_stock_threshold", "is_published"],
      ["Men's casual shirt", "SHIRT-001", "Clothing", "Cotton shirt", "250", "200", "120", "12", "3", "false"],
    ]);
  }

  async function exportProducts() {
    if (exportingProducts) return;
    setExportingProducts(true);
    setMessage("");
    try {
      const db = createClient();
      const allProducts: Product[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await db.from("products")
          .select("id,name,sku,category_id,description,retail_price,wholesale_price,cost_price,stock_quantity,low_stock_threshold,is_published")
          .order("created_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const page = (data ?? []) as Product[];
        allProducts.push(...page);
        if (page.length < pageSize) break;
      }
      const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
      downloadCsv("abi-chris-products-complete.csv", [
        ["name", "sku", "category", "description", "retail_price", "wholesale_price", "cost_price", "stock_quantity", "low_stock_threshold", "is_published"],
        ...allProducts.map((product) => [product.name, product.sku, product.category_id ? categoryNames.get(product.category_id) : "",
          product.description, product.retail_price, product.wholesale_price, product.cost_price, product.stock_quantity,
          product.low_stock_threshold, String(product.is_published)]),
      ]);
      setMessage(`Exported ${allProducts.length} products to a spreadsheet. Keep this file private because it includes wholesale prices and costs.`);
    } catch {
      setMessage("Could not export the complete product list. Check your administrator access and try again.");
    } finally {
      setExportingProducts(false);
    }
  }

  function exportOrders() {
    downloadCsv("abi-chris-online-orders.csv", [
      ["order_number", "order_date", "customer", "items", "order_value_sle", "payment_method", "payment_status", "order_status"],
      ...visibleOrders.map((order) => [
        order.order_number,
        order.created_at,
        order.customer?.full_name ?? "Customer",
        (order.lines ?? []).map((line) => `${line.quantity} x ${line.product_name_snapshot}`).join("; "),
        order.total,
        order.payment_method ?? "",
        order.payment_status,
        order.order_status,
      ]),
    ]);
  }

  function exportSalesAnalysis() {
    if (!salesAnalysis) return;
    downloadCsv("abi-chris-sales-analysis.csv", [
      ["record_type", "date_or_product", "units_sold", "paid_orders", "merchandise_sales_sle", "delivery_fees_sle"],
      ...salesAnalysis.daily_sales.map((day) => ["daily sales", day.sale_date, "", day.paid_orders, day.merchandise_sales, day.delivery_fees]),
      ...salesAnalysis.best_sellers.map((product) => ["best seller", product.product_name, product.units_sold, "", product.net_product_sales, ""]),
    ]);
  }

  async function importProducts(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setImportStatus("Choose a CSV file smaller than 5 MB.");
      input.value = "";
      return;
    }
    setImportingProducts(true);
    setImportStatus("");
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error("The CSV needs a header row and at least one product row.");
      const headers = rows[0].map((header) => header.trim().toLowerCase().replace(/[\s-]+/g, "_"));
      const column = (name: string) => headers.indexOf(name);
      if (column("name") < 0 || column("retail_price") < 0) {
        throw new Error("The CSV must include these columns: name, retail_price. Download the template to see all supported columns.");
      }
      const productRows = rows.slice(1).filter((row) => row.some((cell) => cell.trim()));
      if (!productRows.length) throw new Error("There are no product rows to import.");
      if (productRows.length > 500) throw new Error("Import up to 500 products at a time.");
      const db = createClient();
      const { data: { user } } = await db.auth.getUser();
      if (!user) throw new Error("Please sign in again before importing products.");
      const seenSkus = new Set<string>();
      const issues: string[] = [];
      const candidates: Array<{ rowNumber: number; product: Record<string, unknown> }> = [];
      let imported = 0;

      for (const [index, row] of productRows.entries()) {
        const rowNumber = index + 2;
        const read = (name: string) => {
          const position = column(name);
          return position < 0 ? "" : (row[position] ?? "").trim();
        };
        const name = read("name");
        const retailText = read("retail_price");
        const sku = read("sku") || null;
        if (!name || !retailText) { issues.push(`Row ${rowNumber}: product name and retail price are required.`); continue; }
        const retailPrice = Number(retailText);
        const wholesaleText = read("wholesale_price");
        const costText = read("cost_price");
        const stockText = read("stock_quantity") || "0";
        const thresholdText = read("low_stock_threshold") || "5";
        const wholesalePrice = wholesaleText ? Number(wholesaleText) : null;
        const costPrice = costText ? Number(costText) : 0;
        const stockQuantity = Number(stockText);
        const lowStockThreshold = Number(thresholdText);
        if (!Number.isFinite(retailPrice) || retailPrice < 0
          || (wholesalePrice !== null && (!Number.isFinite(wholesalePrice) || wholesalePrice < 0))
          || !Number.isFinite(costPrice) || costPrice < 0
          || !Number.isInteger(stockQuantity) || stockQuantity < 0
          || !Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
          issues.push(`Row ${rowNumber}: prices must be zero or higher; stock and alert values must be whole numbers.`);
          continue;
        }
        if (sku && seenSkus.has(sku.toLowerCase())) { issues.push(`Row ${rowNumber}: SKU ${sku} is repeated in this file.`); continue; }
        const categoryName = read("category");
        const matchingCategories = categoryName
          ? categories.filter((category) => category.name.trim().toLowerCase() === categoryName.toLowerCase())
          : [];
        if (categoryName && matchingCategories.length !== 1) {
          issues.push(`Row ${rowNumber}: category “${categoryName}” was not found or is ambiguous; add it in the dashboard first.`);
          continue;
        }
        if (sku) seenSkus.add(sku.toLowerCase());
        const publishText = read("is_published").toLowerCase();
        candidates.push({ rowNumber, product: {
          name, sku, category_id: matchingCategories[0]?.id ?? null,
          description: read("description") || null, retail_price: retailPrice,
          wholesale_price: wholesalePrice, cost_price: costPrice,
          stock_quantity: stockQuantity, low_stock_threshold: lowStockThreshold,
          is_published: ["true", "yes", "1"].includes(publishText), created_by: user.id,
        } });
      }
      if (candidates.length) {
        const { error: batchError } = await db.from("products").insert(candidates.map((candidate) => candidate.product));
        if (!batchError) imported = candidates.length;
        else if (batchError.code === "23505") {
          for (const candidate of candidates) {
            const { error } = await db.from("products").insert(candidate.product);
            if (error) issues.push(`Row ${candidate.rowNumber}: could not save${error.code === "23505" ? " because the SKU is already used" : "; check the row and permissions"}.`);
            else imported++;
          }
        } else throw new Error("The database could not save this import. Check the file and your permissions, then try again.");
      }
      const issueSummary = issues.slice(0, 5).join(" ");
      setImportStatus(`${imported} product${imported === 1 ? "" : "s"} imported; ${issues.length} row${issues.length === 1 ? "" : "s"} skipped.${issueSummary ? ` ${issueSummary}` : ""}${issues.length > 5 ? ` Plus ${issues.length - 5} more issue(s).` : ""}`);
      if (imported) await load();
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : "Could not read this CSV file.");
    } finally {
      setImportingProducts(false);
      input.value = "";
    }
  }

  const visibleProducts = products.filter((product) => {
    const term = productFilter.trim().toLowerCase();
    return !term || [product.name, product.sku, product.category_name].some((value) => value?.toLowerCase().includes(term));
  });
  const visibleOrders = onlineOrders.filter((order) => {
    const search = orderSearch.trim().toLowerCase();
    const orderDate = order.created_at.slice(0, 10);
    return (!search || [order.order_number, order.customer?.full_name, ...(order.lines ?? []).map((line) => line.product_name_snapshot)]
      .some((value) => value?.toLowerCase().includes(search)))
      && (!orderStatusFilter || order.order_status === orderStatusFilter)
      && (!paymentStatusFilter || order.payment_status === paymentStatusFilter)
      && (!paymentMethodFilter || (order.payment_method ?? "") === paymentMethodFilter)
      && (!orderDateFrom || orderDate >= orderDateFrom)
      && (!orderDateTo || orderDate <= orderDateTo);
  });
  const visibleOrderValue = visibleOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const visiblePaidValue = visibleOrders.filter((order) => order.payment_status === "paid")
    .reduce((sum, order) => sum + Number(order.total || 0), 0);
  const lowStockCount = products.filter((product) => product.stock_quantity <= product.low_stock_threshold).length;
  const publishedProductCount = products.filter((product) => product.is_published).length;
  const pendingOrderCount = onlineOrders.filter((order) => order.order_status === "pending").length;
  const dashboardSections: Array<{ id: string; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "profit", label: "Profit estimate" }, { id: "analyse", label: "Analyse" }, { id: "expense", label: "Record an expense" },
    { id: "product", label: "Add a product" }, { id: "import", label: "Import products from a spreadsheet" },
    { id: "inventory", label: "Product inventory" }, { id: "wholesale", label: "Wholesale applications" },
    { id: "orders", label: "Online order requests" },
  ];
  if (role === "owner") dashboardSections.push({ id: "staff", label: "Staff & access" });
  dashboardSections.push({ id: "changes", label: "Recent changes" });

  return <>
    <SiteNav />
    <main className="page shell">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 15, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">Store operations</div>
          <h1 className="page-title">Admin dashboard</h1>
          <p className="muted">Signed in as {user || "team member"} {role && `· ${role}`}</p>
        </div>
        <div className="row-actions">
          <button className="btn" onClick={() => router.push("/pos")}>Open POS</button>
          <button className="btn secondary" onClick={() => router.push("/")}>View store</button>
          <button className="btn ghost" onClick={signOut}>Sign out</button>
        </div>
      </div>

      {["owner", "admin"].includes(role) && (
        <div className="danger-zone">
          <ClearBusinessDataButton onCleared={handleBusinessDataCleared} />
        </div>
      )}

      {message && <div className="notice" style={{ marginTop: 18 }}>{message}</div>}

      <div className="admin-workspace">
        <nav className="admin-section-nav" aria-label="Admin dashboard sections">
          <p className="admin-nav-title">Dashboard sections</p>
          {dashboardSections.map(({ id, label }) => <button key={id} type="button" className={`admin-nav-item${activeSection === id ? " active" : ""}`} aria-current={activeSection === id ? "page" : undefined} onClick={() => setActiveSection(id)}>{label}</button>)}
        </nav>
        <div className="admin-workspace-content">
      {activeSection === "overview" && <div className="admin-overview">
        <section className="overview-welcome">
          <div className="overview-welcome-copy">
            <span className="overview-kicker">Your store at a glance</span>
            <h2>Welcome back{user ? `, ${user.split("@")[0]}` : ""}</h2>
            <p>See what needs attention today, then jump straight to the task you want to handle.</p>
          </div>
          <div className="overview-actions">
            <button className="btn overview-primary-action" type="button" onClick={() => setActiveSection("product")}>Add a product</button>
            <button className="btn overview-light-action" type="button" onClick={() => setActiveSection("orders")}>Review orders</button>
            <button className="overview-text-action" type="button" onClick={() => router.push("/pos")}>Open point of sale <span aria-hidden="true">→</span></button>
          </div>
        </section>

        <div className="admin-overview-stats" aria-label="Store summary">
          <button className="overview-stat" type="button" onClick={() => setActiveSection("inventory")}>
            <span className="overview-stat-label">Products in dashboard</span><strong>{products.length}</strong><small>View product inventory <span aria-hidden="true">→</span></small>
          </button>
          <button className="overview-stat" type="button" onClick={() => setActiveSection("inventory")}>
            <span className="overview-stat-label">Published products</span><strong>{publishedProductCount}</strong><small>Shown in the public shop</small>
          </button>
          <button className={`overview-stat${lowStockCount ? " attention" : ""}`} type="button" onClick={() => setActiveSection("inventory")}>
            <span className="overview-stat-label">Low stock</span><strong>{lowStockCount}</strong><small>{lowStockCount ? "Review items that need replenishing" : "No products below their stock threshold"}</small>
          </button>
          <button className={`overview-stat${pendingOrderCount ? " attention" : ""}`} type="button" onClick={() => setActiveSection("orders")}>
            <span className="overview-stat-label">Orders to review</span><strong>{pendingOrderCount}</strong><small>{pendingOrderCount ? "Pending online orders" : "No pending online orders"}</small>
          </button>
        </div>

        <div className="overview-lower">
          <section className="panel overview-quick-panel">
            <div className="overview-panel-heading"><div><span className="overview-kicker dark">Shortcuts</span><h2>Common tasks</h2></div></div>
            <div className="overview-shortcuts">
              <button type="button" onClick={() => setActiveSection("product")}><span className="shortcut-mark">＋</span><span><strong>Add a product</strong><small>Create or update your catalogue</small></span><span className="shortcut-arrow" aria-hidden="true">→</span></button>
              <button type="button" onClick={() => setActiveSection("inventory")}><span className="shortcut-mark">▤</span><span><strong>Manage inventory</strong><small>Check stock and product details</small></span><span className="shortcut-arrow" aria-hidden="true">→</span></button>
              <button type="button" onClick={() => setActiveSection("analyse")}><span className="shortcut-mark">↗</span><span><strong>Analyse sales</strong><small>See daily sales and best sellers</small></span><span className="shortcut-arrow" aria-hidden="true">→</span></button>
              <button type="button" onClick={() => setActiveSection("expense")}><span className="shortcut-mark">−</span><span><strong>Record an expense</strong><small>Keep your profit estimate current</small></span><span className="shortcut-arrow" aria-hidden="true">→</span></button>
            </div>
          </section>
          <section className="panel overview-activity-panel">
            <div className="overview-panel-heading"><div><span className="overview-kicker dark">Latest updates</span><h2>Recent changes</h2></div><button className="overview-see-all" type="button" onClick={() => setActiveSection("changes")}>See all <span aria-hidden="true">→</span></button></div>
            {auditEntries.length ? <div className="overview-activity-list">{auditEntries.slice(0, 5).map((entry) => <article className="overview-activity-item" key={entry.id}>
              <span className="activity-dot" aria-hidden="true" />
              <div><strong>{auditActionLabel(entry.action)} {auditLabel(entry.entity_type).toLowerCase()}</strong><small>{entry.actor_name || (entry.actor_id ? "Staff member" : "System")} · {formatDateTime(entry.created_at)}</small></div>
            </article>)}</div> : <div className="overview-empty-activity"><span className="activity-empty-icon" aria-hidden="true">✓</span><strong>No recent changes yet</strong><p>Important product and business updates will appear here.</p></div>}
            <div className="overview-category-note"><span>Catalogue</span><strong>{categories.length} {categories.length === 1 ? "category" : "categories"}</strong></div>
          </section>
        </div>
      </div>}

      {activeSection === "profit" && <section className="panel" style={{ marginBottom: 25 }}>
        <div className="section-head"><div><h2>Profit estimate</h2><p>Based on fully paid orders, saved product costs, and expenses entered here.</p></div></div>
        {!profitReady ? <div className="notice">Profit reporting is not set up yet. Apply business-profit-upgrade.sql in your new Supabase project.</div>
          : <>
            <div className="dashboard-grid">
              <div className="stat"><span>Paid sales</span><strong>{formatSLE(profitSummary?.paid_sales ?? 0)}</strong></div>
              <div className="stat"><span>Product costs</span><strong>{formatSLE(profitSummary?.product_cost ?? 0)}</strong></div>
              <div className="stat"><span>Recorded expenses</span><strong>{formatSLE(profitSummary?.operating_expenses ?? 0)}</strong></div>
              <div className="stat"><span>Estimated profit</span><strong>{formatSLE(profitSummary?.net_profit ?? 0)}</strong></div>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>Includes {profitSummary?.fully_paid_orders ?? 0} fully paid orders; {profitSummary?.excluded_orders ?? 0} unpaid, partly paid, refunded, or cancelled orders are excluded. This estimate uses the costs and expenses saved in the system. Missing product costs can make profit look higher; refunds and delivery charges are not yet fully recorded here.</p>
          </>}
      </section>}

      {activeSection === "analyse" && <section className="panel">
        <div className="section-head"><div><h2>Sales analysis</h2><p>Best-selling products and daily paid sales, combining online, wholesale, and counter orders.</p></div><button className="btn secondary" type="button" onClick={exportSalesAnalysis} disabled={!salesAnalysis}>Export analysis</button></div>
        <div className="analysis-controls"><label className="fieldlabel" htmlFor="analysis-period">Date range</label><select id="analysis-period" className="field" value={analysisPeriod} onChange={(event) => setAnalysisPeriod(event.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select>{salesAnalysis && <span className="muted">{formatDate(salesAnalysis.from_date)} – {formatDate(salesAnalysis.to_date)}</span>}</div>
        {analysisLoading ? <div className="panel" role="status">Loading sales analysis…</div> : analysisError ? <div className="notice error">{analysisError.includes("get_admin_sales_analysis") ? "Sales analysis setup is not installed yet. Run supabase/pos-and-analysis-upgrade.sql in your new Supabase project first." : analysisError}</div> : salesAnalysis && <>
          <div className="analysis-summary">
            <div className="stat"><span>Paid product sales after discounts</span><strong>{formatSLE(salesAnalysis.merchandise_sales)}</strong></div>
            <div className="stat"><span>Delivery fees collected</span><strong>{formatSLE(salesAnalysis.delivery_fees)}</strong></div>
            <div className="stat"><span>Paid orders</span><strong>{salesAnalysis.paid_orders}</strong></div>
          </div>
          <div className="analysis-columns">
            <div><h3>Best-selling products</h3><div className="table-wrap"><table><thead><tr><th>Product</th><th>Units sold</th><th>Sales after discount</th></tr></thead><tbody>{salesAnalysis.best_sellers.map((product, index) => <tr key={`${product.product_name}-${index}`}><td>{product.product_name}</td><td>{product.units_sold}</td><td>{formatSLE(product.net_product_sales)}</td></tr>)}{!salesAnalysis.best_sellers.length && <tr><td colSpan={3}>No paid product sales in this period.</td></tr>}</tbody></table></div></div>
            <div><h3>Sales by day</h3><div className="table-wrap analysis-daily-table"><table><thead><tr><th>Date</th><th>Product sales</th><th>Delivery</th><th>Orders</th></tr></thead><tbody>{salesAnalysis.daily_sales.slice().reverse().map((day) => <tr key={day.sale_date}><td>{formatDate(day.sale_date)}</td><td>{formatSLE(day.merchandise_sales)}</td><td>{formatSLE(day.delivery_fees)}</td><td>{day.paid_orders}</td></tr>)}</tbody></table></div></div>
          </div>
          <p className="muted analysis-note">Only paid orders are counted. Product sales are after order discounts and exclude delivery fees. Refund handling is not yet included in this analysis.</p>
        </>}
      </section>}

      {activeSection === "expense" && <section className="panel">
        <div className="section-head"><div><h2>Record an expense</h2><p>Business costs entered here are included in the profit estimate.</p></div></div>
        {!profitReady ? <div className="notice">Expense tracking is not set up yet. Apply the business profit upgrade in your new Supabase project.</div> : <form className="formgrid" onSubmit={addExpense}>
          <div><label className="fieldlabel" htmlFor="expense-date">Date *</label><input id="expense-date" className="field" type="date" max={today || undefined} required value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} /></div>
          <div><label className="fieldlabel" htmlFor="expense-category">Category *</label><input id="expense-category" className="field" required value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)} placeholder="e.g. Transport" /></div>
          <div><label className="fieldlabel" htmlFor="expense-description">What was the expense for? *</label><input id="expense-description" className="field" required value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} /></div>
          <div><label className="fieldlabel" htmlFor="expense-amount">Amount (SLE) *</label><input id="expense-amount" className="field" type="number" min="0.01" step=".01" required value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} /></div>
          <div><label className="fieldlabel" htmlFor="expense-payment">Payment method</label><input id="expense-payment" className="field" value={expensePaymentMethod} onChange={(event) => setExpensePaymentMethod(event.target.value)} placeholder="Cash, mobile money, bank…" /></div>
          <div className="full"><button className="btn" disabled={savingExpense}>{savingExpense ? "Saving expense…" : "Save expense"}</button></div>
        </form>}
      </section>}

      {activeSection === "product" && <section id="product-form" className="panel" style={{ marginBottom: 25 }}>
        <h2 style={{ fontFamily: "Manrope", marginTop: 0 }}>{editingProductId ? "Edit product" : "Add a product"}</h2>
        <p className="muted" style={{ fontSize: 13 }}>Products are shared with the public storefront. Use Edit to change a saved product; saving updates that same product. You can add a photo, and stock quantity changes are recorded in the stock history.</p>
        <form onSubmit={addProduct} className="formgrid">
          <div>
            <label className="fieldlabel">Product name *</label>
            <input className="field" required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Men's casual shirt" />
          </div>
          <div>
            <label className="fieldlabel">SKU / product code</label>
            <input className="field" value={sku} onChange={(event) => setSku(event.target.value)} placeholder="Optional unique code" />
          </div>
          <div>
            <label className="fieldlabel" htmlFor="product-photo">Product photos (optional, each up to 5 MB)</label>
            <input id="product-photo" className="field" type="file" accept="image/*" multiple onChange={(event) => setImageFiles(Array.from(event.target.files ?? []))} />
          </div>
          <div>
            <label className="fieldlabel" htmlFor="product-category">Category</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <select id="product-category" className="field" style={{ flex: 1 }} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Uncategorised</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <button type="button" className="smallbtn" onClick={() => setShowCategoryForm((open) => !open)}>+ Add category</button>
            </div>
            {showCategoryForm && <div className="panel" style={{ marginTop: 10, padding: 14 }}>
              <label className="fieldlabel" htmlFor="new-category-name">New category name</label>
              <input id="new-category-name" className="field" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="e.g. Shirts" />
              <label className="fieldlabel" htmlFor="new-category-parent" style={{ marginTop: 10 }}>Parent category (optional)</label>
              <select id="new-category-parent" className="field" value={newCategoryParentId} onChange={(event) => setNewCategoryParentId(event.target.value)}>
                <option value="">None — top-level category</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.parent_id ? `${categories.find((item) => item.id === category.parent_id)?.name ?? ""} / ` : ""}{category.name}</option>)}
              </select>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="button" className="smallbtn" onClick={addCategory}>Save category</button>
                <button type="button" className="smallbtn" onClick={() => setShowCategoryForm(false)}>Cancel</button>
              </div>
            </div>}
          </div>
          <div>
            <label className="fieldlabel">Initial stock quantity</label>
            <input className="field" type="number" min="0" step="1" value={stock} onChange={(event) => setStock(event.target.value)} />
          </div>
          <div>
            <label className="fieldlabel">Low-stock alert at</label>
            <input className="field" type="number" min="0" step="1" value={lowStockThreshold} onChange={(event) => setLowStockThreshold(event.target.value)} />
          </div>
          <div>
            <label className="fieldlabel">Retail price (SLE) *</label>
            <input className="field" type="number" min="0" step=".01" required value={retail} onChange={(event) => setRetail(event.target.value)} />
          </div>
          <div>
            <label className="fieldlabel">Wholesale price (SLE)</label>
            <input className="field" type="number" min="0" step=".01" value={wholesale} onChange={(event) => setWholesale(event.target.value)} />
          </div>
          <div>
            <label className="fieldlabel">Unit cost (SLE)</label>
            <input className="field" type="number" min="0" step=".01" value={cost} onChange={(event) => setCost(event.target.value)} />
          </div>
          <div>
            <label className="fieldlabel">Publish to public store?</label>
            <select className="field" value={published ? "yes" : "no"} onChange={(event) => setPublished(event.target.value === "yes")}>
              <option value="no">No — save as draft</option>
              <option value="yes">Yes — publish</option>
            </select>
          </div>
          <div className="full">
            <label className="fieldlabel">Description</label>
            <textarea className="field" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Product details, sizes, dimensions or notes" />
          </div>
          <div className="full" style={{ display: "flex", gap: 10 }}>
            <button className="btn" disabled={busy || savingProduct}>{savingProduct ? "Saving product…" : editingProductId ? "Save changes" : "Save product"}</button>
            {editingProductId && <button type="button" className="btn secondary" onClick={cancelEdit}>Cancel edit</button>}
          </div>
        </form>
      </section>}

      {activeSection === "import" && <section className="panel" style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>Import products from a spreadsheet</h2>
        <p className="muted">Download the template, fill it in Excel or another spreadsheet app, then save it as CSV. Categories must already exist. Each valid row is saved as a new product; photos and size/colour variations are added separately.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn secondary" type="button" onClick={downloadProductTemplate}>Download spreadsheet template</button>
          <label className="fieldlabel" htmlFor="product-csv-import" style={{ margin: 0 }}>Choose a CSV file (up to 500 products)</label>
          <input id="product-csv-import" className="field" type="file" accept=".csv,text/csv" onChange={importProducts} disabled={importingProducts} style={{ maxWidth: 360 }} />
          <button className="btn secondary" type="button" onClick={exportProducts} disabled={exportingProducts}>{exportingProducts ? "Preparing export…" : "Export all products"}</button>
        </div>
        {importingProducts && <p className="muted" role="status" aria-live="polite">Importing products. Please keep this page open…</p>}
        {importStatus && <p className="notice" role="status" aria-live="polite">{importStatus}</p>}
      </section>}

      {activeSection === "inventory" && <section>
        <div className="section-head"><div><h2>Product inventory</h2><p>{visibleProducts.length} of {products.length} products shown.</p></div><button className="btn secondary" onClick={() => load()}>Refresh list</button></div>
        <div className="search" style={{ marginBottom: 14, maxWidth: 500 }}>
          <input aria-label="Find a product in admin inventory" value={productFilter} onChange={(event) => setProductFilter(event.target.value)} placeholder="Find by product name, code, or category…" />
          {productFilter && <button className="btn secondary" type="button" onClick={() => setProductFilter("")}>Clear</button>}
        </div>
        {busy ? <div className="panel">Loading secure dashboard…</div> : <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th>SKU</th><th>Retail</th><th>Wholesale</th><th>Stock</th><th>Visibility</th><th>Action</th></tr></thead>
            <tbody>
              {visibleProducts.map((product) => <tr key={product.id}>
                <td><strong>{product.name}</strong><br /><span className="muted">{product.category_name || "Uncategorised"}</span></td>
                <td>{product.sku || "—"}</td>
                <td>{formatSLE(product.retail_price)}</td>
                <td>{product.wholesale_price == null ? "—" : formatSLE(product.wholesale_price)}</td>
                <td><strong style={{ color: product.stock_quantity <= product.low_stock_threshold ? "#a43b36" : undefined }}>{product.stock_quantity}{product.stock_quantity <= product.low_stock_threshold ? " · LOW" : ""}</strong></td>
                <td><span className="pill">{product.is_published ? "Published" : "Draft"}</span></td>
                <td><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="smallbtn" onClick={() => editProduct(product)}>Edit</button><button className="smallbtn" onClick={() => openVariants(product)}>Sizes &amp; colours</button><button className="smallbtn" onClick={() => toggle(product)}>{product.is_published ? "Unpublish" : "Publish"}</button></div></td>
              </tr>)}
              {!visibleProducts.length && <tr><td colSpan={7}>{products.length ? "No products match your search." : "No products yet. Add your first product above."}</td></tr>}
            </tbody>
          </table>
        </div>}
      </section>}

      {activeSection === "wholesale" && <section style={{ marginTop: 30 }}>
        <div className="section-head"><div><h2>Wholesale applications</h2><p>Read the customer’s message and approve or reject each request.</p></div></div>
        {!applicationsReady ? <div className="panel">Wholesale review setup is not ready. Apply customer-workflows-upgrades.sql in Supabase first.</div>
          : <div className="table-wrap"><table>
            <thead><tr><th>Received</th><th>Contact</th><th>Business</th><th>Email / phone</th><th>Message</th><th>Status</th><th>Review</th></tr></thead>
            <tbody>{applications.map((application) => <tr key={application.id}>
              <td>{formatDate(application.created_at)}</td>
              <td>{application.contact_name}</td><td>{application.business_name}</td>
              <td>{application.email}<br />{application.phone || "No phone provided"}</td>
              <td style={{ whiteSpace: "normal", minWidth: 220 }}>{application.details || "No message provided"}</td>
              <td>{application.status}</td>
              <td>{application.status === "pending" ? <div style={{ display: "flex", gap: 6 }}><button className="smallbtn" onClick={() => reviewApplication(application, "approved")}>Approve</button><button className="smallbtn" onClick={() => reviewApplication(application, "rejected")}>Reject</button></div> : "Reviewed"}</td>
            </tr>)}{!applications.length && <tr><td colSpan={7}>No wholesale applications yet.</td></tr>}</tbody>
          </table></div>}
      </section>}

      {activeSection === "orders" && <section style={{ marginTop: 30 }}>
        <div className="section-head"><div><h2>Online order requests</h2><p>Orders remain unpaid until you verify the payment. Confirming checks and commits stock.</p></div></div>
        {!ordersReady ? <div className="panel">Online order setup is not ready. Apply customer-workflows-upgrades.sql in Supabase first.</div>
          : <>
          <div className="panel" style={{ marginBottom: 14 }}>
            <div className="report-filter-grid">
              <div><label className="fieldlabel" htmlFor="order-search">Find an order</label><input id="order-search" className="field" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Order number, customer, or product" /></div>
              <div><label className="fieldlabel" htmlFor="order-status-filter">Order status</label><select id="order-status-filter" className="field" value={orderStatusFilter} onChange={(event) => setOrderStatusFilter(event.target.value)}><option value="">All order statuses</option>{[...new Set(onlineOrders.map((order) => order.order_status))].sort().map((status) => <option key={status} value={status}>{auditLabel(status)}</option>)}</select></div>
              <div><label className="fieldlabel" htmlFor="payment-status-filter">Payment status</label><select id="payment-status-filter" className="field" value={paymentStatusFilter} onChange={(event) => setPaymentStatusFilter(event.target.value)}><option value="">All payment statuses</option>{[...new Set(onlineOrders.map((order) => order.payment_status))].sort().map((status) => <option key={status} value={status}>{auditLabel(status)}</option>)}</select></div>
              <div><label className="fieldlabel" htmlFor="payment-method-filter">Payment method</label><select id="payment-method-filter" className="field" value={paymentMethodFilter} onChange={(event) => setPaymentMethodFilter(event.target.value)}><option value="">All methods</option>{[...new Set(onlineOrders.map((order) => order.payment_method).filter((value): value is string => Boolean(value)))].sort().map((method) => <option key={method} value={method}>{auditLabel(method)}</option>)}</select></div>
              <div><label className="fieldlabel" htmlFor="order-date-from">From date</label><input id="order-date-from" className="field" type="date" value={orderDateFrom} onChange={(event) => setOrderDateFrom(event.target.value)} /></div>
              <div><label className="fieldlabel" htmlFor="order-date-to">To date</label><input id="order-date-to" className="field" type="date" value={orderDateTo} onChange={(event) => setOrderDateTo(event.target.value)} /></div>
            </div>
            <div className="report-summary">
              <div><span>Matching orders</span><strong>{visibleOrders.length}</strong></div>
              <div><span>Order value</span><strong>{formatSLE(visibleOrderValue)}</strong></div>
              <div><span>Fully paid value</span><strong>{formatSLE(visiblePaidValue)}</strong></div>
            </div>
            <div className="report-filter-actions"><span className="muted">From the latest 100 online orders loaded.</span><div className="row-actions"><button className="btn secondary" type="button" onClick={() => { setOrderSearch(""); setOrderStatusFilter(""); setPaymentStatusFilter(""); setPaymentMethodFilter(""); setOrderDateFrom(""); setOrderDateTo(""); }}>Clear filters</button><button className="btn secondary" type="button" onClick={exportOrders} disabled={!visibleOrders.length}>Export filtered orders</button></div></div>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Products total</th><th>Payment</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{visibleOrders.map((order) => <tr key={order.id}>
              <td>{order.order_number}<small className="muted" style={{ display: "block" }}>{formatDateTime(order.created_at)}</small></td>
              <td>{order.customer?.full_name || "Customer"}<br />{order.customer?.email}<br />{order.customer?.phone}<small className="muted" style={{ display: "block", whiteSpace: "normal", minWidth: 160 }}>{order.customer?.address}</small></td>
              <td style={{ whiteSpace: "normal", minWidth: 180 }}>{(order.lines ?? []).map((line) => `${line.quantity} × ${line.product_name_snapshot}`).join(", ")}</td>
              <td>{formatSLE(order.total)}</td><td>{order.payment_method?.replaceAll("_", " ")}<br />{order.payment_status}</td><td>{order.order_status}</td>
              <td><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button className="smallbtn" type="button" onClick={() => setReceiptOrder(order)}>Receipt</button>{order.order_status === "pending" && <><button className="smallbtn" onClick={() => manageOnlineOrder(order, "confirm")}>Confirm &amp; deduct stock</button><button className="smallbtn" onClick={() => manageOnlineOrder(order, "cancel")}>Cancel</button></>}{["confirmed", "processing", "ready", "dispatched", "delivered"].includes(order.order_status) && order.payment_status !== "paid" && <button className="smallbtn" onClick={() => manageOnlineOrder(order, "paid")}>Record payment received</button>}</div></td>
            </tr>)}{!visibleOrders.length && <tr><td colSpan={7}>{onlineOrders.length ? "No orders match these filters." : "No online orders yet."}</td></tr>}</tbody>
          </table></div>
          </>}
      </section>}

      {receiptOrder && <div className="receipt-backdrop" role="dialog" aria-modal="true" aria-labelledby="receipt-title" onClick={(event) => { if (event.target === event.currentTarget) setReceiptOrder(null); }}>
        <article className="receipt-sheet">
          <div className="receipt-actions"><button type="button" className="btn secondary" onClick={() => setReceiptOrder(null)}>Close</button><button type="button" className="btn" onClick={printOrderReceipt}>Print / Save as PDF</button></div>
          <header className="receipt-header"><div className="brandmark">AC</div><div><h2 id="receipt-title">Abi-Chris Fashion and Store</h2><p>Order receipt</p></div></header>
          <div className="receipt-order-meta"><div><span>Order number</span><strong>{receiptOrder.order_number}</strong></div><div><span>Date</span><strong>{formatDateTime(receiptOrder.created_at)}</strong></div></div>
          <section className="receipt-customer"><h3>Customer</h3><strong>{receiptOrder.customer?.full_name || "Customer"}</strong>{receiptOrder.customer?.phone && <span>{receiptOrder.customer.phone}</span>}{receiptOrder.customer?.email && <span>{receiptOrder.customer.email}</span>}</section>
          <table className="receipt-items"><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>{(receiptOrder.lines ?? []).map((line, index) => <tr key={`${receiptOrder.id}-${index}`}><td>{line.product_name_snapshot}</td><td>{line.quantity}</td><td>{formatSLE(line.line_total)}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Order total</th><th>{formatSLE(receiptOrder.total)}</th></tr></tfoot></table>
          <div className="receipt-payment"><span>Payment method: <strong>{auditLabel(receiptOrder.payment_method || "Not recorded")}</strong></span><span>Payment status: <strong>{auditLabel(receiptOrder.payment_status)}</strong></span></div>
          <p className="receipt-thanks">Thank you for shopping with Abi-Chris.</p>
        </article>
      </div>}

      {activeSection === "inventory" && variantProduct && <section id="variant-manager" className="panel" style={{ marginTop: 28 }}>
        <div className="section-head"><div><h2>Sizes, colours &amp; stock</h2><p>For: {variantProduct.name}. Each size/colour combination has its own price and stock count.</p></div><button className="smallbtn" onClick={() => setVariantProduct(null)}>Close</button></div>
        <form className="formgrid" onSubmit={saveVariant}>
          <div><label className="fieldlabel">Variation name *</label><input className="field" required value={variantName} onChange={(event) => setVariantName(event.target.value)} placeholder="e.g. Medium / Blue" /></div>
          <div><label className="fieldlabel">Size</label><input className="field" value={variantSize} onChange={(event) => setVariantSize(event.target.value)} placeholder="e.g. Medium" /></div>
          <div><label className="fieldlabel">Colour</label><input className="field" value={variantColour} onChange={(event) => setVariantColour(event.target.value)} placeholder="e.g. Blue" /></div>
          <div><label className="fieldlabel">Variation SKU (optional)</label><input className="field" value={variantSku} onChange={(event) => setVariantSku(event.target.value)} /></div>
          <div><label className="fieldlabel">Retail price (SLE)</label><input className="field" type="number" min="0" step=".01" value={variantRetail} onChange={(event) => setVariantRetail(event.target.value)} placeholder="Use product price if blank" /></div>
          <div><label className="fieldlabel">Wholesale price (SLE)</label><input className="field" type="number" min="0" step=".01" value={variantWholesale} onChange={(event) => setVariantWholesale(event.target.value)} /></div>
          <div><label className="fieldlabel">Unit cost (SLE)</label><input className="field" type="number" min="0" step=".01" value={variantCost} onChange={(event) => setVariantCost(event.target.value)} /></div>
          <div><label className="fieldlabel">Low-stock alert at</label><input className="field" type="number" min="0" step="1" value={variantLowThreshold} onChange={(event) => setVariantLowThreshold(event.target.value)} /></div>
          {!editingVariantId && <div><label className="fieldlabel">Starting stock</label><input className="field" type="number" min="0" step="1" value={variantStock} onChange={(event) => setVariantStock(event.target.value)} /></div>}
          <div className="full" style={{ display: "flex", gap: 10 }}><button className="btn">{editingVariantId ? "Save variation" : "Add variation"}</button>{editingVariantId && <button type="button" className="btn secondary" onClick={() => { setEditingVariantId(null); setVariantName(""); }}>Cancel edit</button>}</div>
        </form>
        <div className="table-wrap" style={{ marginTop: 20 }}><table>
          <thead><tr><th>Variation</th><th>SKU</th><th>Retail</th><th>Wholesale</th><th>Cost</th><th>Stock</th><th>Alert</th><th>Receive stock</th><th>Action</th></tr></thead>
          <tbody>{variants.map((variant) => <tr key={variant.id}>
            <td>{variant.variant_name}{variant.attributes?.size || variant.attributes?.colour ? <small className="muted" style={{ display: "block" }}>{[variant.attributes.size, variant.attributes.colour].filter(Boolean).join(" / ")}</small> : null}</td>
            <td>{variant.sku || "—"}</td><td>{variant.retail_price == null ? "Product price" : formatSLE(variant.retail_price)}</td><td>{variant.wholesale_price == null ? "—" : formatSLE(variant.wholesale_price)}</td><td>{formatSLE(variant.cost_price)}</td>
            <td><strong style={{ color: variant.is_active && variant.stock_quantity <= variant.low_stock_threshold ? "#a43b36" : undefined }}>{variant.stock_quantity}{variant.is_active && variant.stock_quantity <= variant.low_stock_threshold ? " · LOW" : ""}</strong></td><td>{variant.low_stock_threshold}</td>
            <td><div style={{ display: "flex", gap: 5 }}><input className="field" style={{ width: 80 }} type="number" min="1" step="1" aria-label={`Quantity received for ${variant.variant_name}`} value={receiveQuantity[variant.id] ?? ""} onChange={(event) => setReceiveQuantity((current) => ({ ...current, [variant.id]: event.target.value }))} /><button className="smallbtn" onClick={() => receiveVariantStock(variant)}>Receive</button></div></td>
            <td><button className="smallbtn" onClick={() => editVariant(variant)}>Edit</button></td>
          </tr>)}{!variants.length && <tr><td colSpan={9}>No variations yet. Add a size/colour combination above.</td></tr>}</tbody>
        </table></div>
      </section>}

      {role === "owner" && activeSection === "staff" && <section style={{ marginTop: 28 }}>
        <div className="section-head"><div><h2>Staff &amp; access</h2><p>Invite staff by email and choose what they can access. They set their own password from the invitation email.</p></div></div>
        <form className="panel stack" onSubmit={addStaffProfile}>
          <div className="formgrid">
            <div><label className="fieldlabel" htmlFor="staff-name">Staff name</label><input id="staff-name" className="field" required maxLength={120} autoComplete="name" value={newStaffName} onChange={(event) => setNewStaffName(event.target.value)} /></div>
            <div><label className="fieldlabel" htmlFor="staff-email">Staff email address</label><input id="staff-email" className="field" type="email" required maxLength={254} autoComplete="email" value={newStaffEmail} onChange={(event) => setNewStaffEmail(event.target.value)} placeholder="name@example.com" /></div>
            <div><label className="fieldlabel" htmlFor="staff-role">Access role</label><select id="staff-role" className="field" value={newStaffRole} onChange={(event) => setNewStaffRole(event.target.value)}><option value="admin">Administrator</option><option value="salesperson">Salesperson</option><option value="delivery">Delivery</option></select></div>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>Only the owner can send invitations or change staff roles. Never share your owner sign-in.</div>
          <div>
            <button className="btn" type="submit" disabled={staffInviteBusy}>
              {staffInviteBusy ? "Sending…" : "Send staff invitation"}
            </button>
            {staffInviteMessage && <p role="status" aria-live="polite" style={{ margin: "12px 0 0", fontWeight: 600 }}>{staffInviteMessage}</p>}
          </div>
        </form>
        <div className="table-wrap" style={{ marginTop: 12 }}><table>
          <thead><tr><th>Name</th><th>Auth user ID</th><th>Role</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{teamMembers.map((member) => <tr key={member.id}>
            <td>{member.full_name || "—"}</td><td>{member.id}</td>
            <td><select className="field" value={member.role} disabled={member.role === "owner"} onChange={(event) => updateStaff(member, { role: event.target.value })}><option value="owner">Owner</option><option value="admin">Administrator</option><option value="salesperson">Salesperson</option><option value="delivery">Delivery</option></select></td>
            <td>{member.is_active ? "Active" : "Disabled"}</td>
            <td>{member.role !== "owner" && <button className="smallbtn" onClick={() => updateStaff(member, { is_active: !member.is_active })}>{member.is_active ? "Disable" : "Enable"}</button>}</td>
          </tr>)}</tbody>
        </table></div>
      </section>}

      {activeSection === "changes" && <section style={{ marginTop: 28 }}>
        <div className="section-head"><div><h2>Recent changes</h2><p>Administrator activity, shown newest first. Customer names and contact details are not included.</p></div>{auditReady && auditEntries.length > 0 && <span className="audit-count">Latest {auditEntries.length} updates</span>}</div>
        {!auditReady ? <div className="panel">Audit history is not set up yet. It will appear here after the business operations SQL upgrade has been applied.</div>
          : auditEntries.length ? <div className="audit-feed">
            {auditEntries.map((entry) => {
              const before = entry.details?.before ?? {};
              const after = entry.details?.after ?? {};
              const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
              const changes = [...keys].map((key) => ({ key, oldValue: before[key], newValue: after[key] }));
              return <article className="audit-card" key={entry.id}>
                <div className="audit-card-head">
                  <div className="audit-card-title"><span className="audit-action">{auditActionLabel(entry.action)}</span><h3>{auditLabel(entry.entity_type)}</h3></div>
                  <time className="audit-time" dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
                </div>
                <p className="audit-byline">Changed by <strong>{entry.actor_name || (entry.actor_id ? "Staff member" : "System")}</strong></p>
                {changes.length ? <div className="audit-changes">{changes.map(({ key, oldValue, newValue }) => <div className="audit-change" key={key}>
                  <strong>{auditLabel(key)}</strong><span><span className="audit-old-value">{auditValue(key, oldValue)}</span><span className="audit-arrow" aria-label="changed to">→</span><span className="audit-new-value">{auditValue(key, newValue)}</span></span>
                </div>)}</div> : <p className="audit-empty-detail">Record created or removed</p>}
              </article>;
            })}
          </div> : <div className="panel">No audit entries yet. Changes to products, stock, and orders will appear here.</div>}
      </section>}

        </div>
      </div>

      <div className="notice" style={{ marginTop: 22 }}>Security note: product data and administrator access are enforced by database policies. Do not put a Supabase service-role key in this app or share your private credentials.</div>
    </main>
    <Footer />
  </>;
}
