# ExpenseTracker

A responsive personal-finance dashboard built with TypeScript, React 19, and Vite 7. Dexie uses the browser's IndexedDB database (`ExpenseTracker`) for local persistence. Vitest and fake-indexeddb exercise the calculation and persistence layer.

## Run locally

```sh
npm install
npm run dev
```

Quality checks:

```sh
npm test
npm run build
npm run lint
```

The app is local-only. Data stays in this browser profile; there is no account service, backend, device sync, or bank connection. Do not treat this increment as a production financial-data service.

## Architecture

- `src/finance/model.ts` defines accounts, ledger transactions, budgets, goals, and recurring bill schedules.
- `src/finance/database.ts` owns IndexedDB writes and validation. No balances, budget spend, goal totals, or dashboard totals are persisted.
- `src/finance/calculations.ts` derives balances, cash flow, category spend, budget progress, goal progress, and due items from ledger records.
- `src/finance/EntryDialog.tsx` contains account and ledger/planning entry flows; `src/App.tsx` renders live queries and the dashboard.
- Money is stored as safe integer minor units. Parsing, formatting, summation, and edit-form values avoid binary floating-point currency arithmetic.

## Explicit assumptions

1. **Currency:** The first account establishes the workspace currency. All later accounts and transfers must use that currency. FX conversion and multi-currency reporting are not implemented because the BRD leaves the rate source and historical-rate policy open.
2. **Balance signs:** Asset openings and balances are positive money owned; liability openings and balances are positive money owed. Income/refunds increase asset balances and reduce liabilities; expenses decrease assets and increase liabilities. Net tracked balance is assets minus liabilities.
3. **Manual/synced data:** All account creation in this increment is manual and labeled as an estimate. The model accepts synced accounts only with a freshness timestamp; no sync integration is implemented.
4. **Pending records:** Pending transactions remain visible in recent activity but are excluded from balances, cash flow, category spending, budgets, and goal progress until posted. The BRD asks the product to define this policy but does not select one.
5. **Refunds:** A refund offsets the linked expense's category; otherwise its own category is used. Only posted refunds in the selected period affect that period's cash flow and spending. Category/budget spend is floored at zero. Unlinked, uncategorized refunds affect account balance and net cash flow but not category spend.
6. **Budgets:** Budgets are monthly, with no rollover. A category-less budget covers categorized expense/refund movements for the selected month. Transfers and adjustments are excluded. Rollover and alert behavior are not implemented because the BRD leaves rollover rules open.
7. **Goals:** Progress comes only from posted transfers explicitly linked to a goal. Contributions add and withdrawals subtract; progress is floored at zero. Goal transfers are allocations, not expenses. Goal progress is lifetime-to-date in this increment.
8. **Transfers:** A transfer is stored as one canonical ledger record containing source and destination account IDs. The calculation layer derives both signed account movements from that record, so it is edited/deleted atomically and cannot drift into income or expense. This represents the BRD's linked two-leg transfer as one logical, non-duplicable source record.
9. **Recurring bills:** A schedule derives a due/overdue reminder from its next due date and amount. It does not create a transaction, mark payment, or advance the schedule automatically. Displayed amounts are forecasts.
10. **Dates and freshness:** Transaction dates are local calendar dates; the selected monthly period uses the browser's local calendar. Creation/update timestamps are UTC ISO strings. No user-configurable time-zone preference exists yet.
11. **Persistence/security:** IndexedDB is per browser profile and is not encrypted by this app. Authentication, multi-user authorization, backups, data export/deletion workflows, and secure bank integrations are outside this dashboard increment.

No sample financial records are seeded.