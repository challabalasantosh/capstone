-- Replaces business-table sample data with a connected, fictional dataset.
-- This clears rows from the six business tables; app_users and query_feedback
-- are intentionally retained. Run against the intended database as an admin.
BEGIN;

TRUNCATE TABLE
    invoices,
    order_items,
    orders,
    products,
    customers,
    product_categories
RESTART IDENTITY;

INSERT INTO product_categories (category_id, category_name, description) VALUES
    (1, 'Analytics & Reporting', 'Business intelligence, reporting, and decision-support products.'),
    (2, 'Cloud Infrastructure', 'Cloud hosting, storage, compute, and platform services.'),
    (3, 'Security & Compliance', 'Identity, endpoint protection, governance, and compliance solutions.'),
    (4, 'Workplace Collaboration', 'Communication, productivity, and team collaboration tools.'),
    (5, 'Customer Experience', 'Customer engagement, service, and experience management platforms.'),
    (6, 'Operations Management', 'Workflow, asset, and operational management solutions.');

INSERT INTO products (
    product_id, category_id, product_name, sku, description, unit_price, is_active
) VALUES
    (1, 1, 'Insight Platform Standard', 'ANL-INS-STD', 'Core dashboards, scheduled reports, and self-service analytics for growing teams.', 249.00, TRUE),
    (2, 1, 'Insight Platform Enterprise', 'ANL-INS-ENT', 'Enterprise analytics workspace with governed data access and advanced reporting.', 689.00, TRUE),
    (3, 1, 'Executive Metrics Pack', 'ANL-MET-EXE', 'Curated executive scorecards for revenue, customer, and operational performance.', 129.00, TRUE),
    (4, 2, 'Cloud Compute S', 'CLD-CMP-S', 'Monthly small-instance compute allocation for development and departmental workloads.', 89.00, TRUE),
    (5, 2, 'Cloud Compute M', 'CLD-CMP-M', 'Monthly balanced compute allocation for production business applications.', 179.00, TRUE),
    (6, 2, 'Managed Storage 1 TB', 'CLD-STO-1T', 'One terabyte of managed business storage with monitoring and recovery support.', 59.00, TRUE),
    (7, 3, 'Identity Access Suite', 'SEC-IAM-100', 'Identity lifecycle and role-based access management for up to 100 users.', 399.00, TRUE),
    (8, 3, 'Endpoint Protection Business', 'SEC-END-BIZ', 'Centralized endpoint protection and policy management for business devices.', 219.00, TRUE),
    (9, 3, 'Compliance Readiness Review', 'SEC-CMP-REV', 'Structured compliance readiness assessment and prioritized remediation report.', 950.00, TRUE),
    (10, 4, 'Team Collaboration Pro', 'COL-TEAM-PRO', 'Business messaging, shared workspaces, and team collaboration for 25 users.', 149.00, TRUE),
    (11, 4, 'Video Meeting Business', 'COL-VID-BIZ', 'Business video meetings with administration, recording, and calendar integration.', 99.00, TRUE),
    (12, 4, 'Project Workspace', 'COL-PRJ-WS', 'Shared project planning workspace with templates and portfolio reporting.', 189.00, TRUE),
    (13, 5, 'Customer Support Desk', 'CX-SUP-DESK', 'Omnichannel support workspace with service queues and customer case tracking.', 329.00, TRUE),
    (14, 5, 'Customer Feedback Insights', 'CX-FDB-INS', 'Feedback collection and sentiment trend reporting for customer experience teams.', 279.00, TRUE),
    (15, 5, 'Customer Engagement Suite', 'CX-ENG-SUITE', 'Customer engagement campaigns with audience management and performance reporting.', 519.00, TRUE),
    (16, 6, 'Workflow Automation Basic', 'OPS-WRK-BAS', 'No-code workflow automation for routine approvals and team processes.', 159.00, TRUE),
    (17, 6, 'Asset Tracking Business', 'OPS-AST-BIZ', 'Asset register and lifecycle tracking for distributed business operations.', 239.00, TRUE),
    (18, 6, 'Operations Control Center', 'OPS-CTRL-CTR', 'Operational overview with service health, ownership, and incident coordination.', 449.00, TRUE);

INSERT INTO customers (
    customer_id, first_name, last_name, email, phone, billing_address, shipping_address
) VALUES
    (1, 'Avery', 'Morgan', 'avery.morgan@example.com', '+1-202-555-0101', '100 Example Avenue, Suite 200, Seattle, WA 98101', '100 Example Avenue, Suite 200, Seattle, WA 98101'),
    (2, 'Jordan', 'Lee', 'jordan.lee@example.com', '+1-202-555-0102', '240 Market Street, Floor 4, Portland, OR 97204', '240 Market Street, Floor 4, Portland, OR 97204'),
    (3, 'Riley', 'Patel', 'riley.patel@example.com', '+1-202-555-0103', '75 Harbor Way, Suite 310, San Francisco, CA 94105', '75 Harbor Way, Suite 310, San Francisco, CA 94105'),
    (4, 'Casey', 'Brooks', 'casey.brooks@example.com', '+1-202-555-0104', '820 Central Plaza, Suite 120, Denver, CO 80202', '820 Central Plaza, Suite 120, Denver, CO 80202'),
    (5, 'Taylor', 'Nguyen', 'taylor.nguyen@example.com', '+1-202-555-0105', '16 Riverfront Drive, Suite 500, Austin, TX 78701', '16 Riverfront Drive, Suite 500, Austin, TX 78701'),
    (6, 'Morgan', 'Reed', 'morgan.reed@example.com', '+1-202-555-0106', '330 Commerce Boulevard, Floor 2, Chicago, IL 60606', '330 Commerce Boulevard, Floor 2, Chicago, IL 60606'),
    (7, 'Quinn', 'Foster', 'quinn.foster@example.com', '+1-202-555-0107', '510 Northgate Street, Suite 180, Boston, MA 02110', '510 Northgate Street, Suite 180, Boston, MA 02110'),
    (8, 'Cameron', 'Diaz', 'cameron.diaz@example.com', '+1-202-555-0108', '92 Innovation Park, Building B, Raleigh, NC 27601', '92 Innovation Park, Building B, Raleigh, NC 27601'),
    (9, 'Drew', 'Kim', 'drew.kim@example.com', '+1-202-555-0109', '410 Lakeview Road, Suite 220, Minneapolis, MN 55401', '410 Lakeview Road, Suite 220, Minneapolis, MN 55401'),
    (10, 'Skyler', 'Bennett', 'skyler.bennett@example.com', '+1-202-555-0110', '28 Union Square, Floor 6, New York, NY 10003', '28 Union Square, Floor 6, New York, NY 10003'),
    (11, 'Parker', 'Shah', 'parker.shah@example.com', '+1-202-555-0111', '670 Westbridge Lane, Suite 140, Phoenix, AZ 85004', '670 Westbridge Lane, Suite 140, Phoenix, AZ 85004'),
    (12, 'Reese', 'Turner', 'reese.turner@example.com', '+1-202-555-0112', '155 Summit Center, Suite 410, Atlanta, GA 30303', '155 Summit Center, Suite 410, Atlanta, GA 30303');

INSERT INTO orders (
    order_id, customer_id, order_date, status, notes
) VALUES
    (1, 1, CURRENT_TIMESTAMP - INTERVAL '330 days', 'delivered', 'Initial analytics and collaboration rollout.'),
    (2, 2, CURRENT_TIMESTAMP - INTERVAL '315 days', 'delivered', 'Cloud infrastructure subscription renewal.'),
    (3, 3, CURRENT_TIMESTAMP - INTERVAL '300 days', 'delivered', 'Customer support platform deployment.'),
    (4, 4, CURRENT_TIMESTAMP - INTERVAL '285 days', 'delivered', 'Security and identity management implementation.'),
    (5, 5, CURRENT_TIMESTAMP - INTERVAL '270 days', 'shipped', 'Project and workflow management licenses.'),
    (6, 6, CURRENT_TIMESTAMP - INTERVAL '250 days', 'delivered', 'Analytics services for finance operations.'),
    (7, 7, CURRENT_TIMESTAMP - INTERVAL '230 days', 'delivered', 'Customer experience team expansion.'),
    (8, 8, CURRENT_TIMESTAMP - INTERVAL '210 days', 'delivered', 'Cloud storage and endpoint protection.'),
    (9, 9, CURRENT_TIMESTAMP - INTERVAL '190 days', 'delivered', 'Collaboration suite for regional teams.'),
    (10, 10, CURRENT_TIMESTAMP - INTERVAL '170 days', 'delivered', 'Executive reporting and customer engagement.'),
    (11, 11, CURRENT_TIMESTAMP - INTERVAL '150 days', 'delivered', 'Operations center and asset tracking.'),
    (12, 12, CURRENT_TIMESTAMP - INTERVAL '130 days', 'delivered', 'Identity and compliance readiness engagement.'),
    (13, 1, CURRENT_TIMESTAMP - INTERVAL '110 days', 'delivered', 'Additional analytics seats and cloud capacity.'),
    (14, 3, CURRENT_TIMESTAMP - INTERVAL '95 days', 'delivered', 'Customer service and feedback reporting expansion.'),
    (15, 5, CURRENT_TIMESTAMP - INTERVAL '80 days', 'delivered', 'Workflow automation and project workspace renewal.'),
    (16, 7, CURRENT_TIMESTAMP - INTERVAL '65 days', 'shipped', 'Additional customer engagement licenses.'),
    (17, 2, CURRENT_TIMESTAMP - INTERVAL '50 days', 'delivered', 'Compute capacity upgrade and storage renewal.'),
    (18, 4, CURRENT_TIMESTAMP - INTERVAL '40 days', 'processing', 'Security policy expansion for new users.'),
    (19, 6, CURRENT_TIMESTAMP - INTERVAL '30 days', 'delivered', 'Quarterly analytics and reporting package.'),
    (20, 8, CURRENT_TIMESTAMP - INTERVAL '22 days', 'shipped', 'Operations and cloud infrastructure expansion.'),
    (21, 10, CURRENT_TIMESTAMP - INTERVAL '14 days', 'processing', 'Customer engagement and video collaboration renewal.'),
    (22, 11, CURRENT_TIMESTAMP - INTERVAL '8 days', 'pending', 'New asset management deployment.'),
    (23, 12, CURRENT_TIMESTAMP - INTERVAL '4 days', 'pending', 'Compliance review and identity suite renewal.'),
    (24, 9, CURRENT_TIMESTAMP - INTERVAL '2 days', 'cancelled', 'Cancelled before fulfillment; no revenue recognized.');

INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
    (1, 1, 2, 249.00), (1, 10, 1, 149.00),
    (2, 5, 2, 179.00), (2, 6, 3, 59.00),
    (3, 13, 2, 329.00), (3, 14, 1, 279.00),
    (4, 7, 1, 399.00), (4, 9, 1, 950.00),
    (5, 12, 2, 189.00), (5, 16, 2, 159.00),
    (6, 2, 1, 689.00), (6, 3, 2, 129.00),
    (7, 15, 1, 519.00), (7, 13, 1, 329.00),
    (8, 6, 5, 59.00), (8, 8, 2, 219.00),
    (9, 10, 3, 149.00), (9, 11, 2, 99.00),
    (10, 3, 3, 129.00), (10, 15, 1, 519.00),
    (11, 18, 1, 449.00), (11, 17, 2, 239.00),
    (12, 7, 1, 399.00), (12, 9, 1, 950.00),
    (13, 1, 3, 249.00), (13, 5, 2, 179.00),
    (14, 13, 1, 329.00), (14, 14, 2, 279.00),
    (15, 16, 3, 159.00), (15, 12, 1, 189.00),
    (16, 15, 2, 519.00), (16, 3, 2, 129.00),
    (17, 5, 3, 179.00), (17, 6, 4, 59.00),
    (18, 7, 2, 399.00), (18, 8, 3, 219.00),
    (19, 2, 1, 689.00), (19, 3, 2, 129.00),
    (20, 18, 1, 449.00), (20, 4, 4, 89.00),
    (21, 15, 1, 519.00), (21, 11, 3, 99.00),
    (22, 17, 3, 239.00), (22, 16, 2, 159.00),
    (23, 9, 1, 950.00), (23, 7, 1, 399.00),
    (24, 12, 1, 189.00), (24, 10, 1, 149.00);

INSERT INTO invoices (
    invoice_id, invoice_number, order_id, customer_id, issued_at, due_at,
    status, subtotal, tax_amount, total_amount, currency
)
SELECT
    invoice_rows.invoice_id,
    invoice_rows.invoice_number,
    orders.order_id,
    orders.customer_id,
    orders.order_date,
    orders.order_date + INTERVAL '30 days',
    invoice_rows.status,
    totals.subtotal,
    round(totals.subtotal * 0.0825, 2),
    totals.subtotal + round(totals.subtotal * 0.0825, 2),
    orders.currency
FROM (
    VALUES
        (1, 'P2I-INV-1001', 'paid'),
        (2, 'P2I-INV-1002', 'paid'),
        (3, 'P2I-INV-1003', 'paid'),
        (4, 'P2I-INV-1004', 'overdue'),
        (5, 'P2I-INV-1005', 'paid'),
        (6, 'P2I-INV-1006', 'paid'),
        (7, 'P2I-INV-1007', 'overdue'),
        (8, 'P2I-INV-1008', 'paid'),
        (9, 'P2I-INV-1009', 'paid'),
        (10, 'P2I-INV-1010', 'paid'),
        (11, 'P2I-INV-1011', 'overdue'),
        (12, 'P2I-INV-1012', 'overdue'),
        (13, 'P2I-INV-1013', 'paid'),
        (14, 'P2I-INV-1014', 'paid'),
        (15, 'P2I-INV-1015', 'paid'),
        (16, 'P2I-INV-1016', 'overdue'),
        (17, 'P2I-INV-1017', 'overdue'),
        (18, 'P2I-INV-1018', 'overdue'),
        (19, 'P2I-INV-1019', 'paid'),
        (20, 'P2I-INV-1020', 'issued'),
        (21, 'P2I-INV-1021', 'issued'),
        (22, 'P2I-INV-1022', 'draft'),
        (23, 'P2I-INV-1023', 'draft'),
        (24, 'P2I-INV-1024', 'void')
) AS invoice_rows(invoice_id, invoice_number, status)
JOIN orders ON orders.order_id = invoice_rows.invoice_id
JOIN LATERAL (
    SELECT sum(order_items.quantity * order_items.unit_price)::NUMERIC(12, 2) AS subtotal
    FROM order_items
    WHERE order_items.order_id = orders.order_id
) AS totals ON TRUE;

SELECT setval(
    pg_get_serial_sequence('product_categories', 'category_id'),
    (SELECT MAX(category_id) FROM product_categories),
    TRUE
);
SELECT setval(
    pg_get_serial_sequence('products', 'product_id'),
    (SELECT MAX(product_id) FROM products),
    TRUE
);
SELECT setval(
    pg_get_serial_sequence('customers', 'customer_id'),
    (SELECT MAX(customer_id) FROM customers),
    TRUE
);
SELECT setval(
    pg_get_serial_sequence('orders', 'order_id'),
    (SELECT MAX(order_id) FROM orders),
    TRUE
);
SELECT setval(
    pg_get_serial_sequence('invoices', 'invoice_id'),
    (SELECT MAX(invoice_id) FROM invoices),
    TRUE
);

COMMIT;

-- Example analysis queries:
-- SELECT status, COUNT(*) AS invoice_count, SUM(total_amount) AS invoiced
-- FROM invoices GROUP BY status ORDER BY invoiced DESC;
--
-- SELECT date_trunc('month', issued_at) AS invoice_month,
--        SUM(total_amount) FILTER (WHERE status = 'paid') AS paid_revenue
-- FROM invoices GROUP BY invoice_month ORDER BY invoice_month;
--
-- SELECT c.first_name, c.last_name, COUNT(o.order_id) AS order_count,
--        SUM(i.total_amount) FILTER (WHERE i.status = 'paid') AS paid_revenue
-- FROM customers c
-- JOIN orders o ON o.customer_id = c.customer_id
-- JOIN invoices i ON i.order_id = o.order_id
-- GROUP BY c.customer_id, c.first_name, c.last_name
-- ORDER BY paid_revenue DESC NULLS LAST;
