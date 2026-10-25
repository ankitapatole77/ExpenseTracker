import type {
  Account,
  Budget,
  LedgerTransaction,
  RecurringBill,
  ReportingPeriod,
  SavingsGoal,
} from './model'

export interface AccountBalance {
  account: Account
  balanceMinorUnits: number
}

export interface BudgetProgress {
  budget: Budget
  spentMinorUnits: number
  remainingMinorUnits: number
  percentUsed: number
}

export interface GoalProgress {
  goal: SavingsGoal
  savedMinorUnits: number
  percentComplete: number
}

export interface CategorySpend {
  category: string
  spentMinorUnits: number
}

export interface DashboardCalculations {
  period: ReportingPeriod
  accountBalances: AccountBalance[]
  assetsMinorUnits: number
  liabilitiesMinorUnits: number
  totalBalanceMinorUnits: number
  incomeMinorUnits: number
  expenseMinorUnits: number
  refundMinorUnits: number
  netCashFlowMinorUnits: number
  spendingByCategory: CategorySpend[]
  budgetProgress: BudgetProgress[]
  goalProgress: GoalProgress[]
  recentTransactions: LedgerTransaction[]
}

export interface DueBill {
  bill: RecurringBill
  status: 'overdue' | 'upcoming'
}

function add(left: number, right: number): number {
  const result = left + right
  if (!Number.isSafeInteger(result)) throw new Error('Money total exceeds the safe integer range.')
  return result
}

function isInPeriod(transaction: LedgerTransaction, period: ReportingPeriod): boolean {
  return transaction.date >= period.startDate && transaction.date <= period.endDate
}

function movementForAccount(transaction: LedgerTransaction, account: Account): number {
  const isLiability = account.kind === 'liability'

  if (transaction.kind === 'transfer') {
    if (transaction.accountId === account.id) {
      return isLiability ? transaction.amountMinorUnits : -transaction.amountMinorUnits
    }
    if (transaction.toAccountId === account.id) {
      return isLiability ? -transaction.amountMinorUnits : transaction.amountMinorUnits
    }
    return 0
  }

  if (transaction.accountId !== account.id) return 0

  switch (transaction.kind) {
    case 'income':
    case 'refund':
      return isLiability ? -transaction.amountMinorUnits : transaction.amountMinorUnits
    case 'expense':
      return isLiability ? transaction.amountMinorUnits : -transaction.amountMinorUnits
    case 'adjustment':
      return transaction.adjustmentDirection === 'decrease'
        ? -transaction.amountMinorUnits
        : transaction.amountMinorUnits
  }
}

function refundCategory(
  refund: LedgerTransaction,
  transactionsById: Map<string, LedgerTransaction>,
): string | undefined {
  if (refund.linkedTransactionId) {
    return transactionsById.get(refund.linkedTransactionId)?.category ?? refund.category
  }
  return refund.category
}

function categorySpend(
  transactions: LedgerTransaction[],
  allTransactions: LedgerTransaction[],
): Map<string, number> {
  const byId = new Map(allTransactions.map((transaction) => [transaction.id, transaction]))
  const totals = new Map<string, number>()

  for (const transaction of transactions) {
    if (transaction.status !== 'posted') continue
    const category = transaction.kind === 'refund'
      ? refundCategory(transaction, byId)
      : transaction.category
    if (!category) continue
    if (transaction.kind === 'expense') {
      totals.set(category, add(totals.get(category) ?? 0, transaction.amountMinorUnits))
    } else if (transaction.kind === 'refund') {
      totals.set(category, add(totals.get(category) ?? 0, -transaction.amountMinorUnits))
    }
  }

  return totals
}

export function calculateDashboard(
  accounts: Account[],
  transactions: LedgerTransaction[],
  budgets: Budget[],
  goals: SavingsGoal[],
  period: ReportingPeriod,
): DashboardCalculations {
  const posted = transactions.filter((transaction) => transaction.status === 'posted')
  const periodTransactions = posted.filter((transaction) => isInPeriod(transaction, period))
  const accountBalances = accounts.map((account) => ({
    account,
    balanceMinorUnits: posted.reduce(
      (balance, transaction) => add(balance, movementForAccount(transaction, account)),
      account.openingBalanceMinorUnits,
    ),
  }))
  const assetsMinorUnits = accountBalances
    .filter(({ account }) => account.kind === 'asset')
    .reduce((total, { balanceMinorUnits }) => add(total, balanceMinorUnits), 0)
  const liabilitiesMinorUnits = accountBalances
    .filter(({ account }) => account.kind === 'liability')
    .reduce((total, { balanceMinorUnits }) => add(total, balanceMinorUnits), 0)
  const incomeMinorUnits = periodTransactions
    .filter(({ kind }) => kind === 'income')
    .reduce((total, transaction) => add(total, transaction.amountMinorUnits), 0)
  const expenseMinorUnits = periodTransactions
    .filter(({ kind }) => kind === 'expense')
    .reduce((total, transaction) => add(total, transaction.amountMinorUnits), 0)
  const refundMinorUnits = periodTransactions
    .filter(({ kind }) => kind === 'refund')
    .reduce((total, transaction) => add(total, transaction.amountMinorUnits), 0)
  const periodSpending = categorySpend(periodTransactions, posted)
  const spendingByCategory = [...periodSpending]
    .map(([category, amount]) => ({ category, spentMinorUnits: Math.max(0, amount) }))
    .filter(({ spentMinorUnits }) => spentMinorUnits > 0)
    .sort((left, right) => right.spentMinorUnits - left.spentMinorUnits)

  const budgetProgress = budgets.map((budget) => {
    const matchingSpend = budget.category
      ? periodSpending.get(budget.category) ?? 0
      : [...periodSpending.values()].reduce((total, amount) => add(total, amount), 0)
    const spentMinorUnits = Math.max(0, matchingSpend)
    return {
      budget,
      spentMinorUnits,
      remainingMinorUnits: budget.limitMinorUnits - spentMinorUnits,
      percentUsed: budget.limitMinorUnits === 0
        ? (spentMinorUnits > 0 ? 100 : 0)
        : (spentMinorUnits / budget.limitMinorUnits) * 100,
    }
  })

  const goalProgress = goals.map((goal) => {
    const movement = posted
      .filter((transaction) => transaction.goalId === goal.id && transaction.goalFlow)
      .reduce((total, transaction) => add(
        total,
        transaction.goalFlow === 'withdrawal'
          ? -transaction.amountMinorUnits
          : transaction.amountMinorUnits,
      ), 0)
    const savedMinorUnits = Math.max(0, movement)
    return {
      goal,
      savedMinorUnits,
      percentComplete: goal.targetMinorUnits === 0
        ? (savedMinorUnits > 0 ? 100 : 0)
        : (savedMinorUnits / goal.targetMinorUnits) * 100,
    }
  })

  return {
    period,
    accountBalances,
    assetsMinorUnits,
    liabilitiesMinorUnits,
    totalBalanceMinorUnits: assetsMinorUnits - liabilitiesMinorUnits,
    incomeMinorUnits,
    expenseMinorUnits,
    refundMinorUnits,
    netCashFlowMinorUnits: incomeMinorUnits - expenseMinorUnits + refundMinorUnits,
    spendingByCategory,
    budgetProgress,
    goalProgress,
    recentTransactions: [...transactions]
      .sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt))
      .slice(0, 8),
  }
}

export function getUpcomingBills(
  bills: RecurringBill[],
  today: string,
  daysAhead = 30,
): DueBill[] {
  const endDate = new Date(`${today}T00:00:00`)
  endDate.setDate(endDate.getDate() + daysAhead)
  const end = [endDate.getFullYear(), String(endDate.getMonth() + 1).padStart(2, '0'), String(endDate.getDate()).padStart(2, '0')].join('-')

  return bills
    .filter((bill) => bill.status === 'active' && (bill.nextDueDate < today || bill.nextDueDate <= end))
    .map((bill) => ({
      bill,
      status: bill.nextDueDate < today ? 'overdue' as const : 'upcoming' as const,
    }))
    .sort((left, right) => left.bill.nextDueDate.localeCompare(right.bill.nextDueDate))
}