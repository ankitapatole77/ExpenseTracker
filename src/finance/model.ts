export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR'
export type AccountKind = 'asset' | 'liability'
export type TransactionKind = 'income' | 'expense' | 'transfer' | 'refund' | 'adjustment'
export type TransactionStatus = 'posted' | 'pending'

export interface Account {
  id: string
  name: string
  kind: AccountKind
  currency: CurrencyCode
  openingBalanceMinorUnits: number
  source: 'manual' | 'synced'
  syncedAt?: string
  createdAt: string
}

export interface LedgerTransaction {
  id: string
  accountId: string
  toAccountId?: string
  kind: TransactionKind
  amountMinorUnits: number
  date: string
  status: TransactionStatus
  category?: string
  merchant?: string
  description: string
  linkedTransactionId?: string
  goalId?: string
  goalFlow?: 'contribution' | 'withdrawal'
  adjustmentDirection?: 'increase' | 'decrease'
  createdAt: string
  updatedAt: string
}

export interface Budget {
  id: string
  name: string
  category?: string
  limitMinorUnits: number
  createdAt: string
}

export interface SavingsGoal {
  id: string
  name: string
  targetMinorUnits: number
  targetDate?: string
  createdAt: string
}

export interface RecurringBill {
  id: string
  name: string
  amountMinorUnits: number
  category?: string
  frequency: 'weekly' | 'monthly' | 'yearly'
  nextDueDate: string
  status: 'active' | 'paused'
  createdAt: string
}

export interface ReportingPeriod {
  startDate: string
  endDate: string
}