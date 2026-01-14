import assert from "node:assert/strict";
import test from "node:test";

import { parseSortOrderInput } from "./categories.service.js";

test("parseSortOrderInput handles defaults and missing values", () => {
  assert.equal(parseSortOrderInput(undefined), undefined);
  assert.equal(parseSortOrderInput(undefined, { defaultValue: 0 }), 0);
});

test("parseSortOrderInput accepts numeric values", () => {
  assert.equal(parseSortOrderInput(0), 0);
  assert.equal(parseSortOrderInput(5), 5);
  assert.equal(parseSortOrderInput(""), 0);
});

test("parseSortOrderInput rejects non-numeric values", () => {
  assert.throws(() => parseSortOrderInput("abc"), /sort_order must be a number/);
});
