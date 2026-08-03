#!/usr/bin/env node
// The namespace rules, from a shell.
//
// Every verb here answers a question the registry would otherwise have to be
// asked over the network — and the answers are pure, so they are the same
// offline, in CI, and inside a browser extension.

import {
  CHILD_PRICE_USD, ENDING_PRICE_USD, MAX_BULK_TLDS, RESERVED_TLDS,
  normalizeTld, parseMoshpitName, parseTldList, tldRejection,
} from "../lib/index.mjs";

const USAGE = `moshpit-name — the Moshpit namespace rules

  moshpit-name check <ending...> [--json]
                                        can these endings be claimed, and if not why
  moshpit-name parse <name> [--json]    split a name into its label and ending
  moshpit-name list [-] [--limit N] [--json]
                                        parse up to N pasted entries; - reads stdin
  moshpit-name reserved [--json]        list endings that cannot be claimed
  moshpit-name prices [--json]          what an ending and a name cost

Pure rules, no network. The same answers the registry gives, without asking it.`;

const [sub, ...rawRest] = process.argv.slice(2);
let json = false;
const rest = [];
let limit = MAX_BULK_TLDS;
let limitValue;
let limitFlags = 0;
let optionError = null;
let parsingOptions = true;
for (let index = 0; index < rawRest.length; index++) {
  const arg = rawRest[index];
  if (parsingOptions && arg === "--") {
    parsingOptions = false;
    continue;
  }
  if (parsingOptions && arg === "--json") {
    json = true;
    continue;
  }
  if (parsingOptions && arg === "--limit") {
    if (sub !== "list") {
      optionError ??= 'unknown option "--limit"';
      continue;
    }
    limitFlags++;
    const candidate = rawRest[index + 1];
    if (candidate !== undefined && !candidate.startsWith("--")) {
      limitValue = candidate;
      index++;
    }
    continue;
  }
  if (parsingOptions && arg.startsWith("--")) {
    optionError ??= `unknown option "${arg}"`;
    continue;
  }
  rest.push(arg);
}
const out = console.log;
const outJson = (value) => out(JSON.stringify(value, null, 2));

const readStdin = async () => {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
};

if (!sub || sub === "help" || sub === "--help") {
  out(USAGE);
  process.exit(0);
}

if (optionError) {
  if (json) outJson({ error: optionError });
  else console.error(`moshpit-name: ${optionError}`);
  process.exit(1);
}

if (sub === "check") {
  const inputs = rest.length ? rest : [undefined];
  const results = inputs.map((input) => {
    const tld = normalizeTld(input);
    if (!tld) {
      return {
        input: input ?? null,
        tld: null,
        claimable: false,
        reason: "not a valid ending (letters, digits and dashes only, no dots)",
      };
    }
    const reason = tldRejection(tld);
    return { input, tld, claimable: !reason, reason };
  });

  if (json) {
    if (results.length === 1) outJson(results[0]);
    else {
      const claimableCount = results.filter((result) => result.claimable).length;
      outJson({
        count: results.length,
        claimableCount,
        rejectedCount: results.length - claimableCount,
        results,
      });
    }
  } else {
    for (const result of results) {
      out(result.claimable
        ? `.${result.tld} — claimable`
        : `.${result.tld ?? result.input ?? ""} — ${result.reason}`);
    }
  }
  process.exit(results.some((result) => !result.claimable) ? 1 : 0);
}

if (sub === "parse") {
  const input = rest[0];
  const parsed = parseMoshpitName(input);
  if (!parsed) {
    // The two ways this fails are worth telling apart: too many labels, and a
    // pair of numbers that reads as an IPv4 literal.
    const reason = "not a Moshpit name (one label and one ending; both numeric reads as an address)";
    if (json) outJson({ input: input ?? null, valid: false, label: null, tld: null, reason });
    else out(`${input ?? ""} — ${reason}`);
    process.exit(1);
  }
  if (json) outJson({ input, valid: true, ...parsed, reason: null });
  else out(`${parsed.label}.${parsed.tld}   label=${parsed.label}  ending=${parsed.tld}`);
  process.exit(0);
}

if (sub === "list") {
  const parsedLimit = Number(limitValue);
  const validLimit = limitFlags === 0 || (
    limitFlags === 1
    && /^\d+$/.test(limitValue ?? "")
    && Number.isSafeInteger(parsedLimit)
    && parsedLimit >= 1
    && parsedLimit <= MAX_BULK_TLDS
  );
  if (!validLimit) {
    const error = `--limit must be an integer from 1 to ${MAX_BULK_TLDS}`;
    if (json) outJson({ error });
    else console.error(`moshpit-name: ${error}`);
    process.exit(1);
  }
  if (limitFlags === 1) limit = parsedLimit;

  const input = rest[0] === "-" || !rest.length ? await readStdin() : rest.join("\n");
  const parsed = parseTldList(input, limit);
  if (json) {
    outJson(parsed);
    process.exit(0);
  }
  const { entries, skipped } = parsed;
  for (const e of entries) {
    // A name is printed as written. Prefixing it with a dot would spell it as
    // an ending, which is the one thing it is not.
    const bits = [e.label ? `${e.label}.${e.tld}` : `.${e.tld}`];
    if (e.aliasOf) bits.push(`→ .${e.aliasOf}`);
    if (e.priceUsd !== null) bits.push(`$${e.priceUsd}`);
    // A token that is neither an ending nor a name arrives here carrying its
    // own bad text, and tldRejection only speaks about things that are already
    // shaped like an ending — so the malformed case is named here rather than
    // printed clean as though the registry would take it.
    const why = normalizeTld(e.tld)
      ? tldRejection(e.tld)
      : "not a valid ending — letters, digits and dashes only, no dots";
    if (why) bits.push(`[${why}]`);
    out(bits.join("  "));
  }
  const endings = entries.filter((e) => !e.label).length;
  const names = entries.length - endings;
  const counted = [`${endings} ending${endings === 1 ? "" : "s"}`];
  if (names) counted.push(`${names} name${names === 1 ? "" : "s"}`);
  out(`\n${counted.join(", ")}${skipped ? `, ${skipped} past the ${limit} limit` : ""}`);
  process.exit(0);
}

if (sub === "reserved") {
  const tlds = [...RESERVED_TLDS].sort();
  if (json) outJson({ count: tlds.length, tlds });
  else out(tlds.map((tld) => `.${tld}`).join("\n"));
  process.exit(0);
}

if (sub === "prices") {
  if (json) {
    outJson({
      endingUsdPerYear: ENDING_PRICE_USD,
      nameUsdPerYear: CHILD_PRICE_USD,
      reservedCount: RESERVED_TLDS.size,
    });
  } else {
    out(`ending   .whatever      $${ENDING_PRICE_USD}/year`);
    out(`name     me.whatever    $${CHILD_PRICE_USD}/year, set by the ending's operator`);
    out(`\n${RESERVED_TLDS.size} endings are reserved and cannot be claimed.`);
  }
  process.exit(0);
}

console.error(`unknown: ${sub}\n\n${USAGE}`);
process.exit(1);
