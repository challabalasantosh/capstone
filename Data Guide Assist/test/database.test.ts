import assert from "node:assert/strict";
import test from "node:test";
import { validateReadOnlyQuery } from "../server/database";

test("accepts single SELECT queries and strips their trailing semicolon", () => {
  assert.equal(
    validateReadOnlyQuery(" SELECT product_name FROM products; "),
    "SELECT product_name FROM products",
  );
});

test("rejects query forms that are not safe read-only SELECT statements", () => {
  for (const query of [
    "UPDATE products SET unit_price = 0",
    "SELECT 1; DELETE FROM products",
    "SELECT * FROM products -- bypass validation",
    "SELECT pg_sleep(120)",
    "SELECT nextval('products_product_id_seq')",
  ]) {
    assert.throws(() => validateReadOnlyQuery(query));
  }
});

test("rejects empty or excessively long SQL", () => {
  assert.throws(() => validateReadOnlyQuery("  "), /Only a single, read-only SELECT query is allowed/);
  assert.throws(
    () => validateReadOnlyQuery(`SELECT '${"x".repeat(10_000)}'`),
    /Only a single, read-only SELECT query is allowed/,
  );
});
