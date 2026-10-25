import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calculateDashboard, getUpcomingBills } from './calculations'
import { deleteTransaction, financeDb, getDashboard, saveAccount, saveRecurringBill, saveTransaction } from './database'
import { formatMoney, parseMoney } from './money'
import type { Account, LedgerTransaction, ReportingPeriod } from './model'

const period: ReportingPeriod = { startDate: '2026-04-01', endDate: '2026-04-30' }
const now = '2026-04-10T12:00:00.000Z'

function account(id: string, openingBalanceMinorUnits = 0, kind: Account['kind'] = 'asset'): Account {
  return {
    id,
    name: id,
    kind,
    currency: 'USD',
    openingBalanceMinorUnits,
    source: 'manual',
    createdAt: now,
  }
}

function transaction(
  id: string,
  kind: LedgerTransaction['kind'],
  amountMinorUnits: number,
  overrides: Partial<LedgerTransaction> = {},
): LedgerTransaction {
  return {
    id,
    accountId: 'checking',
    kind,
    amountMinorUnits,
    date: '2026-04-10',
    status: 'posted',
    description: id,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

beforeEach(async () => {
  await financeDb.open()
})

afterEach(async () => {
  await financeDb.delete()
})

describe('decimal-safe money', () => {
  it('parses and adds decimal values as exact minor units', () => {
    expect(parseMoney('0.10') + parseMoney('0.20')).toBe(30)
    expect(parseMoney('-12.3')).toBe(-1230)
  })

  it('rejects excess precision and formats large balances without float arithmetic', () => {
    expect(() => parseMoney('1.005')).toThrow()
    expect(formatMoney(1234567890123, 'USD')).toContain('12,345,678,901.23')
  })
})

describe('dashboard reconciliation', () => {
  it('adds signed posted movements to opening balances', () => {
    const result = calculateDashboard(
      [account('checking', 100_000)],
      [transaction('pay', 'income', 25_000), transaction('rent', 'expense', 90_000)],
      [],
      [],
      period,
    )

    expect(result.accountBalances[0].balanceMinorUnits).toBe(35_000)
  })

  it('excludes a linked transfer from income and expenses while reconciling both accounts', () => {
    const result = calculateDashboard(
      [account('checking', 100_000), account('savings', 20_000)],
      [transaction('move', 'transfer', 30_000, { toAccountId: 'savings' })],
      [],
      [],
      period,
    )

    expect(result.accountBalances.map(({ balanceMinorUnits }) => balanceMinorUnits)).toEqual([70_000, 50_000])
    expect(result.incomeMinorUnits).toBe(0)
    expect(result.expenseMinorUnits).toBe(0)
    expect(result.netCashFlowMinorUnits).toBe(0)
    expect(result.totalBalanceMinorUnits).toBe(120_000)
  })

  it('reduces category spending and budget progress for linked or categorized refunds', () => {
    const result = calculateDashboard(
      [account('checking')],
      [
        transaction('purchase', 'expense', 10_000, { category: 'Dining' }),
        transaction('return', 'refund', 2_500, { linkedTransactionId: 'purchase' }),
      ],
      [{ id: 'dining', name: 'Dining', category: 'Dining', limitMinorUnits: 8_000, createdAt: now }],
      [],
      period,
    )

    expect(result.spendingByCategory).toEqual([{ category: 'Dining', spentMinorUnits: 7_500 }])
    expect(result.budgetProgress[0].spentMinorUnits).toBe(7_500)
    expect(result.refundMinorUnits).toBe(2_500)
    expect(result.netCashFlowMinorUnits).toBe(-7_500)
  })

  it('uses a linked prior-period expense to classify a later refund', () => {
    const result = calculateDashboard(
      [account('checking')],
      [
        transaction('purchase', 'expense', 10_000, { category: 'Travel', date: '2026-03-28' }),
        transaction('return', 'refund', 2_500, { linkedTransactionId: 'purchase', date: '2026-04-10' }),
      ],
      [{ id: 'travel', name: 'Travel', category: 'Travel', limitMinorUnits: 8_000, createdAt: now }],
      [],
      period,
    )

    expect(result.spendingByCategory).toEqual([])
    expect(result.budgetProgress[0].spentMinorUnits).toBe(0)
    expect(result.refundMinorUnits).toBe(2_500)
    expect(result.netCashFlowMinorUnits).toBe(2_500)
  })

  it('ignores pending records in balances and period totals', () => {
    const result = calculateDashboard(
      [account('checking', 10_000)],
      [transaction('pending', 'expense', 4_000, { status: 'pending' })],
      [],
      [],
      period,
    )

    expect(result.accountBalances[0].balanceMinorUnits).toBe(10_000)
    expect(result.expenseMinorUnits).toBe(0)
    expect(result.recentTransactions[0].status).toBe('pending')
  })

  it('treats goal transfers as allocations, not expenses, and subtracts withdrawals', () => {
    const result = calculateDashboard(
      [account('checking', 50_000), account('savings')],
      [
        transaction('save', 'transfer', 10_000, {
          toAccountId: 'savings',
          goalId: 'trip',
          goalFlow: 'contribution',
        }),
        transaction('withdraw', 'transfer', 2_000, {
          accountId: 'savings',
          toAccountId: 'checking',
          goalId: 'trip',
          goalFlow: 'withdrawal',
        }),
      ],
      [],
      [{ id: 'trip', name: 'Trip', targetMinorUnits: 20_000, createdAt: now }],
      period,
    )

    expect(result.goalProgress[0].savedMinorUnits).toBe(8_000)
    expect(result.expenseMinorUnits).toBe(0)
  })

  it('recomputes balances, budgets, and goal progress after transaction create, edit, and delete', async () => {
    const checking = account('checking', 50_000)
    const savings = account('savings')
    const goal = { id: 'reserve', name: 'Reserve', targetMinorUnits: 40_000, createdAt: now }
    await saveAccount(checking)
    await saveAccount(savings)
    await financeDb.goals.put(goal)
    await financeDb.budgets.put({
      id: 'food',
      name: 'Food',
      category: 'Food',
      limitMinorUnits: 20_000,
      createdAt: now,
    })

    const transfer = transaction('ledger-entry', 'transfer', 10_000, {
      toAccountId: 'savings',
      goalId: 'reserve',
      goalFlow: 'contribution',
    })
    await saveTransaction(transfer)
    expect((await getDashboard(period)).calculations.goalProgress[0].savedMinorUnits).toBe(10_000)

    await saveTransaction({
      ...transfer,
      kind: 'expense',
      toAccountId: undefined,
      goalId: undefined,
      goalFlow: undefined,
      amountMinorUnits: 3_000,
      category: 'Food',
      updatedAt: '2026-04-11T12:00:00.000Z',
    })
    const edited = await getDashboard(period)
    expect(edited.calculations.accountBalances[0].balanceMinorUnits).toBe(47_000)
    expect(edited.calculations.budgetProgress[0].spentMinorUnits).toBe(3_000)
    expect(edited.calculations.goalProgress[0].savedMinorUnits).toBe(0)

    await deleteTransaction('ledger-entry')
    const deleted = await getDashboard(period)
    expect(deleted.calculations.accountBalances[0].balanceMinorUnits).toBe(50_000)
    expect(deleted.calculations.budgetProgress[0].spentMinorUnits).toBe(0)
  })

  it('applies liability sign conventions and totals assets less liabilities', () => {
    const result = calculateDashboard(
      [account('cash', 80_000), account('card', 15_000, 'liability')],
      [transaction('card-purchase', 'expense', 2_000, { accountId: 'card' })],
      [],
      [],
      period,
    )

    expect(result.accountBalances[1].balanceMinorUnits).toBe(17_000)
    expect(result.totalBalanceMinorUnits).toBe(63_000)
  })

  it('shows a recurring schedule as due without creating a paid transaction', async () => {
    await saveRecurringBill({
      id: 'internet',
      name: 'Internet service',
      amountMinorUnits: 6_500,
      frequency: 'monthly',
      nextDueDate: '2026-04-20',
      status: 'active',
      createdAt: now,
    })

    const dashboard = await getDashboard(period)
    const dueItems = getUpcomingBills(dashboard.recurringBills, '2026-04-10')
    expect(dueItems).toHaveLength(1)
    expect(dueItems[0].status).toBe('upcoming')
    expect(dashboard.transactions).toEqual([])
  })
})