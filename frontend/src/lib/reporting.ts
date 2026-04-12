import type { Category, ReportingRule, StoredTransaction } from "@/lib/types"

export const REPORTING_RULE_OPTIONS: Array<{
    value: ReportingRule
    label: string
    description: string
}> = [
        {
            value: "default",
            label: "Default sign-based",
            description: "Standard behaviour: debits count as expenses and credits count as income.",
        },
        {
            value: "expense",
            label: "Expense / refund",
            description: "Use for spending categories with refunds. Charges increase expenses and credits reduce them.",
        },
        {
            value: "income",
            label: "Income / reversal",
            description: "Use for payroll or revenue. Credits increase income and debits reduce it.",
        },
        {
            value: "transfer",
            label: "Transfer / exclude",
            description: "Use for internal transfers or card payments. Ignored by income and expense summaries.",
        },
    ]

export function reportingRuleLabel(rule: ReportingRule): string {
    return (
        REPORTING_RULE_OPTIONS.find((option) => option.value === rule)?.label ??
        "Default sign-based"
    )
}

export function effectiveAmount<T extends Pick<StoredTransaction, "amount" | "override_amount">>(
    txn: T
): number {
    return txn.override_amount !== null ? txn.override_amount : txn.amount
}

export function transactionReportingRule<T extends Pick<StoredTransaction, "category_id">>(
    txn: T,
    categoryMap: Record<string, Category>
): ReportingRule {
    if (!txn.category_id) return "default"
    return categoryMap[txn.category_id]?.reporting_rule ?? "default"
}

export function expenseImpact<T extends Pick<StoredTransaction, "amount" | "override_amount" | "category_id">>(
    txn: T,
    categoryMap: Record<string, Category>
): number {
    const amount = effectiveAmount(txn)
    if (!isFinite(amount)) return 0

    switch (transactionReportingRule(txn, categoryMap)) {
        case "transfer":
            return 0
        case "expense":
            return -amount
        case "income":
            return 0
        case "default":
            return amount < 0 ? Math.abs(amount) : 0
    }
}

export function incomeImpact<T extends Pick<StoredTransaction, "amount" | "override_amount" | "category_id">>(
    txn: T,
    categoryMap: Record<string, Category>
): number {
    const amount = effectiveAmount(txn)
    if (!isFinite(amount)) return 0

    switch (transactionReportingRule(txn, categoryMap)) {
        case "transfer":
            return 0
        case "expense":
            return 0
        case "income":
            return amount
        case "default":
            return amount > 0 ? amount : 0
    }
}

export function signedCurrencyLabel(value: number): string {
    const abs = new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
    }).format(Math.abs(value))
    if (value < 0) return `−${abs}`
    return abs
}