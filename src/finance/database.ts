import Dexie, { type Table } from 'dexie'
import { calculateDashboard } from './calculations'
import type {
  Account,
  Budget,
  LedgerTransaction,
  RecurringBill,
  ReportingPeriod,
  SavingsGoal,
} from './model'

class ExpenseTrackerDatabase extends Dexie {
  accounts!: Table<Account, string>
  transactions!: Table<LedgerTransaction, string>
  budgets!: Table<Budget, string>
  goals!: Table<SavingsGoal, string>
  recurringBills!: Table<RecurringBill, string>

  constructor() {
    super('ExpenseTracker')
    this.version(1).stores({
      accounts: '&id',
      transactions: '&id, date, status, accountId, kind, category, goalId',
      budgets: '&id, category',
      goals: '&id',
      recurringBills: '&id, nextDueDate, status',
    })
  }
}

export const financeDb = new ExpenseTrackerDatabase()

export async function saveAccount(account: Account): Promise<void> {
  if (!Number.isSafeInteger(account.openingBalanceMinorUnits)) {
    throw new Error('Opening balances must use safe integer minor units.')
  }
  if (account.source === 'synced' && !account.syncedAt) {
    throw new Error('Synced account balances require a freshness timestamp.')
  }
  await financeDb.transaction('rw', financeDb.accounts, async () => {
    const otherAccount = await financeDb.accounts.filter((item) => item.id !== account.id).first()
    if (otherAccount && otherAccount.currency !== account.currency) {
      throw new Error('All tracked accounts must use the same currency until currency conversion is supported.')
    }
    await financeDb.accounts.put(account)
  })
}

export async function saveTransaction(transaction: LedgerTransaction): Promise<void> {
  if (!Number.isSafeInteger(transaction.amountMinorUnits) || transaction.amountMinorUnits <= 0) {
    throw new Error('Transaction amounts must be positive, safe integer minor units.')
  }
  if (transaction.kind === 'transfer' && (!transaction.toAccountId || transaction.toAccountId === transaction.accountId)) {
    throw new Error('A transfer must move money between two different owned accounts.')
  }
  if (transaction.kind !== 'transfer' && transaction.toAccountId) {
    throw new Error('Only transfers can have a destination account.')
  }
  if (transaction.kind === 'adjustment' && !transaction.adjustmentDirection) {
    throw new Error('Choose whether the adjustment increases or decreases the balance.')
  }
  if (transaction.goalId && (transaction.kind !== 'transfer' || !transaction.goalFlow)) {
    throw new Error('Goal contributions and withdrawals must be recorded as transfers.')
  }

  await financeDb.transaction('rw', [financeDb.accounts, financeDb.goals, financeDb.transactions], async () => {
    const source = await financeDb.accounts.get(transaction.accountId)
    const destination = transaction.toAccountId
      ? await financeDb.accounts.get(transaction.toAccountId)
      : undefined
    if (!source || (transaction.toAccountId && !destination)) {
      throw new Error('Choose existing accounts for this transaction.')
    }
    if (destination && destination.currency !== source.currency) {
      throw new Error('Transfers require accounts with the same currency.')
    }
    if (transaction.goalId && !(await financeDb.goals.get(transaction.goalId))) {
      throw new Error('Choose an existing savings goal.')
    }
    await financeDb.transactions.put(transaction)
  })
}

export async function deleteTransaction(id: string): Promise<void> {
  await financeDb.transactions.delete(id)
}

export async function saveBudget(budget: Budget): Promise<void> {
  if (!Number.isSafeInteger(budget.limitMinorUnits) || budget.limitMinorUnits <= 0) {
    throw new Error('Budget limits must be positive safe integer minor units.')
  }
  await financeDb.budgets.put(budget)
}

export async function saveGoal(goal: SavingsGoal): Promise<void> {
  if (!Number.isSafeInteger(goal.targetMinorUnits) || goal.targetMinorUnits <= 0) {
    throw new Error('Goal targets must be positive safe integer minor units.')
  }
  await financeDb.goals.put(goal)
}

export async function saveRecurringBill(bill: RecurringBill): Promise<void> {
  if (!Number.isSafeInteger(bill.amountMinorUnits) || bill.amountMinorUnits <= 0) {
    throw new Error('Bill amounts must be positive safe integer minor units.')
  }
  await financeDb.recurringBills.put(bill)
}

export async function getDashboard(period: ReportingPeriod) {
  const [accounts, transactions, budgets, goals, recurringBills] = await Promise.all([
    financeDb.accounts.toArray(),
    financeDb.transactions.toArray(),
    financeDb.budgets.toArray(),
    financeDb.goals.toArray(),
    financeDb.recurringBills.toArray(),
  ])

  return {
    accounts,
    transactions,
    recurringBills,
    calculations: calculateDashboard(accounts, transactions, budgets, goals, period),
  }
}