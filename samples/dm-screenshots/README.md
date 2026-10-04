# Sample DM screenshots

Fictional conversations judges can feed into Sorted, and the fixtures the
week-3 parser tests run against. No real people, businesses, handles or
trademarks appear. The seller is Ola's Bakehouse; items come from
`samples/seed-catalogue.json`.

| File | Scenario | What it exercises |
|---|---|---|
| `01.png` | Jess M orders a lemon drizzle 10 inch and a brownie box of 6, collection Sat 10 Oct 2pm | The happy path, and the canonical **£56** order the design screens show. This is the one the demo video uses. |

Still to produce (scenarios fixed, see the plan):

| File | Scenario | What it must exercise |
|---|---|---|
| `02.png` | Buyer never states a size | a `missing` ambiguity on `variantIds` |
| `03.png` | Two items, one quantity given as "a couple" | `qty_unclear` |
| `04.png` | Buyer asks for something not in the catalogue | `unknown_product`, `matchMethod: 'unmatched'` |
| `05.png` | Buyer changes their mind mid-thread (8 inch, then "actually make it 10") | parser must take the final state |
| `06.png` | Collection given as "next Saturday" | relative-date handling |
| `07.png` | Buyer asks to pay a deposit now, balance on collection | `depositRequestedMinor` |
| `08.png` | Buyer quotes a price the seller never gave | `price_conflict` — the catalogue price must win |

Generated from hand-written HTML rendered at phone width; the source for
`01.png` is in the commit that added it.
