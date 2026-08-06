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
moshpit-name check (<ending...> | -) [--json | --ndjson]
                                      can endings be claimed; - reads one per line
moshpit-name parse (<name...> | -) [--json | --ndjson]
                                      split names into labels; - reads one per line
moshpit-name list [-] [--limit N] [--json | --ndjson]
                                       parse up to N pasted entries; - reads stdin
moshpit-name reserved [--json]        list endings that cannot be claimed
moshpit-name prices [--json]          what an ending and a name cost
```

```
$ moshpit-name check .420
.420 — claimable

$ moshpit-name check .eggs .bank --json
{
  "count": 2,
  "claimableCount": 1,
  "rejectedCount": 1,
  "results": [
    {
      "input": ".eggs",
      "tld": "eggs",
      "claimable": true,
      "reason": null
    },
    {
      "input": ".bank",
      "tld": "bank",
      "claimable": false,
      "reason": "that name is reserved"
    }
  ]
}

$ moshpit-name parse 1.420
1.420 — not a Moshpit name (one label and one ending; both numeric reads as an address)

$ printf '.toplevel .redirect $2.00USD\neggs, yeah\n' | moshpit-name list -
.toplevel  → .redirect  $2
.eggs
.yeah

$ printf 'eggs\nyeah\noranges\n' | moshpit-name list - --limit 2 --json
{
  "entries": [
    { "tld": "eggs", "label": null, "aliasOf": null, "priceUsd": null },
    { "tld": "yeah", "label": null, "aliasOf": null, "priceUsd": null }
  ],
  "tlds": ["eggs", "yeah"],
  "names": [],
  "skipped": 1
}

$ moshpit-name reserved
.amazon
.amex
.anthropic
...
```

Every data command accepts `--json`, including failures, so scripts can consume
the same rules without scraping the human-readable output:

```sh
$ moshpit-name check .420 --json
{
  "input": ".420",
  "tld": "420",
  "claimable": true,
  "reason": null
}
```

For compatibility, `check <ending> --json` and `parse <name> --json` return
their established bare result objects. Passing two or more inputs returns a
batch wrapper with counts and a `results` array; results stay in input order and
any rejected input makes the command exit non-zero.

Pass `-` as the only input to `check` or `parse` to read up to 1000 non-empty
lines from stdin. Stdin JSON always uses the batch wrapper, even for one line,
so a pipeline receives a stable shape. More than 1000 lines is an error. An
empty stream is treated like a missing input and exits non-zero.

Use `--ndjson` with `check`, `parse`, or `list` when each result should be a
compact JSON object on its own line. This keeps input order, writes even a
single result as one record, and preserves the command's normal exit status.
For `list`, the records are the parsed entries; an empty list produces no
records. `--json` and `--ndjson` cannot be combined.

```sh
$ printf '.eggs\n.bank\n' | moshpit-name check - --ndjson
{"input":".eggs","tld":"eggs","claimable":true,"reason":null}
{"input":".bank","tld":"bank","claimable":false,"reason":"that name is reserved"}
```

`list --limit N` stops after `N` unique entries and reports the remainder in
`skipped`. `N` must be an integer from 1 through 1000, the package's bulk
ceiling. The option works with inline arguments or stdin and can appear before
or after `-`.

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
