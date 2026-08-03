import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CHILD_PRICE_USD, ENDING_PRICE_USD, MAX_BULK_TLDS, RESERVED_TLDS,
} from "../lib/index.mjs";

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

test("list --limit caps stdin input and reports skipped entries in JSON", () => {
  const result = run(
    ["list", "-", "--limit", "2", "--json"],
    ".Eggs\nblue.eggs\nyeah\noranges\n",
  );

  assert.equal(result.status, 0);
  assert.deepEqual(output(result), {
    entries: [
      { tld: "eggs", label: null, aliasOf: null, priceUsd: null },
      { tld: "eggs", label: "blue", aliasOf: null, priceUsd: null },
    ],
    tlds: ["eggs"],
    names: [{ tld: "eggs", label: "blue" }],
    skipped: 2,
  });
});

test("list --limit uses the configured limit in the human summary", () => {
  const result = run(["list", "eggs", "yeah", "oranges", "--limit", "2"]);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, ".eggs\n.yeah\n\n2 endings, 1 past the 2 limit\n");
});

test("list --limit rejects missing, invalid, zero, fractional, and oversized values", () => {
  for (const value of [
    undefined, "nope", "0", "-1", "1.5", "1e3",
    String(MAX_BULK_TLDS + 1), "9007199254740992",
  ]) {
    const args = ["list", "--limit"];
    if (value !== undefined) args.push(value);
    const result = run(args, "eggs\n");

    assert.equal(result.status, 1, value);
    assert.equal(result.stdout, "", value);
    assert.equal(
      result.stderr,
      `moshpit-name: --limit must be an integer from 1 to ${MAX_BULK_TLDS}\n`,
      value,
    );
  }
});

test("list --limit validation stays machine-readable with --json", () => {
  const result = run(["list", "--limit", "--json"], "eggs\n");

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.deepEqual(output(result), {
    error: `--limit must be an integer from 1 to ${MAX_BULK_TLDS}`,
  });
});

test("list --limit accepts the package maximum", () => {
  const result = run(["list", "--limit", String(MAX_BULK_TLDS), "-", "--json"], "eggs\n");

  assert.equal(result.status, 0);
  assert.equal(output(result).skipped, 0);
});

test("reserved lists the complete set in stable order", () => {
  const expected = [...RESERVED_TLDS].sort();
  const human = run(["reserved"]);

  assert.equal(human.status, 0);
  assert.equal(human.stderr, "");
  assert.equal(human.stdout, `${expected.map((tld) => `.${tld}`).join("\n")}\n`);

  const json = run(["reserved", "--json"]);
  assert.equal(json.status, 0);
  assert.deepEqual(output(json), { count: expected.length, tlds: expected });
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
