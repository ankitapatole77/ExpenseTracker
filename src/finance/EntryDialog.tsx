import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type {
  Account,
  Budget,
  CurrencyCode,
  LedgerTransaction,
  RecurringBill,
  SavingsGoal,
} from './model'
import { parseMoney, toMoneyInput } from './money'

export type EntryKind = 'account' | 'transaction' | 'budget' | 'goal' | 'bill'
type EntryValue = Account | LedgerTransaction | Budget | SavingsGoal | RecurringBill

interface EntryDialogProps {
  kind: EntryKind
  accounts: Account[]
  goals: SavingsGoal[]
  transactions: LedgerTransaction[]
  editingTransaction?: LedgerTransaction
  onClose: () => void
  onSave: (kind: EntryKind, value: EntryValue) => Promise<void>
}

const today = () => {
  const date = new Date()
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}
const now = () => new Date().toISOString()
const identifier = () => crypto.randomUUID()

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return <label className="field"><span>{label}</span>{children}</label>
}

export function EntryDialog({
  kind,
  accounts,
  goals,
  transactions,
  editingTransaction,
  onClose,
  onSave,
}: EntryDialogProps) {
  const [error, setError] = useState('')
  const [transactionKind, setTransactionKind] = useState<LedgerTransaction['kind']>(editingTransaction?.kind ?? 'expense')
  const [selectedGoalId, setSelectedGoalId] = useState(editingTransaction?.goalId ?? '')
  const [selectedCategory, setSelectedCategory] = useState(editingTransaction?.category ?? '')
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('.entry-form input, .entry-form select')?.focus()
  }, [])

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const controls = [...dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]',
    )]
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const fields = new FormData(event.currentTarget)
    const value = (name: string) => String(fields.get(name) ?? '').trim()

    try {
      const timestamp = now()
      if (kind === 'account') {
        const account: Account = {
          id: identifier(),
          name: value('name'),
          kind: value('kind') as Account['kind'],
          currency: value('currency') as CurrencyCode,
          openingBalanceMinorUnits: parseMoney(value('amount')),
          source: 'manual',
          createdAt: timestamp,
        }
        await onSave(kind, account)
        return
      }

      if (kind === 'transaction') {
        const selectedKind = value('kind') as LedgerTransaction['kind']
        const transaction: LedgerTransaction = {
          id: editingTransaction?.id ?? identifier(),
          accountId: value('accountId'),
          toAccountId: selectedKind === 'transfer' ? value('toAccountId') : undefined,
          kind: selectedKind,
          amountMinorUnits: parseMoney(value('amount')),
          date: value('date'),
          status: value('status') as LedgerTransaction['status'],
          category: selectedCategory || undefined,
          merchant: value('merchant') || undefined,
          description: value('description'),
          linkedTransactionId: selectedKind === 'refund' ? value('linkedTransactionId') || undefined : undefined,
          goalId: selectedKind === 'transfer' && selectedGoalId ? selectedGoalId : undefined,
          goalFlow: selectedKind === 'transfer' && selectedGoalId
            ? value('goalFlow') as LedgerTransaction['goalFlow']
            : undefined,
          adjustmentDirection: selectedKind === 'adjustment'
            ? value('adjustmentDirection') as LedgerTransaction['adjustmentDirection']
            : undefined,
          createdAt: editingTransaction?.createdAt ?? timestamp,
          updatedAt: timestamp,
        }
        await onSave(kind, transaction)
        return
      }

      if (kind === 'budget') {
        const budget: Budget = {
          id: identifier(),
          name: value('name'),
          category: value('category') || undefined,
          limitMinorUnits: parseMoney(value('amount')),
          createdAt: timestamp,
        }
        await onSave(kind, budget)
        return
      }

      if (kind === 'goal') {
        const goal: SavingsGoal = {
          id: identifier(),
          name: value('name'),
          targetMinorUnits: parseMoney(value('amount')),
          targetDate: value('date') || undefined,
          createdAt: timestamp,
        }
        await onSave(kind, goal)
        return
      }

      const bill: RecurringBill = {
        id: identifier(),
        name: value('name'),
        amountMinorUnits: parseMoney(value('amount')),
        category: value('category') || undefined,
        frequency: value('frequency') as RecurringBill['frequency'],
        nextDueDate: value('date'),
        status: 'active',
        createdAt: timestamp,
      }
      await onSave(kind, bill)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This entry could not be saved.')
    }
  }

  const titles: Record<EntryKind, string> = {
    account: 'Add an account',
    transaction: editingTransaction ? 'Edit transaction' : 'Add a transaction',
    budget: 'Set a monthly budget',
    goal: 'Create a savings goal',
    bill: 'Add a recurring bill',
  }
  const fallbackCurrency = accounts[0]?.currency ?? 'USD'

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        aria-labelledby="entry-dialog-title"
        aria-modal="true"
        className="entry-dialog"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">ExpenseTracker</p>
            <h2 id="entry-dialog-title">{titles[kind]}</h2>
          </div>
          <button aria-label="Close dialog" className="icon-button" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button>
        </div>

        <form className="entry-form" onSubmit={submit}>
          {kind === 'account' && <>
            <Field label="Account name"><input autoFocus maxLength={60} name="name" placeholder="Everyday account" required /></Field>
            <div className="field-row">
              <Field label="Account type">
                <select name="kind"><option value="asset">Asset</option><option value="liability">Liability</option></select>
              </Field>
              <Field label="Currency">
                <select defaultValue={fallbackCurrency} name="currency">
                  <option value="USD">USD · US dollar</option><option value="EUR">EUR · Euro</option>
                  <option value="GBP">GBP · Pound sterling</option><option value="INR">INR · Indian rupee</option>
                </select>
              </Field>
            </div>
            <Field label="Opening balance"><input inputMode="decimal" name="amount" placeholder="0.00" required /></Field>
            <p className="form-note">Manual balances are estimates. For liability accounts, enter the amount owed.</p>
          </>}

          {kind === 'transaction' && <>
            <Field label="Transaction type">
              <select name="kind" onChange={(event) => setTransactionKind(event.target.value as LedgerTransaction['kind'])} value={transactionKind}>
                <option value="expense">Expense</option><option value="income">Income</option>
                <option value="transfer">Transfer</option><option value="refund">Refund</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </Field>
            <Field label="Amount"><input autoFocus={!editingTransaction} defaultValue={editingTransaction ? toMoneyInput(editingTransaction.amountMinorUnits) : ''} inputMode="decimal" name="amount" placeholder="0.00" required /></Field>
            <Field label={transactionKind === 'transfer' ? 'From account' : 'Account'}>
              <select defaultValue={editingTransaction?.accountId ?? accounts[0]?.id} name="accountId" required>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </Field>
            {transactionKind === 'transfer' && <>
              <Field label="To account">
                <select defaultValue={editingTransaction?.toAccountId ?? ''} name="toAccountId" required>
                  <option value="" disabled>Select account</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </Field>
              <Field label="Savings goal allocation (optional)">
                <select onChange={(event) => setSelectedGoalId(event.target.value)} value={selectedGoalId}>
                  <option value="">Not linked to a goal</option>
                  {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
                </select>
              </Field>
              {selectedGoalId && <Field label="Goal movement">
                <select defaultValue={editingTransaction?.goalFlow ?? 'contribution'} name="goalFlow">
                  <option value="contribution">Contribution</option><option value="withdrawal">Withdrawal</option>
                </select>
              </Field>}
            </>}
            {(transactionKind === 'expense' || transactionKind === 'refund') && <Field label="Category">
              <input list="transaction-categories" onChange={(event) => setSelectedCategory(event.target.value)} required={transactionKind === 'expense'} value={selectedCategory} />
              <datalist id="transaction-categories">
                {['Housing', 'Food', 'Transport', 'Health', 'Shopping', 'Utilities', 'Other'].map((category) => <option key={category} value={category} />)}
              </datalist>
            </Field>}
            {transactionKind === 'refund' && <Field label="Refund for (optional)">
              <select defaultValue={editingTransaction?.linkedTransactionId ?? ''} name="linkedTransactionId">
                <option value="">Use selected category</option>
                {transactions.filter((transaction) => transaction.kind === 'expense').map((transaction) => (
                  <option key={transaction.id} value={transaction.id}>{transaction.description} · {transaction.date}</option>
                ))}
              </select>
            </Field>}
            {transactionKind === 'adjustment' && <Field label="Balance effect">
              <select defaultValue={editingTransaction?.adjustmentDirection ?? 'increase'} name="adjustmentDirection">
                <option value="increase">Increase balance</option><option value="decrease">Decrease balance</option>
              </select>
            </Field>}
            <div className="field-row">
              <Field label="Date"><input defaultValue={editingTransaction?.date ?? today()} name="date" required type="date" /></Field>
              <Field label="Status"><select defaultValue={editingTransaction?.status ?? 'posted'} name="status"><option value="posted">Posted</option><option value="pending">Pending</option></select></Field>
            </div>
            <Field label="Description"><input defaultValue={editingTransaction?.description ?? ''} maxLength={100} name="description" placeholder="What was this for?" required /></Field>
            <Field label="Merchant (optional)"><input defaultValue={editingTransaction?.merchant ?? ''} maxLength={80} name="merchant" /></Field>
            <p className="form-note">Transfers stay out of income and spending. Pending items are shown separately and not included in posted balances.</p>
          </>}

          {kind === 'budget' && <>
            <Field label="Budget name"><input autoFocus maxLength={60} name="name" placeholder="Monthly food" required /></Field>
            <Field label="Category (leave blank for all categories)"><input list="budget-categories" name="category" />
              <datalist id="budget-categories">{['Housing', 'Food', 'Transport', 'Health', 'Shopping', 'Utilities', 'Other'].map((category) => <option key={category} value={category} />)}</datalist>
            </Field>
            <Field label={`Monthly limit (${fallbackCurrency})`}><input inputMode="decimal" min="0.01" name="amount" placeholder="0.00" required /></Field>
            <p className="form-note">Spending excludes transfers. Categorized refunds reduce the matching category's spend.</p>
          </>}

          {kind === 'goal' && <>
            <Field label="Goal name"><input autoFocus maxLength={60} name="name" placeholder="Rainy day fund" required /></Field>
            <Field label={`Target amount (${fallbackCurrency})`}><input inputMode="decimal" min="0.01" name="amount" placeholder="0.00" required /></Field>
            <Field label="Target date (optional)"><input name="date" type="date" /></Field>
            <p className="form-note">Progress comes from transfers explicitly linked to this goal.</p>
          </>}

          {kind === 'bill' && <>
            <Field label="Bill or subscription"><input autoFocus maxLength={60} name="name" placeholder="Internet service" required /></Field>
            <Field label={`Expected amount (${fallbackCurrency})`}><input inputMode="decimal" min="0.01" name="amount" placeholder="0.00" required /></Field>
            <div className="field-row">
              <Field label="Frequency"><select name="frequency"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="yearly">Yearly</option></select></Field>
              <Field label="Next due"><input defaultValue={today()} name="date" required type="date" /></Field>
            </div>
            <Field label="Category (optional)"><input name="category" /></Field>
            <p className="form-note">This schedule creates a due reminder only. It does not record a payment.</p>
          </>}

          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button className="button button-quiet" onClick={onClose} type="button">Cancel</button>
            <button className="button button-primary" type="submit">{editingTransaction ? 'Save changes' : 'Save entry'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}