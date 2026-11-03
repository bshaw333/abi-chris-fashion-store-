# Abi-Chris-Fashion and Store — first application build

This is the first connected build for the multi-category retail/wholesale store. It is **not yet deployed or ready for live sales**. Read [BUSINESS_REQUIREMENTS.md](./BUSINESS_REQUIREMENTS.md) for the complete agreed scope and implementation status.

## Included in this build
- Responsive public storefront with database-backed search across the published catalogue.
- Customer basket saved on the current device across refreshes, with immediate add-to-basket confirmation.
- Wholesale application, sign-in, and a separate database function that returns prices only for an approved signed-in account.
- Staff login using Supabase Auth.
- Admin dashboard with product create/edit, CSV import/export for base product records, multiple photo uploads, category and subcategory creation, retail/wholesale price fields, and publish/draft controls. CSV imports do not include photos or size/colour variants.
- Staff point-of-sale screen with retail-price product search, discounts, payment status, atomic stock deduction, saved counter sales, and printable receipts. Requires `supabase/pos-and-analysis-upgrade.sql` before use.
- Admin sales analysis with daily paid product sales, delivery-fee totals, best sellers, date ranges, and CSV export. Requires the same POS and analysis migration.
- Owner-only staff profile assignment and a recent-changes audit panel after the business-operations upgrade is applied.
- PostgreSQL schema for 100–200+ categories, products, variants, hosted image URLs, wholesale approvals, intake/container tracking, customers, orders, order items, expenses, stock movements, deliveries and audit logs.
- Row Level Security policies and role scaffolding.
- SLE price formatting.

Some database-backed features need the matching SQL upgrade files below before use. Refunds, returns, full delivery-fee profit accounting, and live payment processing are still incomplete; see [BUSINESS_REQUIREMENTS.md](./BUSINESS_REQUIREMENTS.md) before relying on this build for live business records.

## Prerequisites
- Node.js 20.9 or newer
- A Supabase project
- Terminal access on the computer

## Local setup
1. Extract this ZIP into a folder.
2. Open the folder in VS Code.
3. Copy `.env.example` to `.env.local`; set `NEXT_PUBLIC_STORE_WHATSAPP_NUMBER` to the store's WhatsApp number with country code and digits only (for example, `232XXXXXXXX`).
4. In Supabase, open SQL Editor and run `supabase/schema.sql` in a **new project**.
5. Run `supabase/storefront-upgrades.sql` once in that same project. It adds search and approved-wholesale functions, image storage permissions, category creation access, product editing access, and stock change logging.
6. Run `supabase/catalogue-inventory-upgrades.sql` to add variation-level stock, low-stock thresholds, and secured admin functions for managing variations and recording stock received.
7. Run `supabase/business-operations-upgrades.sql` once after the storefront upgrade. It adds owner-only profile insert/update permissions and allowlisted audit triggers. It does not enable sales entry or safe order processing.
8. Run `supabase/customer-workflows-upgrades.sql`. It enables admin wholesale application review and customer order requests, with atomic stock deduction only when an administrator confirms an order.
9. Run `supabase/business-profit-upgrade.sql`. It adds an admin-only profit estimate based on fully paid orders, saved product costs, and recorded expenses.
10. Run `supabase/pos-and-analysis-upgrade.sql`. It adds restricted product search for staff, atomic counter-sale recording and stock deduction, and admin-only sales analysis. Review the script before running it.
11. In Supabase Project Settings / API, copy the Project URL and publishable/anon key into `.env.local`. Use the variable names from `.env.example`. Never use the service-role secret in browser code or commit secrets to Git.
12. Set `NEXT_PUBLIC_STORE_WHATSAPP_NUMBER` in `.env.local` to the store's international WhatsApp number using digits only, then restart the local app.
13. Create the first user in Supabase Authentication and assign the owner role using the guarded bootstrap block in `schema.sql`.
14. Run `npm install`, then `npm run dev`; open the local URL printed by Next.js.
15. Test with sample products and staff accounts before entering real inventory or recording live sales.

## Important security and production work still required
- The online page saves an unpaid order request to the website first, then opens WhatsApp with the order number and item summary prefilled. The store must confirm stock, delivery fee, and payment manually. Confirmation deducts stock in one database transaction. The new POS needs its migration applied and reviewed before use. Refunds, returns, online payment processing, and complete delivery-fee profit accounting still need implementation and security review.
- The first profit estimate counts fully paid, non-cancelled, non-refunded orders, subtracts saved product costs and recorded expenses, and excludes unpaid/partial payments. Refund processing and delivery-fee accounting are not complete, so treat this as an estimate until those workflows are added.
- Wholesale applications are public form submissions; add rate limits/CAPTCHA before launch.
- The storefront search and wholesale catalogue use database functions that return only the fields intended for those audiences. Keep the public-products view narrow.
- Wholesale approvals are separate from applications. The applicant creates and confirms a sign-in account with the same email; an owner/admin reviews the application in the dashboard and approves it there.
- The initial RLS policies are a starting point and must be reviewed and tested before real customer or financial data is added. The migrations remove direct order writes; customers submit through a scoped order function, while staff use protected review functions.
- The owner, aunt, salesperson, and delivery person need separate accounts. Do not share passwords. Create each through Supabase Auth; the owner can assign roles in the dashboard after applying the business-operations migration.
- The upgrade SQL creates a public product-images bucket. Only admins/owners can upload to it; only product photos intended for public display belong there.
- Connect the actual payment provider only after confirming merchant support and settlement details in Sierra Leone. Manual payment status recording is safer for the first pilot.
- Deployment to Vercel or another host and DNS/domain setup are not included automatically; those require account access and a deployment pass.

## Business rules
- Currency: SLE (new Sierra Leonean leones).
- Categories can nest and can grow beyond 200.
- Retail prices are public. Wholesale prices must be returned only to approved wholesale customers.
- Goods in expected / awaiting clearance / pending inspection status must not be included in sellable stock.
- Online and POS sales must eventually share atomic inventory transactions.
- Profit reporting must use cost snapshots on order lines, and distinguish paid revenue from unpaid orders.
