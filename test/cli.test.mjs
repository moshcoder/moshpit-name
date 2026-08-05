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

test("help documents batch arguments and stdin", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /moshpit-name check \(<ending\.\.\.> \| -\) \[--json\]/);
  assert.match(result.stdout, /moshpit-name parse \(<name\.\.\.> \| -\) \[--json\]/);
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

test("check validates multiple endings in one invocation", () => {
  const result = run(["check", ".420", ".bank", "two.labels", "--json"]);

  assert.equal(result.status, 1);
  assert.deepEqual(output(result), {
    count: 3,
    claimableCount: 1,
    rejectedCount: 2,
    results: [
      { input: ".420", tld: "420", claimable: true, reason: null },
      { input: ".bank", tld: "bank", claimable: false, reason: "that name is reserved" },
      {
        input: "two.labels",
        tld: null,
        claimable: false,
        reason: "not a valid ending (letters, digits and dashes only, no dots)",
      },
    ],
  });

  const human = run(["check", "eggs", ".bank", "two.labels"]);
  assert.equal(human.status, 1);
  assert.equal(human.stderr, "");
  assert.equal(human.stdout,
    ".eggs — claimable\n"
    + ".bank — that name is reserved\n"
    + ".two.labels — not a valid ending (letters, digits and dashes only, no dots)\n");

  const empty = run(["check"]);
  assert.equal(empty.status, 1);
  assert.equal(empty.stderr, "");
  assert.equal(empty.stdout,
    ". — not a valid ending (letters, digits and dashes only, no dots)\n");
});

test("check reads newline-delimited endings from stdin", () => {
  const result = run(["check", "-", "--json"], ".420\r\n\r\n.bank\r\ntwo.labels\r\n");

  assert.equal(result.status, 1);
  assert.deepEqual(output(result), {
    count: 3,
    claimableCount: 1,
    rejectedCount: 2,
    results: [
      { input: ".420", tld: "420", claimable: true, reason: null },
      { input: ".bank", tld: "bank", claimable: false, reason: "that name is reserved" },
      {
        input: "two.labels",
        tld: null,
        claimable: false,
        reason: "not a valid ending (letters, digits and dashes only, no dots)",
      },
    ],
  });
});

test("single-line check stdin keeps the batch JSON shape on success", () => {
  const result = run(["check", "-", "--json"], ".420\n");

  assert.equal(result.status, 0);
  assert.deepEqual(output(result), {
    count: 1,
    claimableCount: 1,
    rejectedCount: 0,
    results: [
      { input: ".420", tld: "420", claimable: true, reason: null },
    ],
  });
});

test("empty stdin is reported like a missing check input", () => {
  const missing = run(["check"]);
  const empty = run(["check", "-"], "\n\r\n");
  assert.equal(empty.status, 1);
  assert.equal(empty.stdout, missing.stdout);
  assert.equal(empty.stderr, missing.stderr);
});

test("check rejects stdin beyond the bulk ceiling without a stack trace", () => {
  const input = Array.from({ length: MAX_BULK_TLDS + 1 }, () => ".eggs").join("\n");
  const result = run(["check", "-", "--json"], input);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.deepEqual(output(result), {
    error: `stdin accepts at most ${MAX_BULK_TLDS} non-empty lines`,
  });
});

test("check rejects unknown options and supports an end-of-options separator", () => {
  const limit = run(["check", ".eggs", "--limit", ".bank"]);
  assert.equal(limit.status, 1);
  assert.equal(limit.stdout, "");
  assert.equal(limit.stderr, 'moshpit-name: unknown option "--limit"\n');

  const typo = run(["check", ".eggs", "--jsn", "--json"]);
  assert.equal(typo.status, 1);
  assert.deepEqual(output(typo), { error: 'unknown option "--jsn"' });

  const literal = run(["check", "--", "--jsn"]);
  assert.equal(literal.status, 1);
  assert.equal(literal.stderr, "");
  assert.equal(literal.stdout,
    ".--jsn — not a valid ending (letters, digits and dashes only, no dots)\n");
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

test("parse validates multiple names while preserving input order", () => {
  const result = run(["parse", " Blue.EGGS ", "1.420", "red.420", "--json"]);

  assert.equal(result.status, 1);
  assert.deepEqual(output(result), {
    count: 3,
    validCount: 2,
    invalidCount: 1,
    results: [
      {
        input: " Blue.EGGS ",
        valid: true,
        label: "blue",
        tld: "eggs",
        reason: null,
      },
      {
        input: "1.420",
        valid: false,
        label: null,
        tld: null,
        reason: "not a Moshpit name (one label and one ending; both numeric reads as an address)",
      },
      {
        input: "red.420",
        valid: true,
        label: "red",
        tld: "420",
        reason: null,
      },
    ],
  });

  const human = run(["parse", "Blue.EGGS", "1.420", "red.420"]);
  assert.equal(human.status, 1);
  assert.equal(human.stderr, "");
  assert.equal(
    human.stdout,
    "blue.eggs   label=blue  ending=eggs\n"
    + "1.420 — not a Moshpit name (one label and one ending; both numeric reads as an address)\n"
    + "red.420   label=red  ending=420\n",
  );
});

test("parse reads newline-delimited names from stdin", () => {
  const result = run(["parse", "--json", "-"], " Blue.EGGS \n\n1.420\nred.420\n");

  assert.equal(result.status, 1);
  assert.deepEqual(output(result), {
    count: 3,
    validCount: 2,
    invalidCount: 1,
    results: [
      { input: " Blue.EGGS ", valid: true, label: "blue", tld: "eggs", reason: null },
      {
        input: "1.420",
        valid: false,
        label: null,
        tld: null,
        reason: "not a Moshpit name (one label and one ending; both numeric reads as an address)",
      },
      { input: "red.420", valid: true, label: "red", tld: "420", reason: null },
    ],
  });
});

test("single-line parse stdin keeps the batch JSON shape on success", () => {
  const result = run(["parse", "-", "--json"], "Blue.EGGS\n");

  assert.equal(result.status, 0);
  assert.deepEqual(output(result), {
    count: 1,
    validCount: 1,
    invalidCount: 0,
    results: [
      { input: "Blue.EGGS", valid: true, label: "blue", tld: "eggs", reason: null },
    ],
  });
});

test("empty stdin is reported like a missing parse input", () => {
  const missing = run(["parse"]);
  const empty = run(["parse", "-"], "");
  assert.equal(empty.status, 1);
  assert.equal(empty.stdout, missing.stdout);
  assert.equal(empty.stderr, missing.stderr);
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
