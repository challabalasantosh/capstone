BEGIN;

INSERT INTO product_categories (
    category_id, category_name, description
)
SELECT
    n,
    'Category ' || lpad(n::text, 3, '0'),
    'Sample product category ' || n
FROM generate_series(1, 100) AS series(n);

INSERT INTO products (
    product_id, category_id, product_name, sku, description, unit_price
)
SELECT
    n,
    n,
    'Product ' || lpad(n::text, 3, '0'),
    'SKU-' || lpad(n::text, 5, '0'),
    'Sample product ' || n,
    (10.00 + n * 1.25)::NUMERIC(12, 2)
FROM generate_series(1, 100) AS series(n);

INSERT INTO customers (
    customer_id, first_name, last_name, email, phone,
    billing_address, shipping_address
)
SELECT
    n,
    'First' || lpad(n::text, 3, '0'),
    'Customer' || lpad(n::text, 3, '0'),
    'customer' || lpad(n::text, 3, '0') || '@example.com',
    '+1-555-' || lpad(n::text, 7, '0'),
    n || ' Sample Billing Street',
    n || ' Sample Shipping Street'
FROM generate_series(1, 100) AS series(n);

INSERT INTO orders (
    order_id, customer_id, order_date, status, currency, notes
)
SELECT
    n,
    n,
    CURRENT_TIMESTAMP - n * INTERVAL '1 day',
    CASE n % 5
        WHEN 0 THEN 'delivered'
        WHEN 1 THEN 'pending'
        WHEN 2 THEN 'processing'
        WHEN 3 THEN 'shipped'
        ELSE 'cancelled'
    END,
    'USD',
    'Sample order ' || n
FROM generate_series(1, 100) AS series(n);

INSERT INTO order_items (
    order_id, product_id, quantity, unit_price
)
SELECT
    n,
    n,
    (n % 5) + 1,
    (10.00 + n * 1.25)::NUMERIC(12, 2)
FROM generate_series(1, 100) AS series(n);

INSERT INTO invoices (
    invoice_id, invoice_number, order_id, customer_id, issued_at, due_at,
    status, subtotal, tax_amount, total_amount, currency
)
SELECT
    n,
    'INV-' || lpad(n::text, 6, '0'),
    n,
    n,
    CURRENT_TIMESTAMP - n * INTERVAL '1 day',
    CASE
        WHEN n % 4 = 3 THEN CURRENT_TIMESTAMP - INTERVAL '1 day'
        ELSE CURRENT_TIMESTAMP + INTERVAL '30 days'
    END,
    CASE n % 4
        WHEN 0 THEN 'paid'
        WHEN 1 THEN 'issued'
        WHEN 2 THEN 'draft'
        ELSE 'overdue'
    END,
    totals.subtotal,
    round(totals.subtotal * 0.08, 2),
    totals.subtotal + round(totals.subtotal * 0.08, 2),
    'USD'
FROM generate_series(1, 100) AS series(n)
CROSS JOIN LATERAL (
    SELECT
        ((10.00 + n * 1.25) * ((n % 5) + 1))::NUMERIC(12, 2) AS subtotal
) AS totals;

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
