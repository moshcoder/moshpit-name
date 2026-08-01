# @moshcoder/moshpit-name

The Moshpit namespace rules: what is a valid ending, what a name parses to,
which namespace wins, and what things cost.

Pure and dependency-free. No database, no network, no `node:` builtins — so the
same code runs on a server, in a browser extension, and in CI.

```sh
npm i @moshcoder/moshpit-name
```

```js
import { parseMoshpitName, tldRejection, parseTldList } from "@moshcoder/moshpit-name";

parseMoshpitName("blue.420");   // { label: "blue", tld: "420" }
parseMoshpitName("1.420");      // null — both halves numeric reads as an IPv4 literal
tldRejection("bank");           // "that name is reserved"

// A pasted list holds both halves of the namespace, in whichever shape the
// person typed. The leading dot is decoration; two labels is a name.
parseTldList("eggs\n.whatever\nblue.eggs\n.me.whatever");
// tlds:  ["eggs", "whatever"]
// names: [{ tld: "eggs", label: "blue" }, { tld: "whatever", label: "me" }]
```

## Why it is a package

These rules were written three times: once in the registry, once in
TronBrowser's TypeScript resolver, and once as a hand port of that into the
extension — with a test asserting the last two agree. A test that exists to
catch drift between two copies is a good sign the copies should be one thing.

## CLI

```sh
moshpit-name check <ending>     can this ending be claimed, and if not why
moshpit-name parse <name>       split a name into its label and ending
moshpit-name list [-]           parse a pasted list; - reads stdin
moshpit-name prices             what an ending and a name cost
```

```
$ moshpit-name check .420
.420 — claimable

$ moshpit-name parse 1.420
1.420 — not a Moshpit name (one label and one ending; both numeric reads as an address)

$ printf '.toplevel .redirect $2.00USD\neggs, yeah\n' | moshpit-name list -
.toplevel  → .redirect  $2
.eggs
.yeah
```

## What it decides

**Shape.** One label and one ending. `a.b.c` is malformed, not a subdomain.
Either half may be all digits — `.420` is an ending people want — but *both*
being numeric reads as an abbreviated IPv4 literal, so `1.420` is refused where
`blue.420` is not.

**Reserved names.** Endings that trade on trust in money, a company, or an
institution cannot be claimed.

**Precedence.** `clearnet` mode lets the real internet win and Moshpit fill
gaps; `moshpit` mode lets a registered name beat a clearnet answer. Which one
applies is the resolver operator's call, and through them the user's.

**Prices.** An ending is $5/year; a name under one is $2/year, set by that
ending's operator. Whole dollars — the trailing cent in a `.99` buys nothing
and every number here is one a person has to reason about.

**Pasted lists.** Newlines, commas and semicolons separate; a line may carry a
price and an ending to point at. `.187` is an ending, bare `187` is a price.

## License

MIT.
