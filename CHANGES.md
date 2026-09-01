# Update 11 — Monitoring report: fix Client Group ordering (SG1, SG2, ... SG10)

Delta package. One file changed — copy it over the matching path in your
project.

## What was wrong

`lib/server/monitoring-report-query.ts`'s SQL sorted Client Groups with a
plain Postgres text `ORDER BY cg."name"`, which is lexicographic (character
by character), not numeric. That put "SG10" and "SG11" right after "SG1"
and before "SG2", since '1' < '2' as a character regardless of what comes
after it — giving the SG1, SG10, SG11, SG2, SG3... order you saw.

## The fix

After the query runs, the rows are now re-sorted in JavaScript with
`Intl.Collator(..., { numeric: true })`, which compares embedded numbers
by value instead of character-by-character — the same fix used for
"file2" vs "file10" style sorting anywhere else. That gives SG1, SG2,
SG3, ..., SG10, SG11, and so on. Area grouping, ungrouped-clients-last
placement, and the secondary client/location sort are all preserved
exactly as before — only the Client Group ordering changed. Since this
ordering is also what `components/pages/Monitoring.tsx`'s grouping logic
relies on to decide which consecutive rows belong under the same header,
this fix also guarantees each group's rows stay contiguous.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean.
- `npx next lint` — no new warnings.
