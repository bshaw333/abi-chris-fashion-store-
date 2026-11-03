# Abi-Chris-Fashion and Store — prelaunch checklist

## Business setup
- [ ] Confirm official business name, logo, phone/WhatsApp, email, address and social links.
- [ ] Confirm retail and wholesale rules, minimum quantities, price breaks and return policy.
- [ ] Confirm delivery areas and fees.
- [ ] Confirm how staff are invited and who can approve wholesale accounts.

## Data and inventory
- [ ] Create a product spreadsheet template.
- [ ] Create top-level categories and subcategories.
- [ ] Decide SKU/barcode convention and units (item, pair, box, sheet, etc.).
- [ ] Record supplier/container references, landed cost and clearance status.
- [ ] Count physical stock before marking it sellable.
- [ ] Store product photos in hosted storage; do not use laptop-only image paths.

## Security and operations
- [ ] Create separate owner/admin accounts for the two administrators.
- [ ] Create limited salesperson and delivery accounts.
- [ ] Test that public visitors cannot read wholesale prices, costs, unpublished products or private customer information.
- [ ] Test that delivery staff only see their own assigned deliveries.
- [ ] Test database backup and restore.
- [ ] Add rate limiting and abuse protection to public forms.
- [ ] Review all row-level security policies.

## Sales and financial testing
- [ ] Test retail POS sale and online order against the same stock.
- [ ] Test two simultaneous purchases of the last unit.
- [ ] Test unpaid, part-paid, paid, refunded and cancelled orders.
- [ ] Test discount, delivery fee, return, damaged goods and expense handling.
- [ ] Verify revenue, cost of goods sold, gross profit and net profit.
- [ ] Test wholesale access approval and revocation.

## Cross-device and launch
- [ ] Test on laptop, Android phone and a separate browser/device.
- [ ] Confirm the same published product count and stock everywhere.
- [ ] Check mobile layout, loading, error states and empty catalogue states.
- [ ] Configure domain, hosting, SSL and production environment variables.
- [ ] Launch only after the production checklist and acceptance tests pass.
