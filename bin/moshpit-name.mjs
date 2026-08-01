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

  moshpit-name check <ending>     can this ending be claimed, and if not why
  moshpit-name parse <name>       split a name into its label and ending
  moshpit-name list [-]           parse a pasted list; - reads stdin
  moshpit-name prices             what an ending and a name cost

Pure rules, no network. The same answers the registry gives, without asking it.`;

const [sub, ...rest] = process.argv.slice(2);
const out = console.log;

const readStdin = async () => {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
};

if (!sub || sub === "help" || sub === "--help") {
  out(USAGE);
  process.exit(0);
}

if (sub === "check") {
  const raw = rest[0];
  const tld = normalizeTld(raw);
  if (!tld) {
    out(`.${raw ?? ""} — not a valid ending (letters, digits and dashes only, no dots)`);
    process.exit(1);
  }
  const why = tldRejection(tld);
  out(why ? `.${tld} — ${why}` : `.${tld} — claimable`);
  process.exit(why ? 1 : 0);
}

if (sub === "parse") {
  const parsed = parseMoshpitName(rest[0]);
  if (!parsed) {
    // The two ways this fails are worth telling apart: too many labels, and a
    // pair of numbers that reads as an IPv4 literal.
    out(`${rest[0] ?? ""} — not a Moshpit name (one label and one ending; both numeric reads as an address)`);
    process.exit(1);
  }
  out(`${parsed.label}.${parsed.tld}   label=${parsed.label}  ending=${parsed.tld}`);
  process.exit(0);
}

if (sub === "list") {
  const input = rest[0] === "-" || !rest.length ? await readStdin() : rest.join("\n");
  const { entries, skipped } = parseTldList(input);
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
  out(`\n${counted.join(", ")}${skipped ? `, ${skipped} past the ${MAX_BULK_TLDS} limit` : ""}`);
  process.exit(0);
}

if (sub === "prices") {
  out(`ending   .whatever      $${ENDING_PRICE_USD}/year`);
  out(`name     me.whatever    $${CHILD_PRICE_USD}/year, set by the ending's operator`);
  out(`\n${RESERVED_TLDS.size} endings are reserved and cannot be claimed.`);
  process.exit(0);
}

console.error(`unknown: ${sub}\n\n${USAGE}`);
process.exit(1);
