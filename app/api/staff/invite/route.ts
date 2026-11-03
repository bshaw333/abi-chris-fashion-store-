import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const allowedRoles = new Set(["admin", "salesperson", "delivery"]);

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Request could not be verified." }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Staff invitations are not configured yet. Ask the site owner to finish setup." }, { status: 503 });
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
  if (userError || !user) return NextResponse.json({ error: "Please sign in again before inviting staff." }, { status: 401 });

  const { data: actor, error: actorError } = await sessionClient.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
  if (actorError || actor?.role !== "owner" || !actor.is_active) {
    return NextResponse.json({ error: "Only the active store owner can invite staff." }, { status: 403 });
  }

  let body: { email?: unknown; fullName?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Please check the invitation details and try again." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const role = typeof body.role === "string" ? body.role : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !fullName || fullName.length > 120 || !allowedRoles.has(role)) {
    return NextResponse.json({ error: "Enter a valid email, staff name, and permitted role." }, { status: 400 });
  }

  const adminClient = createSupabaseClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const origin = new URL(request.url).origin;
  const { data, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${origin}/auth/setup`,
  });
  if (inviteError || !data.user) {
    return NextResponse.json({ error: inviteError?.message ?? "The invitation could not be sent." }, { status: 400 });
  }

  const { error: profileError } = await sessionClient.from("profiles").insert({
    id: data.user.id,
    full_name: fullName,
    role,
    is_active: true,
  });
  if (profileError) {
    await adminClient.auth.admin.deleteUser(data.user.id);
    return NextResponse.json({ error: "The invitation was created, but store access could not be assigned. Please try again or contact support." }, { status: 500 });
  }

  return NextResponse.json({ member: { id: data.user.id, full_name: fullName, role, is_active: true } }, { status: 201 });
}
