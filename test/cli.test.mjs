import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CHILD_PRICE_USD, ENDING_PRICE_USD, RESERVED_TLDS } from "../lib/index.mjs";

const BIN = fileURLToPath(new URL("../bin/moshpit-name.mjs", import.meta.url));

function run(args, input) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", input });
}

function output(result) {
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

test("commands stay human-readable unless --json is requested", () => {
  const result = run(["check", ".420"]);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, ".420 — claimable\n");
});

test("check --json describes claimable, reserved, and malformed endings", () => {
  const claimable = run(["check", ".420", "--json"]);
  assert.equal(claimable.status, 0);
  assert.deepEqual(output(claimable), {
    input: ".420",
    tld: "420",
    claimable: true,
    reason: null,
  });

  const reserved = run(["check", ".bank", "--json"]);
  assert.equal(reserved.status, 1);
  assert.deepEqual(output(reserved), {
    input: ".bank",
    tld: "bank",
    claimable: false,
    reason: "that name is reserved",
  });

  const malformed = run(["check", "two.labels", "--json"]);
  assert.equal(malformed.status, 1);
  assert.deepEqual(output(malformed), {
    input: "two.labels",
    tld: null,
    claimable: false,
    reason: "not a valid ending (letters, digits and dashes only, no dots)",
  });
});

test("parse --json returns normalized fields and structured invalid output", () => {
  const valid = run(["parse", " Blue.EGGS ", "--json"]);
  assert.equal(valid.status, 0);
  assert.deepEqual(output(valid), {
    input: " Blue.EGGS ",
    valid: true,
    label: "blue",
    tld: "eggs",
    reason: null,
  });

  const invalid = run(["parse", "1.420", "--json"]);
  assert.equal(invalid.status, 1);
  assert.deepEqual(output(invalid), {
    input: "1.420",
    valid: false,
    label: null,
    tld: null,
    reason: "not a Moshpit name (one label and one ending; both numeric reads as an address)",
  });
});

test("list --json emits the complete parse result from stdin", () => {
  const result = run(["list", "--json", "-"], ".Eggs\nblue.eggs\nyeah\n");
  assert.equal(result.status, 0);
  assert.deepEqual(output(result), {
    entries: [
      { tld: "eggs", label: null, aliasOf: null, priceUsd: null },
      { tld: "eggs", label: "blue", aliasOf: null, priceUsd: null },
      { tld: "yeah", label: null, aliasOf: null, priceUsd: null },
    ],
    tlds: ["eggs", "yeah"],
    names: [{ tld: "eggs", label: "blue" }],
    skipped: 0,
  });
});

test("prices --json exposes machine-readable annual prices", () => {
  const result = run(["prices", "--json"]);
  assert.equal(result.status, 0);
  assert.deepEqual(output(result), {
    endingUsdPerYear: ENDING_PRICE_USD,
    nameUsdPerYear: CHILD_PRICE_USD,
    reservedCount: RESERVED_TLDS.size,
  });
});
