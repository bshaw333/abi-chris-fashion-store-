import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

type ProductRow = {
  id: string;
  name: string;
  retail_price: number;
  stock_quantity: number;
  unit_name: string;
  category_id: string | null;
};

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Request could not be verified." }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Barcode search is not configured. Ask the store owner for help." }, { status: 503 });
  }

  let body: { barcode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter or scan a product code." }, { status: 400 });
  }
  const barcode = typeof body.barcode === "string" ? body.barcode.trim() : "";
  if (!barcode || barcode.length > 100) {
    return NextResponse.json({ error: "Enter or scan a valid product code." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sessionClient = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values) cookieStore.set(name, value, options);
      },
    },
  });
  const { data: { user }, error: userError } = await sessionClient.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Please sign in again before scanning products." }, { status: 401 });

  const { data: profile, error: profileError } = await sessionClient.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
  if (profileError || !profile?.is_active || !["owner", "admin", "salesperson"].includes(profile.role)) {
    return NextResponse.json({ error: "Active point-of-sale staff access is required." }, { status: 403 });
  }

  const adminClient = createSupabaseClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const [productBarcode, productSku, variantBarcode, variantSku] = await Promise.all([
    adminClient.from("products").select("id,name,retail_price,stock_quantity,unit_name,category_id").eq("barcode", barcode).eq("is_active", true).limit(2),
    adminClient.from("products").select("id,name,retail_price,stock_quantity,unit_name,category_id").eq("sku", barcode).eq("is_active", true).limit(2),
    adminClient.from("product_variants").select("id,product_id,variant_name,retail_price,stock_quantity").eq("barcode", barcode).eq("is_active", true).limit(2),
    adminClient.from("product_variants").select("id,product_id,variant_name,retail_price,stock_quantity").eq("sku", barcode).eq("is_active", true).limit(2),
  ]);
  if (productBarcode.error || productSku.error || variantBarcode.error || variantSku.error) return NextResponse.json({ error: "Could not look up that product code. Please try again." }, { status: 500 });
  const products = [...new Map([...(productBarcode.data ?? []), ...(productSku.data ?? [])].map((row) => [row.id, row])).values()];
  const variants = [...new Map([...(variantBarcode.data ?? []), ...(variantSku.data ?? [])].map((row) => [row.id, row])).values()];

  const matches: Array<{
    product_id: string;
    variant_id: string | null;
    product_name: string;
    variant_name: string | null;
    retail_price: number;
    stock_quantity: number;
    unit_name: string;
    category_name: string;
  }> = [];

  for (const product of (products ?? []) as ProductRow[]) {
    let categoryName = "Uncategorised";
    if (product.category_id) {
      const { data: category } = await adminClient.from("categories").select("name").eq("id", product.category_id).maybeSingle();
      if (category?.name) categoryName = category.name;
    }
    matches.push({
      product_id: product.id,
      variant_id: null,
      product_name: product.name,
      variant_name: null,
      retail_price: Number(product.retail_price),
      stock_quantity: product.stock_quantity,
      unit_name: product.unit_name,
      category_name: categoryName,
    });
  }

  for (const variant of variants ?? []) {
    const { data: product, error: parentError } = await adminClient.from("products")
      .select("id,name,retail_price,unit_name,category_id")
      .eq("id", variant.product_id).eq("is_active", true).maybeSingle();
    if (parentError) return NextResponse.json({ error: "Could not look up that product code. Please try again." }, { status: 500 });
    if (!product) continue;
    let categoryName = "Uncategorised";
    if (product.category_id) {
      const { data: category } = await adminClient.from("categories").select("name").eq("id", product.category_id).maybeSingle();
      if (category?.name) categoryName = category.name;
    }
    matches.push({
      product_id: product.id,
      variant_id: variant.id,
      product_name: product.name,
      variant_name: variant.variant_name,
      retail_price: Number(variant.retail_price ?? product.retail_price),
      stock_quantity: variant.stock_quantity,
      unit_name: product.unit_name,
      category_name: categoryName,
    });
  }

  return NextResponse.json({ matches });
}
