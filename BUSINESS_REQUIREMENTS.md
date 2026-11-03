# Abi-Chris Fashion and Store — master checklist

This is the single source of truth for the agreed business requirements and launch readiness. Update the status here as work is completed. A feature marked **Code prepared** is present locally but is not proven live until its database setup is applied and the acceptance check passes. This project is **not deployed**.

Status key: `[x] Done` = implemented in the local build; `[~] Code prepared` = local UI/SQL exists but still needs database setup or acceptance testing; `[ ] Open` = work remains.

## 1. Shared store and product catalogue

- [x] **Done:** One shared Supabase catalogue powers the admin dashboard and public storefront; edits update the saved product.
- [x] **Done:** Add, edit, publish, and unpublish products; create categories and subcategories.
- [x] **Done:** Search public merchandise by product, description, and category; public catalogue view exposes display information and retail price only.
- [x] **Done:** Public visitors do not receive wholesale/cost prices or internal stock fields through the catalogue view.
- [x] **Done:** Upload multiple product photos and display published products responsively.
- [x] **Done:** Base product CSV template, CSV import (up to 500 rows per file), and full-catalogue base product CSV export are present. Import creates new base products; images and variations remain separate. Product export includes wholesale prices and costs and must be kept private.
- [x] **Done:** Admin can manage size/colour variants, variant prices, costs, stock, and low-stock thresholds in the local UI.
- [ ] **Open:** Expand spreadsheet import/export to include variations and photos or clearly support a repeatable linked-file workflow; support complete catalogue exports beyond the current 500-row dashboard load.
- [x] **Done:** Responsive layouts exist for phone, tablet, and desktop; cross-device acceptance is still open below.

## 2. Inventory, sales, orders, and delivery

- [x] **Done:** Product stock and variant stock fields, stock-received workflow, low-stock indicators, and stock-movement records are implemented locally.
- [x] **Done:** Online order requests save to the shared database, then open WhatsApp with an order summary; order requests remain unpaid until staff confirm them.
- [~] **Code prepared:** Online confirmation and POS sale SQL recheck current stock and write sales/stock changes transactionally. Apply the customer-workflow, catalogue/inventory, business-operation, and POS SQL upgrades to the **new** Supabase project and test both channels using the same item before relying on stock accuracy.
- [x] **Done:** POS lets sales staff search products and variants and see retail price/availability without showing wholesale prices or costs. Receipt printing is present.
- [ ] **Open:** Add safe refund/return handling and verify that refunds reverse revenue/profit and restore stock only when appropriate.
- [ ] **Open:** Build the delivery worker's assigned-jobs screen with only the address/contact and status information required to complete an assigned delivery. Database policies are prepared, but no delivery worker screen exists yet.
- [ ] **Open:** Verify a physical POS sale immediately reduces the same stock shown online, including simultaneous attempts to buy the last unit.

## 3. People, permissions, customer privacy, and audit history

- [x] **Done:** Separate account roles are defined for owner, administrator, salesperson, and delivery worker; owner can add/manage staff in the local dashboard.
- [~] **Code prepared:** SQL policies restrict customer, product-cost, wholesale-price, staff-management, and assigned-delivery access by role. Apply migrations and run the security checks before real customer data is used.
- [ ] **Open:** Confirm an owner and aunt each have separate administrator accounts; create and acceptance-test salesperson and delivery accounts.
- [ ] **Open:** Validate least privilege from real accounts: salesperson cannot access cost/wholesale prices, customers beyond workflow needs, staff permissions, or store settings; delivery staff see only their own assigned jobs.
- [~] **Code prepared:** Audit triggers cover product/variant, order/order-line, expense, delivery, and staff-profile changes; the admin UI shows recent activity. Apply `supabase/business-operations-upgrades.sql` and verify each event appears. Audit records intentionally omit customer contact details and free-form notes.
- [ ] **Open:** Confirm audit records cannot be edited/deleted by staff or exposed publicly, and that all important changes (including wholesale approvals and access changes) are captured.

## 4. Analysis, profit, exports, backups, and recovery

- [x] **Done:** Sales analysis UI includes date ranges, daily paid sales, best sellers, and CSV export. Online order filters and filtered CSV export are present; current report reads are limited to the latest 100 online orders and analysis is limited to supported fields.
- [~] **Code prepared:** Profit estimate and expense entry are present; the current estimate counts fully paid, non-cancelled/non-refunded orders, subtracts saved product costs and recorded expenses. Apply the profit SQL and reconcile known sample transactions before treating reports as final.
- [ ] **Open:** Complete profit rules for discounts, partial payments, delivery fees, refunds/returns, missing cost values, expenses, and both sales channels. Add report filters for salesperson and payment method/status across all sales.
- [ ] **Open:** Provide complete, role-restricted exports for products/variants, stock history, orders/order lines, expenses, deliveries, and audit records. Existing exports are partial and must not be treated as a complete backup.
- [ ] **Open:** Document and test an independent database backup and restore using the chosen Supabase plan. A downloaded spreadsheet is not a database backup; no browser-side restore of production records should be added without a reviewed, transactional design.
- [ ] **Open:** Agree backup frequency, retention, who can access backups, and a recovery point/recovery time target.

## 5. Security and acceptance testing

- [~] **Code prepared:** `supabase/security-checks.sql` is a read-only check for critical grants, column access, RLS, assigned-delivery policy, audit triggers, and security-definer function settings. It has not been run against Supabase.
- [ ] **Open:** Run that check against the new project after all migrations; every check must pass. Also test as anonymous visitor, owner, administrator, salesperson, approved wholesale customer, unapproved customer, and two delivery workers.
- [ ] **Open:** Test public access cannot retrieve unpublished products, SKU/barcode, wholesale/cost prices, internal stock, or private customer records.
- [ ] **Open:** Test wholesale approval and revocation immediately changes wholesale-price access.
- [ ] **Open:** Test online order, POS sale, unpaid/paid/partial/refunded/cancelled cases, discounts, delivery fees, stock receiving, low-stock alerts, exports, audit history, backup, and restore against known expected totals.
- [x] **Done:** Local application build and lint pass. Lint reports three existing warnings (a React hook dependency and two unoptimized image elements); resolve or accept them before launch review.

## 6. Hosting and launch

- [~] **Code prepared:** Vercel is selected and `VERCEL_DEPLOYMENT.md` gives the preview-to-production steps. The owner still needs to sign in/link the Vercel project, configure its environment variables, choose a domain, and set Supabase redirect URLs. Never put a service-role key in browser code.
- [ ] **Open:** Deploy to a protected preview/staging environment first and apply migrations only to the intended new Supabase project.
- [ ] **Open:** Test the same live product, stock, order, and staff permissions from the owner's laptop and phone, then repeat from the aunt's separate account/device.
- [ ] **Open:** Verify phone, tablet, desktop, slow-network, error, and empty-catalogue behavior on the deployed site.
- [ ] **Open:** Go live only after security, money, stock, backup/restore, and cross-device acceptance checks pass.

## Current launch blockers

1. SQL upgrades are prepared in `supabase/` but must be applied and verified in the **new** Supabase project; no SQL has been run by this assistant.
2. Full exports, independent backups, and a tested restoration path are not complete.
3. Delivery worker screen, refund/return flow, and fully reconciled profit logic are not complete.
4. Database security acceptance tests have not been run against Supabase; local build/lint pass with three warnings.
5. The app is local only. Vercel is selected, but this computer is not linked to an account and the CLI download failed; deployment and real laptop/phone testing remain open.

Do not enter live customer or financial records until the blockers relevant to the workflow have passed their checks.
