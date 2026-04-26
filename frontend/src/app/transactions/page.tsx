"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
    AlertCircle,
    Download,
    FileSpreadsheet,
    TriangleAlert,
    Pencil,
} from "lucide-react";

import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import { exportToCSV, exportToXLSX } from "@/lib/export"
import { effectiveAmount, expenseImpact, signedCurrencyLabel } from "@/lib/reporting"
import type { Upload, StoredTransaction, Category } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { CategoryPicker } from "@/components/category-picker"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { PrivacyValue } from "@/components/privacy-value"


// ─── Types ───────────────────────────────────────────────────────────────────

interface TransactionWithSource extends StoredTransaction {
    source_filename: string
    source_upload_id: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAUD(amount: number) {
    if (!isFinite(amount)) return "—"
    return new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
    }).format(Math.abs(amount))
}

type Filter = "all" | "debits" | "credits"


function formatTxnDate(isoDate: string) {
    if (!isoDate) return "";
    const parts = isoDate.split("T")[0].split("-");
    if (parts.length >= 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return isoDate;
}


type SortConfig = { key: "date" | "description" | "amount" | "category"; direction: "asc" | "desc" } | null;
function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AllTransactionsPage() {
    const [transactions, setTransactions] = useState<TransactionWithSource[] | null>(null)
    const [uploads, setUploads] = useState<Upload[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [error, setError] = useState<string | null>(null)
    const [loadingMsg, setLoadingMsg] = useState("Loading uploads…")

    const categoryMap = useMemo(
        () => Object.fromEntries(categories.map((c) => [c.id, c])),
        [categories]
    )

    const [sortConfig, setSortConfig] = useState<SortConfig>(null)
    const [search, setSearch] = useState("")
    const [filter, setFilter] = useState<Filter>("all")
    const [sourceFilter, setSourceFilter] = useState<string>("all")
    const [categoryFilter, setCategoryFilter] = useState<string>("all")
    const [exporting, setExporting] = useState(false)
    const [page, setPage] = useState(0)
    const [categoryEditId, setCategoryEditId] = useState<string | null>(null)

    type TimeRange = "all" | "12m" | "3m" | "month"
    const [timeRange, setTimeRange] = useState<TimeRange>("all")
    const [selectedMonth, setSelectedMonth] = useState<string>("")

    useEffect(() => {
        async function load() {
            try {
                const [allUploads, cats] = await Promise.all([api.getUploads(), api.getCategories()])
                setUploads(allUploads)
                setCategories(cats)

                const done = allUploads.filter((u) => u.status === "done")
                if (done.length === 0) {
                    setTransactions([])
                    return
                }

                setLoadingMsg(`Loading transactions from ${done.length} statement${done.length !== 1 ? "s" : ""}…`)

                const chunks = await Promise.all(
                    done.map((u) =>
                        api
                            .getUploadTransactions(u.id)
                            .then((txns) =>
                                txns.map((t) => ({
                                    ...t,
                                    source_filename: u.filename,
                                    source_upload_id: u.id,
                                }))
                            )
                            .catch(() => [] as TransactionWithSource[])
                    )
                )

                // Sort combined set by date descending
                const combined = chunks
                    .flat()
                    .sort((a, b) => b.date.localeCompare(a.date))
                setTransactions(combined)
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Failed to load transactions")
            }
        }
        load()
    }, [])

    async function handleAssignCategory(txn: TransactionWithSource, categoryId: string | null, learn: boolean = true) {
        setCategoryEditId(null)
        try {
            const updated = await api.assignCategory(txn.source_upload_id, txn.id, categoryId, learn)
            setTransactions((prev) => prev?.map((t) => (t.id === txn.id ? { ...updated, source_filename: t.source_filename, source_upload_id: t.source_upload_id } as TransactionWithSource : t)) ?? null)
        } catch (e: unknown) {
            console.error("Failed to assign category", e)
        }
    }

    const filtered = useMemo(() => {
        if (!transactions) return []
        return transactions.filter((t) => {
            const eff = effectiveAmount(t)
            if (filter === "debits" && eff >= 0) return false
            if (filter === "credits" && eff < 0) return false
            if (sourceFilter !== "all" && t.source_upload_id !== sourceFilter) return false
            if (categoryFilter !== "all") {
                if (categoryFilter === "__none__" && t.category_id != null) return false
                if (categoryFilter !== "__none__" && t.category_id !== categoryFilter) return false
            }
            if (timeRange === "month" && selectedMonth && !t.date.startsWith(selectedMonth)) return false
            if (search && !t.description.toLowerCase().includes(search.toLowerCase()))
                return false
            return true
        })
    }, [transactions, filter, sourceFilter, categoryFilter, search, timeRange, selectedMonth])

    // Reset to page 0 whenever the filter changes
    const prevFilterKey = useMemo(
        () => `${filter}|${sourceFilter}|${categoryFilter}|${search}|${timeRange}|${selectedMonth}`,
        [filter, sourceFilter, categoryFilter, search, timeRange, selectedMonth]
    )
    useEffect(() => { setPage(0) }, [prevFilterKey])

    const nanCount = useMemo(
        () => (transactions ?? []).filter((t) => !isFinite(effectiveAmount(t))).length,
        [transactions]
    )

    // ── Expense stats scoped to selected time range ───────────────────────────
    // Sorted list of all unique months in the data (desc) for the month picker
    const availableMonths = useMemo(() => {
        if (!transactions) return []
        const months = new Set(transactions.map((t) => t.date.slice(0, 7)))
        return Array.from(months).sort((a, b) => b.localeCompare(a))
    }, [transactions])

    const rangeTransactions = useMemo(() => {
        if (!transactions) return []
        if (timeRange === "all") return transactions
        if (timeRange === "month") {
            if (!selectedMonth) return []
            return transactions.filter((t) => t.date.startsWith(selectedMonth))
        }
        const months = timeRange === "12m" ? 12 : 3
        const cutoff = new Date()
        cutoff.setMonth(cutoff.getMonth() - months)
        const cutoffStr = cutoff.toISOString().slice(0, 10)
        return transactions.filter((t) => t.date >= cutoffStr)
    }, [transactions, timeRange, selectedMonth])

    const monthlyData = useMemo(() => {
        if (!rangeTransactions.length) return []
        const buckets: Record<string, number> = {}
        for (const t of rangeTransactions) {
            const expense = expenseImpact(t, categoryMap)
            if (!isFinite(expense) || expense === 0) continue
            const month = t.date.slice(0, 7) // "YYYY-MM"
            buckets[month] = (buckets[month] ?? 0) + expense
        }
        return Object.entries(buckets)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, expenses]) => ({
                month,
                label: new Date(month + "-02").toLocaleDateString("en-AU", {
                    month: "short",
                    year: "2-digit",
                }),
                expenses: Math.round(expenses * 100) / 100,
            }))
    }, [rangeTransactions, categoryMap])

    const totalExpenses = useMemo(
        () => monthlyData.reduce((s, d) => s + d.expenses, 0),
        [monthlyData]
    )

    const avgMonthlyExpenses = useMemo(
        () => (monthlyData.length > 0 ? totalExpenses / monthlyData.length : 0),
        [totalExpenses, monthlyData]
    )

    // ── Category expense breakdown (rule-based, scoped to time range) ─────────
    const categoryExpenseData = useMemo(() => {
        const buckets: Record<string, { name: string; color: string; value: number }> = {}
        for (const t of rangeTransactions) {
            const expense = expenseImpact(t, categoryMap)
            if (!isFinite(expense) || expense <= 0) continue
            const key = t.category_id ?? "__uncategorised__"
            const cat = t.category_id ? categoryMap[t.category_id] : null
            if (!buckets[key]) {
                buckets[key] = {
                    name: cat?.name ?? "Uncategorised",
                    color: cat?.color ?? "#94a3b8",
                    value: 0,
                }
            }
            buckets[key].value += expense
        }
        return Object.values(buckets)
            .sort((a, b) => b.value - a.value)
            .map((d) => ({ ...d, value: Math.round(d.value * 100) / 100 }))
    }, [rangeTransactions, categoryMap])

    const totalCategoryExpenses = useMemo(
        () => categoryExpenseData.reduce((s, d) => s + d.value, 0),
        [categoryExpenseData]
    )

    // ── Pagination ────────────────────────────────────────────────────────────
    const PAGE_SIZE = 25
    const pageCount = Math.ceil(filtered.length / PAGE_SIZE)

    const sortedTransactions = useMemo(() => {
        const sortableItems = [...filtered];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                let aVal = a[sortConfig.key as keyof typeof a];
                let bVal = b[sortConfig.key as keyof typeof b];
                if (sortConfig.key === 'amount') {
                    aVal = effectiveAmount(a);
                    bVal = effectiveAmount(b);
                }
                if (sortConfig.key === 'category') {
                    aVal = a.category_name || '';
                    bVal = b.category_name || '';
                }

                if ((aVal ?? "") < (bVal ?? "")) return sortConfig.direction === 'asc' ? -1 : 1;
                if ((aVal ?? "") > (bVal ?? "")) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [filtered, sortConfig]);

    const paginated = useMemo(
        () => sortedTransactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
        [sortedTransactions, page]
    )

    async function handleExport(format: "csv" | "xlsx") {
        if (!filtered.length) return
        setExporting(true)
        try {
            const rows = filtered.map((t) => ({
                Date: t.date,
                Description: t.description,
                Amount: effectiveAmount(t),
                Balance: t.balance,
                Source: t.source_filename,
                Category: t.category_name ?? "",
            }))
            if (format === "csv") {
                exportToCSV(rows, "all-transactions.csv")
            } else {
                await exportToXLSX(rows, "all-transactions.xlsx")
            }
        } finally {
            setExporting(false)
        }
    }

    const loading = transactions === null && !error
    const doneUploads = uploads.filter((u) => u.status === "done")


    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">All Transactions</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    {loading
                        ? loadingMsg
                        : `${doneUploads.length} statement${doneUploads.length !== 1 ? "s" : ""} · ${transactions?.length ?? 0} transactions`}
                </p>
            </div>

            {error && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" /> {error}
                </div>
            )}

            {/* NaN warning */}
            {nanCount > 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                    <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                        <strong>{nanCount}</strong> transaction{nanCount !== 1 ? "s have" : " has"} an
                        unreadable amount. Open the individual statement to correct them.
                    </span>
                </div>
            )}

            {/* Summary cards */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Overview</p>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        <div className="flex rounded-md border border-input overflow-hidden text-xs">
                            {(["all", "12m", "3m", "month"] as const).map((r) => (
                                <button
                                    key={r}
                                    onClick={() => {
                                        setTimeRange(r)
                                        if (r === "month" && !selectedMonth && availableMonths.length > 0) {
                                            setSelectedMonth(availableMonths[0])
                                        }
                                    }}
                                    className={cn(
                                        "px-3 h-7 transition-colors",
                                        timeRange === r
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-background hover:bg-muted"
                                    )}
                                >
                                    {r === "all" ? "All" : r === "12m" ? "12m" : r === "3m" ? "3m" : "Month"}
                                </button>
                            ))}
                        </div>
                        {timeRange === "month" && (
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                                {availableMonths.map((m) => (
                                    <option key={m} value={m}>
                                        {new Date(m + "-02").toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                {/* 3-card layout: left col = monthly avg + total, right col = donut */}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3 sm:gap-4">
                    {loading ? (
                        <>
                            <div className="grid grid-cols-2 sm:grid-cols-1 gap-3 sm:gap-4">
                                <Skeleton className="h-24" />
                                <Skeleton className="h-24" />
                            </div>
                            <Skeleton className="h-48" />
                        </>
                    ) : (
                        <>
                            {/* Left — stacked stat cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-1 gap-3 sm:gap-4">
                                <Card>
                                    <CardHeader className="pb-1 sm:pb-2">
                                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                            Avg Monthly Net Expenses
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-xl sm:text-2xl font-bold">
                                            <PrivacyValue>{monthlyData.length > 0 ? signedCurrencyLabel(avgMonthlyExpenses) : "—"}</PrivacyValue>
                                        </p>
                                        {monthlyData.length > 0 && (
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                over {monthlyData.length} month{monthlyData.length !== 1 ? "s" : ""}
                                            </p>
                                        )}
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-1 sm:pb-2">
                                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                            Total Net Expenses
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-xl sm:text-2xl font-bold">
                                            <PrivacyValue>{totalExpenses !== 0 ? signedCurrencyLabel(totalExpenses) : "—"}</PrivacyValue>
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Right — category donut */}
                            <Card>
                                <CardHeader className="pb-0">
                                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Positive Net Expenses by Category</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-2">
                                    {categoryExpenseData.length === 0 ? (
                                        <p className="text-sm text-muted-foreground py-4">No categories with positive net expense yet</p>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-4">
                                                <div className="shrink-0" style={{ width: 140, height: 140 }}>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <PieChart>
                                                            <Pie
                                                                data={categoryExpenseData}
                                                                dataKey="value"
                                                                nameKey="name"
                                                                cx="50%"
                                                                cy="50%"
                                                                innerRadius="52%"
                                                                outerRadius="88%"
                                                                paddingAngle={2}
                                                                strokeWidth={0}
                                                            >
                                                                {categoryExpenseData.map((entry, i) => (
                                                                    <Cell key={i} fill={entry.color} />
                                                                ))}
                                                            </Pie>
                                                            <Tooltip
                                                                content={({ active, payload }) => {
                                                                    if (!active || !payload?.length) return null
                                                                    const { name, value } = payload[0]
                                                                    const pct =
                                                                        totalCategoryExpenses > 0
                                                                            ? (((value as number) / totalCategoryExpenses) * 100).toFixed(1)
                                                                            : "0.0"
                                                                    return (
                                                                        <div className="bg-popover border border-border rounded-md text-xs px-2.5 py-1.5 leading-relaxed text-popover-foreground shadow-md">
                                                                            <p className="font-semibold mb-0.5">{name as string}</p>
                                                                            <p>{new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value as number)}</p>
                                                                            <p className="text-muted-foreground">{pct}%</p>
                                                                        </div>
                                                                    )
                                                                }}
                                                            />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                </div>
                                                <ul className="min-w-0 flex-1 space-y-1.5">
                                                    {categoryExpenseData.slice(0, 6).map((d) => (
                                                        <li key={d.name} className="flex items-center gap-2 text-xs min-w-0">
                                                            <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                                                            <span className="truncate text-foreground flex-1" title={d.name}>{d.name}</span>
                                                            <PrivacyValue className="font-mono text-muted-foreground shrink-0">{formatAUD(d.value)}</PrivacyValue>
                                                        </li>
                                                    ))}
                                                    {categoryExpenseData.length > 6 && (
                                                        <li className="text-xs text-muted-foreground pl-4">+{categoryExpenseData.length - 6} more</li>
                                                    )}
                                                </ul>
                                            </div>
                                            <div className="mt-3 pt-3 border-t border-border/50">
                                                <Link href="/categories" className="text-xs text-primary hover:underline flex items-center gap-1">
                                                    More insights →
                                                </Link>
                                            </div>
                                        </>
                                    )}
                                </CardContent>
                            </Card>
                        </>
                    )}
                </div>
            </div>

            {/* Monthly expenses chart */}
            {!loading && monthlyData.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Monthly Net Expenses</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <div className="text-foreground">
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={monthlyData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                    <XAxis
                                        dataKey="label"
                                        tick={{ fontSize: 11 }}
                                        tickLine={false}
                                        axisLine={false}
                                        ticks={
                                            monthlyData.length <= 3
                                                ? monthlyData.map((d) => d.label)
                                                : [
                                                    monthlyData[0].label,
                                                    monthlyData[Math.floor((monthlyData.length - 1) / 2)].label,
                                                    monthlyData[monthlyData.length - 1].label,
                                                ]
                                        }
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11 }}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(v: number) =>
                                            v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                                        }
                                        width={48}
                                    />
                                    <Tooltip
                                        formatter={(value) => [
                                            new Intl.NumberFormat("en-AU", {
                                                style: "currency",
                                                currency: "AUD",
                                            }).format(value as number),
                                            "Expenses",
                                        ]}
                                        labelFormatter={(label) => label}
                                        cursor={{ fill: "hsl(var(--muted))" }}
                                        contentStyle={{
                                            background: "hsl(var(--popover))",
                                            border: "1px solid hsl(var(--border))",
                                            borderRadius: "6px",
                                            fontSize: "12px",
                                            color: "hsl(var(--popover-foreground))"
                                        }}
                                    />
                                    <Bar
                                        dataKey="expenses"
                                        fill="currentColor"
                                        className="fill-zinc-600 dark:fill-zinc-400"
                                        radius={[3, 3, 0, 0]}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Filters + export */}
            <div className="space-y-2">
                <div className="flex gap-2 sm:gap-3">
                    <input
                        type="search"
                        placeholder="Search description…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring flex-1 min-w-0"
                    />
                    <div className="flex rounded-md border border-input overflow-hidden text-sm shrink-0">
                        {(["all", "debits", "credits"] as Filter[]).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={cn(
                                    "px-2 sm:px-3 h-9 capitalize transition-colors",
                                    filter === f
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-background hover:bg-muted"
                                )}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Source filter */}
                    {doneUploads.length > 1 && (
                        <select
                            value={sourceFilter}
                            onChange={(e) => setSourceFilter(e.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-w-[200px] truncate"
                        >
                            <option value="all">All statements</option>
                            {doneUploads.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.filename}
                                </option>
                            ))}
                        </select>
                    )}
                    {categories.length > 0 && (
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-w-[180px] truncate"
                        >
                            <option value="all">All categories</option>
                            <option value="__none__">Uncategorised</option>
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    )}
                    <p className="text-sm text-muted-foreground">
                        {filtered.length} of {transactions?.length ?? 0}
                    </p>
                    <select
                        value={sortConfig ? `${sortConfig.key}-${sortConfig.direction}` : ""}
                        onChange={(e) => {
                            if (!e.target.value) { setSortConfig(null); return; }
                            const parts = e.target.value.split("-");
                            const dir = parts.pop() as "asc" | "desc";
                            const key = parts.join("-") as "date" | "description" | "amount" | "category";
                            setSortConfig({ key, direction: dir });
                        }}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                        <option value="">Sort: Default</option>
                        <option value="date-desc">Date (newest)</option>
                        <option value="date-asc">Date (oldest)</option>
                        <option value="amount-asc">Amount (low→high)</option>
                        <option value="amount-desc">Amount (high→low)</option>
                        <option value="description-asc">Description (A–Z)</option>
                        <option value="category-asc">Category (A–Z)</option>
                    </select>
                    <div className="ml-auto flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={exporting || filtered.length === 0}
                            onClick={() => handleExport("csv")}
                        >
                            <Download className="h-4 w-4" />
                            <span className="hidden sm:inline">CSV</span>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={exporting || filtered.length === 0}
                            onClick={() => handleExport("xlsx")}
                        >
                            <FileSpreadsheet className="h-4 w-4" />
                            <span className="hidden sm:inline">Excel</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Transaction list */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-4 sm:p-6 space-y-3">
                            {[...Array(10)].map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full" />
                            ))}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center text-muted-foreground py-16 text-sm">
                            {transactions?.length === 0
                                ? "No completed statement uploads yet."
                                : "No transactions match the current filter."}
                        </div>
                    ) : (
                        <div className="divide-y">
                            {paginated.map((txn) => {
                                const amt = effectiveAmount(txn)
                                const isNaNAmt = !isFinite(amt)
                                return (
                                    <div
                                        key={txn.id}
                                        className={cn(
                                            "px-4 py-3",
                                            isNaNAmt && "bg-amber-50/60 dark:bg-amber-900/10"
                                        )}
                                    >
                                        {/* Top row: description + amount */}
                                        <div className="flex items-start justify-between gap-3">
                                            <p className="text-sm min-w-0 flex-1 truncate" title={txn.description}>
                                                {txn.description}
                                            </p>
                                            <div className="shrink-0 text-right">
                                                {isNaNAmt ? (
                                                    <Link
                                                        href={`/uploads/${txn.source_upload_id}`}
                                                        className="flex items-center gap-1 text-amber-600 hover:underline text-sm"
                                                        title="Open statement to correct"
                                                    >
                                                        <TriangleAlert className="h-3.5 w-3.5" />
                                                        <span>Invalid</span>
                                                    </Link>
                                                ) : (
                                                    <span
                                                        className={cn(
                                                            "font-mono text-sm font-medium whitespace-nowrap",
                                                            amt < 0
                                                                ? "text-red-600 dark:text-red-400"
                                                                : "text-green-600 dark:text-green-400"
                                                        )}
                                                    >
                                                        <PrivacyValue>{amt < 0 ? "−" : "+"}{formatAUD(amt)}</PrivacyValue>
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {/* Bottom row: date + category */}
                                        <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                                            <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                                                {formatTxnDate(txn.date)}
                                            </span>
                                            {categoryEditId === txn.id ? (
                                                <CategoryPicker
                                                    categories={categories}
                                                    currentCategoryId={txn.category_id}
                                                    onAssign={(catId, learn) => handleAssignCategory(txn, catId, learn)}
                                                    onClose={() => setCategoryEditId(null)}
                                                />
                                            ) : (
                                                <button
                                                    className="group flex items-center gap-1.5 text-left"
                                                    onClick={() => setCategoryEditId(txn.id)}
                                                    title="Click to assign category"
                                                >
                                                    {txn.category_name ? (
                                                        <Badge
                                                            variant="secondary"
                                                            className="text-xs border-transparent"
                                                            style={(() => {
                                                                const color = txn.category_id ? categoryMap[txn.category_id]?.color : null
                                                                return color
                                                                    ? { backgroundColor: hexToRgba(color, 0.15), color }
                                                                    : undefined
                                                            })()}
                                                        >
                                                            {txn.category_name}
                                                        </Badge>
                                                    ) : (
                                                        <span className={cn(
                                                            "text-xs font-medium",
                                                            txn.status === "pending_review" ? "text-amber-600" : "text-muted-foreground",
                                                        )}>
                                                            {txn.status === "pending_review" ? "Needs review" : "Pending"}
                                                        </span>
                                                    )}
                                                    <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-60 shrink-0" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Pagination */}
            {pageCount > 1 && (
                <div className="flex items-center justify-between text-sm">
                    <p className="text-muted-foreground">
                        Page {page + 1} of {pageCount}
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            disabled={page === 0}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                            disabled={page >= pageCount - 1}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
