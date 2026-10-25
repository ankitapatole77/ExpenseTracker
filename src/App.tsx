import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarClock,
  ChartNoAxesColumnIncreasing,
  CircleHelp,
  CreditCard,
  Landmark,
  Plus,
  Pencil,
  ReceiptText,
  Target,
  Trash2,
  Wallet,
} from 'lucide-react'
import { EntryDialog, type EntryKind } from './finance/EntryDialog'
import { deleteTransaction, getDashboard, saveAccount, saveTransaction } from './finance/database'
import { getUpcomingBills } from './finance/calculations'
import { saveBudget, saveGoal, saveRecurringBill } from './finance/database'
import { formatMoney } from './finance/money'
import type {
  Account,
  Budget,
  LedgerTransaction,
  RecurringBill,
  ReportingPeriod,
  SavingsGoal,
} from './finance/model'
import './index.css'

function localDate(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function periodFor(month: string): ReportingPeriod {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(year, monthNumber, 0)
  return { startDate: `${month}-01`, endDate: localDate(lastDay) }
}

function monthInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function transactionIcon(kind: LedgerTransaction['kind']) {
  if (kind === 'income') return <ArrowDownLeft aria-hidden="true" />
  if (kind === 'expense') return <ArrowUpRight aria-hidden="true" />
  if (kind === 'transfer') return <ArrowLeftRight aria-hidden="true" />
  if (kind === 'refund') return <ReceiptText aria-hidden="true" />
  return <ChartNoAxesColumnIncreasing aria-hidden="true" />
}

function EntryButton({ children, onClick, quiet = false }: {
  children: string
  onClick: () => void
  quiet?: boolean
}) {
  return <button className={`button ${quiet ? 'button-quiet' : 'button-primary'}`} onClick={onClick} type="button"><Plus aria-hidden="true" size={16} />{children}</button>
}

function App() {
  const today = new Date()
  const [selectedMonth, setSelectedMonth] = useState(monthInputValue(today))
  const [activeForm, setActiveForm] = useState<EntryKind | null>(null)
  const [editingTransaction, setEditingTransaction] = useState<LedgerTransaction>()
  const [actionError, setActionError] = useState('')
  const period = periodFor(selectedMonth)
  const query = useLiveQuery(async () => {
    try {
      return { dashboard: await getDashboard(period) }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Your finance data could not be loaded.' }
    }
  }, [period.startDate, period.endDate])

  function openForm(kind: EntryKind, transaction?: LedgerTransaction) {
    setActionError('')
    setEditingTransaction(transaction)
    setActiveForm(kind)
  }

  async function saveEntry(kind: EntryKind, value: Account | LedgerTransaction | Budget | SavingsGoal | RecurringBill) {
    if (kind === 'account') await saveAccount(value as Account)
    if (kind === 'transaction') await saveTransaction(value as LedgerTransaction)
    if (kind === 'budget') await saveBudget(value as Budget)
    if (kind === 'goal') await saveGoal(value as SavingsGoal)
    if (kind === 'bill') await saveRecurringBill(value as RecurringBill)
    setActiveForm(null)
    setEditingTransaction(undefined)
  }

  async function removeTransaction(transaction: LedgerTransaction) {
    if (!window.confirm(`Delete “${transaction.description}”? Dashboard totals will update from the remaining ledger.`)) return
    try {
      await deleteTransaction(transaction.id)
      setActionError('')
    } catch {
      setActionError('This transaction could not be deleted. Please try again.')
    }
  }

  const dashboard = query?.dashboard
  const calculations = dashboard?.calculations
  const currency = dashboard?.accounts[0]?.currency ?? 'USD'
  const formatter = (amount: number) => formatMoney(amount, currency)
  const latestUpdate = dashboard
    ? [
      ...dashboard.accounts.map((item) => item.syncedAt ?? item.createdAt),
      ...dashboard.transactions.map((item) => item.updatedAt),
      ...dashboard.calculations.budgetProgress.map(({ budget }) => budget.createdAt),
      ...dashboard.calculations.goalProgress.map(({ goal }) => goal.createdAt),
      ...dashboard.recurringBills.map((item) => item.createdAt),
    ].sort().at(-1)
    : undefined
  const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
  const accountNames = new Map(dashboard?.accounts.map((account) => [account.id, account.name]) ?? [])
  const dueBills = dashboard ? getUpcomingBills(dashboard.recurringBills, localDate(today)) : []
  const maxCategory = Math.max(1, ...(calculations?.spendingByCategory.map((item) => item.spentMinorUnits) ?? []))

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <a aria-label="ExpenseTracker home" className="brand" href="#overview">
          <span className="brand-mark"><Wallet aria-hidden="true" size={20} /></span>
          <span>Expense<span className="brand-light">Tracker</span></span>
        </a>
        <p className="nav-caption">YOUR MONEY</p>
        <nav aria-label="Main navigation" className="main-nav">
          <a aria-current="page" className="nav-link active" href="#overview"><ChartNoAxesColumnIncreasing aria-hidden="true" size={18} />Overview</a>
          <a className="nav-link" href="#activity"><ReceiptText aria-hidden="true" size={18} />Activity</a>
          <a className="nav-link" href="#plans"><Target aria-hidden="true" size={18} />Plans</a>
          <a className="nav-link" href="#bills"><CalendarClock aria-hidden="true" size={18} />Bills</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note"><CircleHelp aria-hidden="true" size={17} /><span>Stored on this device</span></div>
          <p>Your manual account balances are estimates. No bank connection is active.</p>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="topbar-meta"><span>PERSONAL FINANCE</span><span className="topbar-divider" aria-hidden="true">/</span><span>OVERVIEW</span></div>
          <div className="topbar-actions">
            <label className="period-control"><span>Reporting period</span><input aria-label="Reporting period" max={monthInputValue(today)} onChange={(event) => setSelectedMonth(event.target.value)} type="month" value={selectedMonth} /></label>
            <EntryButton onClick={() => openForm('transaction')}>Add transaction</EntryButton>
          </div>
        </header>

        <div className="dashboard-content">
          <section aria-labelledby="page-title" className="page-heading">
            <div>
              <p className="eyebrow">A clearer picture, every day</p>
              <h1 id="page-title">Your overview</h1>
              <p className="page-subtitle">A live view of the accounts and activity you track.</p>
            </div>
            <div className="freshness" aria-live="polite">
              <span className="freshness-dot" aria-hidden="true" />
              <span>{dashboard?.accounts.some((account) => account.source === 'synced') ? 'Synced data' : 'Manual estimates'}</span>
              <span className="freshness-separator" aria-hidden="true">·</span>
              <span>{latestUpdate ? `Updated ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(latestUpdate))}` : 'No data yet'}</span>
            </div>
          </section>

          {query?.error && <div className="error-banner" role="alert"><strong>Dashboard unavailable.</strong> {query.error}</div>}
          {actionError && <div className="error-banner" role="alert">{actionError}</div>}
          {!dashboard && !query?.error && <div className="loading-state" aria-live="polite">Loading your financial snapshot…</div>}

          {dashboard && calculations && <>
            {dashboard.accounts.length === 0 && <section aria-labelledby="first-account-title" className="empty-onboarding">
              <div className="empty-icon"><Landmark aria-hidden="true" size={24} /></div>
              <div><p className="eyebrow">Start with one account</p><h2 id="first-account-title">Your money has a home here.</h2>
                <p>Add a tracked account and its opening balance. Then record a transaction to see your dashboard come to life.</p></div>
              <EntryButton onClick={() => openForm('account')}>Add first account</EntryButton>
            </section>}

            <section aria-label="Balance and cash flow" className="overview-grid">
              <div className="balance-panel">
                <div className="balance-heading"><span>NET TRACKED BALANCE</span><span className="estimate-badge">{dashboard.accounts.some((account) => account.source === 'synced') ? 'Synced + manual' : 'Estimate'}</span></div>
                <p className="balance-amount">{formatter(calculations.totalBalanceMinorUnits)}</p>
                <p className="balance-explanation">Assets minus liabilities across {dashboard.accounts.length} tracked {dashboard.accounts.length === 1 ? 'account' : 'accounts'}.</p>
                <div className="balance-detail"><span>Assets <strong>{formatter(calculations.assetsMinorUnits)}</strong></span><span>Liabilities <strong>{formatter(calculations.liabilitiesMinorUnits)}</strong></span></div>
              </div>

              <div className="cashflow-panel">
                <div className="section-heading compact-heading"><div><p className="eyebrow">{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(`${selectedMonth}-15T12:00:00`))}</p><h2>Cash flow</h2></div><span className="info-label" title="Posted income minus posted expenses, plus refunds. Transfers are excluded.">How it's calculated</span></div>
                <div className="cashflow-metrics">
                  <div><span className="metric-label">Income</span><strong className="metric-value">{formatter(calculations.incomeMinorUnits)}</strong></div>
                  <div><span className="metric-label">Expenses</span><strong className="metric-value">{formatter(calculations.expenseMinorUnits)}</strong></div>
                  <div><span className="metric-label">Refunds</span><strong className="metric-value">{formatter(calculations.refundMinorUnits)}</strong></div>
                  <div><span className="metric-label">Net cash flow</span><strong className="metric-value">{formatter(calculations.netCashFlowMinorUnits)}</strong></div>
                </div>
                <p className="cashflow-footnote">Net flow is income minus expenses plus refunds. Transfers are excluded.</p>
              </div>
            </section>

            <section aria-label="Accounts" className="account-strip">
              <div className="section-heading"><div><p className="eyebrow">Your money, accounted for</p><h2>Accounts</h2></div><EntryButton onClick={() => openForm('account')} quiet>Add account</EntryButton></div>
              {dashboard.accounts.length === 0 ? <p className="empty-inline">No accounts tracked yet. Add an account to calculate your total balance.</p> :
                <ul className="account-list">{calculations.accountBalances.map(({ account, balanceMinorUnits }) => <li className="account-item" key={account.id}>
                  <span className="account-icon">{account.kind === 'asset' ? <Wallet aria-hidden="true" /> : <CreditCard aria-hidden="true" />}</span>
                  <span className="account-name"><strong>{account.name}</strong><small>{account.kind === 'liability' ? 'Liability' : 'Asset'} · {account.source === 'manual' ? 'Estimate' : account.syncedAt ? `Synced ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(account.syncedAt))}` : 'Synced'}</small></span>
                  <strong className="account-balance">{formatter(balanceMinorUnits)}</strong>
                </li>)}</ul>}
            </section>

            <section aria-label="Spending and plans" className="insights-grid">
              <div className="dashboard-section spending-section">
                <div className="section-heading"><div><p className="eyebrow">Posted expenses less refunds</p><h2>Spending by category</h2></div></div>
                {calculations.spendingByCategory.length === 0 ? <p className="empty-inline">No categorized spending in this period. Add an expense with a category to see the breakdown.</p> :
                  <div className="table-scroll"><table className="category-table"><caption className="visually-hidden">Spending by category for the selected reporting period</caption><thead><tr><th scope="col">Category</th><th scope="col">Share</th><th scope="col">Amount</th></tr></thead><tbody>
                    {calculations.spendingByCategory.map(({ category, spentMinorUnits }) => <tr key={category}>
                      <th scope="row"><span className="category-name">{category}</span><span aria-hidden="true" className="category-meter"><span style={{ width: `${(spentMinorUnits / maxCategory) * 100}%` }} /></span></th>
                      <td>{calculations.expenseMinorUnits ? `${Math.round(spentMinorUnits / calculations.expenseMinorUnits * 100)}%` : '0%'}</td><td className="numeric-cell">{formatter(spentMinorUnits)}</td>
                    </tr>)}
                  </tbody></table></div>}
              </div>

              <div className="dashboard-section plans-section" id="plans">
                <div className="section-heading"><div><p className="eyebrow">A plan that fits your life</p><h2>Budgets & goals</h2></div>
                  <div className="heading-actions"><EntryButton onClick={() => openForm('budget')} quiet>Budget</EntryButton><EntryButton onClick={() => openForm('goal')} quiet>Goal</EntryButton></div>
                </div>
                {calculations.budgetProgress.length === 0 && calculations.goalProgress.length === 0 ? <p className="empty-inline">No budgets or goals yet. Add one to start tracking progress from your recorded activity.</p> : <div className="progress-list">
                  {calculations.budgetProgress.map(({ budget, spentMinorUnits, remainingMinorUnits, percentUsed }) => <div className="progress-item" key={budget.id}>
                    <div className="progress-topline"><strong>{budget.name}</strong><span>{formatter(spentMinorUnits)} of {formatter(budget.limitMinorUnits)}</span></div>
                    <progress aria-label={`${budget.name} budget, ${Math.round(percentUsed)} percent used`} max="100" value={Math.min(percentUsed, 100)} />
                    <p className="progress-caption">{remainingMinorUnits >= 0 ? `${formatter(remainingMinorUnits)} remaining` : `${formatter(Math.abs(remainingMinorUnits))} over limit`} · {budget.category ?? 'All categories'} · Transfers excluded</p>
                  </div>)}
                  {calculations.goalProgress.map(({ goal, savedMinorUnits, percentComplete }) => <div className="progress-item goal-item" key={goal.id}>
                    <div className="progress-topline"><strong>{goal.name}</strong><span>{formatter(savedMinorUnits)} of {formatter(goal.targetMinorUnits)}</span></div>
                    <progress aria-label={`${goal.name} savings goal, ${Math.round(percentComplete)} percent complete`} max="100" value={Math.min(percentComplete, 100)} />
                    <p className="progress-caption">{Math.round(percentComplete)}% of goal · Recorded contributions less withdrawals</p>
                  </div>)}
                </div>}
              </div>
            </section>

            <section aria-label="Bills and recent activity" className="activity-grid">
              <div className="dashboard-section bills-section" id="bills">
                <div className="section-heading"><div><p className="eyebrow">Next 30 days</p><h2>Upcoming bills</h2></div><EntryButton onClick={() => openForm('bill')} quiet>Add bill</EntryButton></div>
                {dueBills.length === 0 ? <p className="empty-inline">Nothing due in the next 30 days. Add a recurring bill to keep a reminder here.</p> : <ul className="bill-list">{dueBills.map(({ bill, status }) => <li className="bill-item" key={bill.id}>
                  <span className="bill-icon"><CalendarClock aria-hidden="true" /></span><span className="bill-name"><strong>{bill.name}</strong><small>{status === 'overdue' ? 'Overdue' : `Due ${dateFormatter.format(new Date(`${bill.nextDueDate}T12:00:00`))}`} · {bill.frequency}</small></span>
                  <span className="bill-amount"><strong>{formatter(bill.amountMinorUnits)}</strong><small>Forecast</small></span>
                </li>)}</ul>}
                <p className="forecast-note">Scheduled amounts are forecasts, not recorded payments.</p>
              </div>

              <div className="dashboard-section recent-section" id="activity">
                <div className="section-heading"><div><p className="eyebrow">Latest ledger entries</p><h2>Recent activity</h2></div><EntryButton onClick={() => openForm('transaction')} quiet>Add entry</EntryButton></div>
                {calculations.recentTransactions.length === 0 ? <p className="empty-inline">No transactions yet. Add a transaction to see income, spending, and account movements here.</p> : <div className="table-scroll"><table className="transactions-table"><caption className="visually-hidden">Recent ledger transactions</caption><thead><tr><th scope="col">Transaction</th><th scope="col">Account</th><th scope="col">Date</th><th scope="col">Amount</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead><tbody>
                  {calculations.recentTransactions.map((transaction) => {
                    const isPositive = transaction.kind === 'income' || transaction.kind === 'refund'
                    const accountLabel = transaction.kind === 'transfer' && transaction.toAccountId
                      ? `${accountNames.get(transaction.accountId) ?? 'Account'} to ${accountNames.get(transaction.toAccountId) ?? 'Account'}`
                      : accountNames.get(transaction.accountId) ?? 'Account'
                    const amountSign = isPositive
                      ? '+'
                      : transaction.kind === 'expense' || (transaction.kind === 'adjustment' && transaction.adjustmentDirection === 'decrease')
                        ? '-'
                        : transaction.kind === 'adjustment' ? '+' : ''
                    const amount = `${amountSign}${formatter(transaction.amountMinorUnits)}`
                    return <tr key={transaction.id}>
                      <td><span className="transaction-title"><span className={`transaction-kind kind-${transaction.kind}`}>{transactionIcon(transaction.kind)}</span><span><strong>{transaction.description}</strong><small>{transaction.category ?? transaction.kind}</small></span></span></td>
                      <td>{accountLabel}</td>
                      <td>{dateFormatter.format(new Date(`${transaction.date}T12:00:00`))}{transaction.status === 'pending' && <span className="status-badge">Pending</span>}</td>
                      <td className={`numeric-cell ${isPositive ? 'positive-value' : ''}`}>{amount}</td>
                      <td><span className="row-actions"><button aria-label={`Edit ${transaction.description}`} className="icon-button" onClick={() => openForm('transaction', transaction)} type="button"><Pencil aria-hidden="true" size={16} /></button><button aria-label={`Delete ${transaction.description}`} className="icon-button delete-button" onClick={() => void removeTransaction(transaction)} type="button"><Trash2 aria-hidden="true" size={16} /></button></span></td>
                    </tr>
                  })}
                </tbody></table></div>}
              </div>
            </section>

            <footer className="dashboard-footer">
              <span>{selectedMonth} · {currency}</span>
              <span>{dashboard.transactions.filter((transaction) => transaction.status === 'pending').length} pending {dashboard.transactions.filter((transaction) => transaction.status === 'pending').length === 1 ? 'item' : 'items'} excluded from posted totals</span>
              <span>All figures derive from account openings and ledger records.</span>
            </footer>
          </>}
        </div>
      </main>

      {activeForm && dashboard && <EntryDialog
        accounts={dashboard.accounts}
        editingTransaction={editingTransaction}
        goals={dashboard.calculations.goalProgress.map(({ goal }) => goal)}
        kind={activeForm}
        onClose={() => { setActiveForm(null); setEditingTransaction(undefined) }}
        onSave={saveEntry}
        transactions={dashboard.transactions}
      />}
    </div>
  )
}

export default App