"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Plus, Save, Tag, Trash2, X, TrendingUp } from "lucide-react"
import { api } from "@/lib/api"
import { REPORTING_RULE_OPTIONS } from "@/lib/reporting"
import type { Category, ReportingRule } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    CartesianGrid,
    Legend,
} from "recharts"
import { PrivacyValue } from "@/components/privacy-value"

// ─── Color swatches ──────────────────────────────────────────────────────────

const COLORS = [
    { label: "Slate", value: "#64748b" },
    { label: "Red", value: "#ef4444" },
    { label: "Orange", value: "#f97316" },
    { label: "Amber", value: "#f59e0b" },
    { label: "Green", value: "#22c55e" },
    { label: "Teal", value: "#14b8a6" },
    { label: "Blue", value: "#3b82f6" },
    { label: "Violet", value: "#8b5cf6" },
    { label: "Pink", value: "#ec4899" },
]

// ─── New category form ────────────────────────────────────────────────────────

interface NewCategoryFormProps {
    onCreate: (cat: Category) => void
}

function NewCategoryForm({ onCreate }: NewCategoryFormProps) {
    const [open, setOpen] = useState(false)
    const [name, setName] = useState("")
    const [color, setColor] = useState(COLORS[6].value)
    const [reportingRule, setReportingRule] = useState<ReportingRule>("default")
    const [seedText, setSeedText] = useState("")
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!name.trim()) return
        setSaving(true)
        setError(null)
        const seed_phrases = seedText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        try {
            const cat = await api.createCategory({
                name: name.trim(),
                color,
                reporting_rule: reportingRule,
                seed_phrases,
            })
            onCreate(cat)
            setName("")
            setSeedText("")
            setColor(COLORS[6].value)
            setReportingRule("default")
            setOpen(false)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to create category")
        } finally {
            setSaving(false)
        }
    }

    if (!open) {
        return (
            <Button onClick={() => setOpen(true)} className="w-full" variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                New Category
            </Button>
        )
    }

    return (
        <Card className="border-dashed">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                    New Category
                    <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="h-7 w-7">
                        <ChevronUp className="h-4 w-4" />
                    </Button>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Name</label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Groceries"
                            required
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Color</label>
                        <div className="flex flex-wrap gap-2">
                            {COLORS.map((c) => (
                                <button
                                    key={c.value}
                                    type="button"
                                    title={c.label}
                                    onClick={() => setColor(c.value)}
                                    className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                                    style={{
                                        backgroundColor: c.value,
                                        borderColor: color === c.value ? "black" : "transparent",
                                    }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Reporting Rule</label>
                        <select
                            value={reportingRule}
                            onChange={(e) => setReportingRule(e.target.value as ReportingRule)}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                            {REPORTING_RULE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                            {REPORTING_RULE_OPTIONS.find((option) => option.value === reportingRule)?.description}
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">
                            Seed merchants / transaction types
                            <span className="ml-1 font-normal text-muted-foreground text-xs">
                                (one per line — used to build the initial text matching pool)
                            </span>
                        </label>
                        <textarea
                            value={seedText}
                            onChange={(e) => setSeedText(e.target.value)}
                            placeholder={"Woolworths\nColes\nAldi\nIGA"}
                            rows={5}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                        />
                        <p className="text-xs text-muted-foreground">
                            {seedText.split("\n").filter((s) => s.trim()).length} seed phrase(s) entered.
                            {seedText.split("\n").filter((s) => s.trim()).length > 0 &&
                                " Each will be inserted as an exact match example."}
                        </p>
                    </div>

                    {error && (
                        <div className="flex items-center gap-1.5 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4" /> {error}
                        </div>
                    )}

                    <div className="flex gap-2 justify-end">
                        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving || !name.trim()}>
                            {saving ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    {seedText.split("\n").filter((s) => s.trim()).length > 0
                                        ? "Saving seed phrases…"
                                        : "Creating…"}
                                </>
                            ) : (
                                "Create Category"
                            )}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    )
}

// ─── Category row ─────────────────────────────────────────────────────────────

interface CategoryExample {
    description: string
    count: number
    last_used_at: string | null
}

function CategoryRow({
    category: initialCategory,
    onDelete,
    onUpdate,
}: {
    category: Category
    onDelete: (id: string) => void
    onUpdate: (cat: Category) => void
}) {
    const [category, setCategory] = useState(initialCategory)
    const [expanded, setExpanded] = useState(false)
    const [examples, setExamples] = useState<CategoryExample[] | null>(null)
    const [loadingExamples, setLoadingExamples] = useState(false)

    // Edit state
    const [editName, setEditName] = useState(category.name)
    const [editColor, setEditColor] = useState(category.color ?? COLORS[6].value)
    const [seedText, setSeedText] = useState("")
    const [saving, setSaving] = useState(false)
    const [ruleSaving, setRuleSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    // Delete state
    const [deleting, setDeleting] = useState(false)

    async function handleToggle() {
        if (!expanded && examples === null) {
            setLoadingExamples(true)
            try {
                const data = await api.getCategoryExamples(category.id)
                setExamples(data)
            } finally {
                setLoadingExamples(false)
            }
        }
        setExpanded((v) => !v)
    }

    async function handleSave() {
        setSaving(true)
        setSaveError(null)
        const newSeeds = seedText.split("\n").map((s) => s.trim()).filter(Boolean)
        try {
            const updated = await api.updateCategory(category.id, {
                name: editName.trim() || category.name,
                color: editColor,
                ...(newSeeds.length > 0 ? { seed_phrases: newSeeds } : {}),
            })
            setCategory(updated)
            onUpdate(updated)
            setSeedText("")
            // Refresh examples if panel open and seeds were added
            if (newSeeds.length > 0) {
                const data = await api.getCategoryExamples(updated.id)
                setExamples(data)
            }
        } catch (err: unknown) {
            setSaveError(err instanceof Error ? err.message : "Failed to save")
        } finally {
            setSaving(false)
        }
    }

    async function handleInlineRuleChange(nextRule: ReportingRule) {
        if (nextRule === category.reporting_rule) return
        setRuleSaving(true)
        setSaveError(null)
        try {
            const updated = await api.updateCategory(category.id, {
                reporting_rule: nextRule,
            })
            setCategory(updated)
            onUpdate(updated)
        } catch (err: unknown) {
            setSaveError(err instanceof Error ? err.message : "Failed to update reporting rule")
        } finally {
            setRuleSaving(false)
        }
    }

    function handleCancel() {
        setEditName(category.name)
        setEditColor(category.color ?? COLORS[6].value)
        setSeedText("")
        setSaveError(null)
        setExpanded(false)
    }

    async function handleDelete() {
        if (!confirm(`Delete "${category.name}"? All transactions in this category will be unclassified.`)) return
        setDeleting(true)
        try {
            await api.deleteCategory(category.id)
            onDelete(category.id)
        } catch {
            setDeleting(false)
        }
    }

    const isDirty =
        editName.trim() !== category.name ||
        editColor !== (category.color ?? COLORS[6].value) ||
        seedText.trim().length > 0

    const ruleDescription = REPORTING_RULE_OPTIONS.find(
        (option) => option.value === category.reporting_rule
    )?.description

    return (
        <div className="border-b last:border-b-0">
            {/* Summary row */}
            <div className="flex flex-wrap items-start gap-3 py-3 px-4 group">
                <div
                    className="h-3 w-3 rounded-full shrink-0 mt-1"
                    style={{ backgroundColor: category.color ?? "#94a3b8" }}
                />
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm">{category.name}</span>
                        <Badge variant="secondary" className="text-xs shrink-0">
                            {category.example_count} example{category.example_count !== 1 ? "s" : ""}
                        </Badge>
                        {category.example_count === 0 && (
                            <span className="text-xs text-amber-600 shrink-0">no matches</span>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">{ruleDescription}</p>
                </div>

                <div className="ml-auto flex items-center gap-2 shrink-0">
                    <div className="min-w-[190px]">
                        <label className="sr-only">Reporting rule</label>
                        <select
                            value={category.reporting_rule}
                            onChange={(e) => handleInlineRuleChange(e.target.value as ReportingRule)}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            disabled={ruleSaving || saving || deleting}
                            title="How this category contributes to totals"
                        >
                            {REPORTING_RULE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                    {ruleSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <button
                        onClick={handleToggle}
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        title={expanded ? "Collapse" : "Edit name, colour, and examples"}
                    >
                        {loadingExamples ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : expanded ? (
                            <ChevronUp className="h-4 w-4" />
                        ) : (
                            <ChevronDown className="h-4 w-4" />
                        )}
                    </button>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={handleDelete}
                        disabled={deleting || ruleSaving}
                        title="Delete category"
                    >
                        {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                </div>
            </div>

            {saveError && !expanded && (
                <div className="px-4 pb-3 flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" /> {saveError}
                </div>
            )}

            {/* Expanded panel */}
            {expanded && (
                <div className="px-4 pb-4 space-y-4 bg-muted/30 border-t">
                    {/* Examples */}
                    <div className="pt-3">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Examples</p>
                        {examples === null || loadingExamples ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                            </div>
                        ) : examples.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">
                                No examples yet. Add seed phrases below or assign transactions from the statement detail page.
                            </p>
                        ) : (
                            <ul className="space-y-1.5">
                                {examples.map((ex) => (
                                    <li key={ex.description} className="flex items-center justify-between gap-3 text-xs">
                                        <span className="font-mono text-foreground truncate">{ex.description}</span>
                                        <span className="text-muted-foreground shrink-0">×{ex.count}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Edit form */}
                    <div className="space-y-3 pt-1 border-t">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-3">Edit</p>

                        <div className="space-y-1">
                            <label className="text-xs font-medium">Name</label>
                            <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="h-8 text-sm"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-medium">Color</label>
                            <div className="flex flex-wrap gap-2">
                                {COLORS.map((c) => (
                                    <button
                                        key={c.value}
                                        type="button"
                                        title={c.label}
                                        onClick={() => setEditColor(c.value)}
                                        className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                                        style={{
                                            backgroundColor: c.value,
                                            borderColor: editColor === c.value ? "black" : "transparent",
                                        }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-medium">
                                Add seed phrases
                                <span className="ml-1 font-normal text-muted-foreground">(one per line — added as text examples)</span>
                            </label>
                            <textarea
                                value={seedText}
                                onChange={(e) => setSeedText(e.target.value)}
                                placeholder={"e.g. Woolworths\nColes"}
                                rows={3}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                            />
                        </div>

                        {saveError && (
                            <div className="flex items-center gap-1.5 text-xs text-destructive">
                                <AlertCircle className="h-3.5 w-3.5" /> {saveError}
                            </div>
                        )}

                        <div className="flex gap-2 justify-end">
                            <Button type="button" variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>
                                <X className="h-3.5 w-3.5 mr-1" /> Cancel
                            </Button>
                            <Button size="sm" onClick={handleSave} disabled={saving || !isDirty}>
                                {saving ? (
                                    <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />{seedText.trim() ? "Saving examples…" : "Saving…"}</>
                                ) : (
                                    <><Save className="h-3.5 w-3.5 mr-1" />Save</>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface SpendingDataPoint {
    category_id: string
    category_name: string
    color: string | null
    reporting_rule: string
    month: string
    amount: number
}

function formatAUD(amount: number) {
    if (!isFinite(amount)) return "—"
    return new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
    }).format(Math.abs(amount))
}

export default function CategoriesPage() {
    const [categories, setCategories] = useState<Category[] | null>(null)
    const [spendingData, setSpendingData] = useState<SpendingDataPoint[] | null>(null)
    const [selectedCategory, setSelectedCategory] = useState<string>("total-expenses")
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        Promise.all([api.getCategories(), api.getCategoriesSpending()])
            .then(([cats, spending]) => {
                setCategories(cats)
                setSpendingData(spending)
            })
            .catch((e) => setError(e.message))
    }, [])

    function handleCreate(cat: Category) {
        setCategories((prev) => (prev ? [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)) : [cat]))
    }

    function handleDelete(id: string) {
        setCategories((prev) => prev?.filter((c) => c.id !== id) ?? null)
    }

    function handleUpdate(cat: Category) {
        setCategories((prev) =>
            prev ? prev.map((c) => (c.id === cat.id ? cat : c)).sort((a, b) => a.name.localeCompare(b.name)) : [cat]
        )
    }

    // Process spending data into chart format and calculate stats
    const { chartData, categoryStats } = useMemo(() => {
        if (!spendingData || !categories) {
            return { chartData: [], categoryStats: new Map() }
        }

        // Find and exclude the latest month (incomplete data)
        const sortedMonths = Array.from(new Set(spendingData.map((p) => p.month))).sort()
        const latestMonth = sortedMonths[sortedMonths.length - 1]
        const filteredSpendingData = spendingData.filter((p) => p.month !== latestMonth)

        // Build a map of category_id -> Category for rule lookup
        const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]))

        // Calculate expense impact based on reporting rule
        const expenseByMonthCategory = new Map<string, Map<string, number>>()
        const categoryTotals = new Map<string, { total: number; monthCount: number; name: string; color: string }>()

        for (const point of filteredSpendingData) {
            const cat = categoryMap[point.category_id]
            if (!cat) continue

            // Calculate expense impact based on reporting rule
            let expense = 0
            const amount = point.amount

            switch (point.reporting_rule) {
                case "transfer":
                    expense = 0
                    break
                case "expense":
                    expense = -amount
                    break
                case "income":
                    expense = 0
                    break
                case "default":
                    expense = amount < 0 ? Math.abs(amount) : 0
                    break
            }

            if (expense === 0) continue

            // Add to monthly data
            if (!expenseByMonthCategory.has(point.month)) {
                expenseByMonthCategory.set(point.month, new Map())
            }
            expenseByMonthCategory.get(point.month)!.set(point.category_id, expense)

            // Add to totals
            if (!categoryTotals.has(point.category_id)) {
                categoryTotals.set(point.category_id, {
                    total: 0,
                    monthCount: 0,
                    name: point.category_name,
                    color: point.color ?? "#94a3b8",
                })
            }
            const stats = categoryTotals.get(point.category_id)!
            stats.total += expense
            stats.monthCount += 1
        }

        // Filter data based on selected category
        const months = Array.from(expenseByMonthCategory.keys()).sort()
        let chart: Array<Record<string, unknown>>
        const filteredStats = new Map<string, { total: number; monthCount: number; name: string; color: string }>()

        if (selectedCategory === "total-expenses") {
            // Aggregate all expense categories
            chart = months.map((month) => {
                const dataPoint: Record<string, unknown> = {
                    month,
                    label: new Date(month + "-02").toLocaleDateString("en-AU", {
                        month: "short",
                        year: "2-digit",
                    }),
                }
                const monthData = expenseByMonthCategory.get(month)!
                let totalExpense = 0
                monthData.forEach((expense) => {
                    totalExpense += expense
                })
                dataPoint["Total Expenses"] = Math.round(totalExpense * 100) / 100
                return dataPoint
            })

            // Calculate aggregate stats
            let total = 0
            const monthCounts = new Set<string>()
            categoryTotals.forEach((stats, catId) => {
                total += stats.total
                // Count unique months where this category had expenses
                for (const point of filteredSpendingData) {
                    if (point.category_id === catId) {
                        monthCounts.add(point.month)
                    }
                }
            })

            filteredStats.set("total-expenses", {
                total,
                monthCount: monthCounts.size || 1,
                name: "Total Expenses",
                color: "#3b82f6",
            })
        } else {
            // Show single category
            chart = months.map((month) => {
                const dataPoint: Record<string, unknown> = {
                    month,
                    label: new Date(month + "-02").toLocaleDateString("en-AU", {
                        month: "short",
                        year: "2-digit",
                    }),
                }
                const monthData = expenseByMonthCategory.get(month)!
                const expense = monthData.get(selectedCategory) || 0
                const cat = categoryMap[selectedCategory]
                if (cat) {
                    dataPoint[cat.name] = Math.round(expense * 100) / 100
                }
                return dataPoint
            })

            // Include only the selected category stats
            const stats = categoryTotals.get(selectedCategory)
            if (stats) {
                filteredStats.set(selectedCategory, stats)
            }
        }

        return { chartData: chart, categoryStats: filteredStats }
    }, [spendingData, categories, selectedCategory])

    // Calculate top categories for insights
    const topCategoryInsights = useMemo(() => {
        if (!spendingData || !categories) {
            return { topAllTime: [], topLast3Months: [] }
        }

        // Find and exclude the latest month (incomplete data)
        const sortedMonths = Array.from(new Set(spendingData.map((p) => p.month))).sort()
        const latestMonth = sortedMonths[sortedMonths.length - 1]
        const filteredSpendingData = spendingData.filter((p) => p.month !== latestMonth)

        const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]))
        const allTimeTotals = new Map<string, { total: number; name: string; color: string }>()
        const last3MonthsTotals = new Map<string, { total: number; name: string; color: string }>()

        // Calculate threshold for last 3 months (using the month before the excluded latest month)
        const secondLatestMonth = sortedMonths[sortedMonths.length - 2] || latestMonth
        const last3MonthsThreshold = new Date(secondLatestMonth + "-01")
        last3MonthsThreshold.setMonth(last3MonthsThreshold.getMonth() - 2)
        const thresholdStr = last3MonthsThreshold.toISOString().slice(0, 7)

        for (const point of filteredSpendingData) {
            const cat = categoryMap[point.category_id]
            if (!cat) continue

            let expense = 0
            const amount = point.amount

            switch (point.reporting_rule) {
                case "transfer":
                    expense = 0
                    break
                case "expense":
                    expense = -amount
                    break
                case "income":
                    expense = 0
                    break
                case "default":
                    expense = amount < 0 ? Math.abs(amount) : 0
                    break
            }

            if (expense === 0) continue

            // All time totals
            if (!allTimeTotals.has(point.category_id)) {
                allTimeTotals.set(point.category_id, {
                    total: 0,
                    name: point.category_name,
                    color: point.color ?? "#94a3b8",
                })
            }
            allTimeTotals.get(point.category_id)!.total += expense

            // Last 3 months totals
            if (point.month >= thresholdStr) {
                if (!last3MonthsTotals.has(point.category_id)) {
                    last3MonthsTotals.set(point.category_id, {
                        total: 0,
                        name: point.category_name,
                        color: point.color ?? "#94a3b8",
                    })
                }
                last3MonthsTotals.get(point.category_id)!.total += expense
            }
        }

        const topAllTime = Array.from(allTimeTotals.entries())
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 3)
            .map(([id, stats]) => ({ id, ...stats }))

        const topLast3Months = Array.from(last3MonthsTotals.entries())
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 3)
            .map(([id, stats]) => ({ id, ...stats }))

        return { topAllTime, topLast3Months }
    }, [spendingData, categories])

    const hasSpendingData = chartData.length > 0

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Tag className="h-5 w-5" />
                    <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
                </div>
                {categories && (
                    <span className="text-sm text-muted-foreground">{categories.length} total</span>
                )}
            </div>

            {error && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" /> {error}
                </div>
            )}

            {/* Spending Insights Section */}
            {hasSpendingData && categories && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-lg font-semibold">Spending Insights</h2>
                    </div>

                    {/* Category Selector */}
                    <div className="flex items-center gap-3">
                        <label htmlFor="category-select" className="text-sm font-medium text-muted-foreground">
                            Category:
                        </label>
                        <select
                            id="category-select"
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="flex h-9 rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="total-expenses">Total Expenses</option>
                            {categories
                                .filter((cat) => {
                                    // Find and exclude the latest month
                                    const sortedMonths = Array.from(new Set((spendingData || []).map((p) => p.month))).sort()
                                    const latestMonth = sortedMonths[sortedMonths.length - 1]

                                    // Only show categories that have expense data (excluding latest month)
                                    for (const point of spendingData || []) {
                                        if (point.category_id === cat.id && point.month !== latestMonth) {
                                            return true
                                        }
                                    }
                                    return false
                                })
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </option>
                                ))}
                        </select>
                    </div>

                    {/* Insight Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Combined Top Categories Card - spans 2 columns */}
                        <Card className="md:col-span-2">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                                    Top Categories
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    {/* All Time Column */}
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                            All Time
                                        </h4>
                                        {topCategoryInsights.topAllTime.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">No expense data available</p>
                                        ) : (
                                            topCategoryInsights.topAllTime.map((cat, idx) => (
                                                <div key={cat.id} className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-xs font-medium text-muted-foreground w-4">
                                                            {idx + 1}.
                                                        </span>
                                                        <div
                                                            className="h-2.5 w-2.5 rounded-full shrink-0"
                                                            style={{ backgroundColor: cat.color }}
                                                        />
                                                        <span className="text-sm truncate">{cat.name}</span>
                                                    </div>
                                                    <span className="text-sm font-medium shrink-0 ml-2">
                                                        <PrivacyValue>{formatAUD(cat.total)}</PrivacyValue>
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {/* Last 3 Months Column */}
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                            Last 3 Months
                                        </h4>
                                        {topCategoryInsights.topLast3Months.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">No recent data available</p>
                                        ) : (
                                            topCategoryInsights.topLast3Months.map((cat, idx) => (
                                                <div key={cat.id} className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-xs font-medium text-muted-foreground w-4">
                                                            {idx + 1}.
                                                        </span>
                                                        <div
                                                            className="h-2.5 w-2.5 rounded-full shrink-0"
                                                            style={{ backgroundColor: cat.color }}
                                                        />
                                                        <span className="text-sm truncate">{cat.name}</span>
                                                    </div>
                                                    <span className="text-sm font-medium shrink-0 ml-2">
                                                        <PrivacyValue>{formatAUD(cat.total)}</PrivacyValue>
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Summary Stats Card - spans 1 column */}
                        {Array.from(categoryStats.entries())
                            .sort((a, b) => b[1].total - a[1].total)
                            .map(([catId, stats]) => (
                                <Card key={catId}>
                                    <CardHeader className="pb-2">
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="h-3 w-3 rounded-full shrink-0"
                                                style={{ backgroundColor: stats.color }}
                                            />
                                            <CardTitle className="text-sm font-medium">
                                                {stats.name}
                                            </CardTitle>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-1">
                                        <div className="text-2xl font-bold">
                                            <PrivacyValue>{formatAUD(stats.total)}</PrivacyValue>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            <PrivacyValue>
                                                {formatAUD(stats.total / stats.monthCount)}/mo avg
                                            </PrivacyValue>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                    </div>

                    {/* Time Series Chart */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Spending Trends</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis
                                        dataKey="label"
                                        tick={{ fontSize: 12 }}
                                        className="text-muted-foreground"
                                    />
                                    <YAxis
                                        tick={{ fontSize: 12 }}
                                        className="text-muted-foreground"
                                        tickFormatter={(val) => `$${Math.round(val)}`}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: "hsl(var(--card))",
                                            border: "1px solid hsl(var(--border))",
                                            borderRadius: "6px",
                                        }}
                                        formatter={(value: unknown) => {
                                            const num = typeof value === "number" ? value : 0
                                            return [formatAUD(num), ""]
                                        }}
                                    />
                                    <Legend
                                        wrapperStyle={{ fontSize: "12px" }}
                                        iconType="line"
                                    />
                                    {selectedCategory === "total-expenses" ? (
                                        <Line
                                            type="monotone"
                                            dataKey="Total Expenses"
                                            stroke="#3b82f6"
                                            strokeWidth={2}
                                            dot={{ r: 3 }}
                                            activeDot={{ r: 5 }}
                                        />
                                    ) : (
                                        categories
                                            .filter((cat) => cat.id === selectedCategory)
                                            .map((cat) => (
                                                <Line
                                                    key={cat.id}
                                                    type="monotone"
                                                    dataKey={cat.name}
                                                    stroke={cat.color ?? "#94a3b8"}
                                                    strokeWidth={2}
                                                    dot={{ r: 3 }}
                                                    activeDot={{ r: 5 }}
                                                />
                                            ))
                                    )}
                                </LineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>
            )}

            <NewCategoryForm onCreate={handleCreate} />

            {!categories && !error && (
                <div className="space-y-2">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
            )}

            {categories?.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-center text-muted-foreground">
                    <Tag className="h-10 w-10 opacity-20" />
                    <p className="text-sm">No categories yet. Create one above to start classifying transactions.</p>
                </div>
            )}

            {categories && categories.length > 0 && (
                <Card>
                    <div>
                        {categories.map((cat) => (
                            <CategoryRow key={cat.id} category={cat} onDelete={handleDelete} onUpdate={handleUpdate} />
                        ))}
                    </div>
                </Card>
            )}

            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground space-y-4">
                <div className="space-y-1.5">
                    <p className="font-medium text-foreground">How auto-classification works</p>
                    <ol className="list-decimal list-inside space-y-1">
                        <li><strong>Exact learned match</strong> — if a transaction description exactly matches a previously learned example, that category is applied immediately.</li>
                        <li><strong>Trigram similarity match</strong> — if there is no exact match, the description is compared with known examples and the closest strong match is applied automatically.</li>
                        <li><strong>Pending review</strong> — if nothing is similar enough, the transaction stays unclassified so you can review it manually.</li>
                    </ol>
                    <p>Every manual category assignment strengthens future matching by adding another learned example.</p>
                </div>

                <div className="space-y-1.5 border-t pt-3">
                    <p className="font-medium text-foreground">How reporting rules work</p>
                    <p>Reporting rules do not affect classification. They only control how transactions in that category contribute to summaries and charts.</p>
                    <ul className="space-y-1">
                        <li><strong>Default sign-based</strong> keeps the normal bank logic: debits are expenses and credits are income.</li>
                        <li><strong>Expense / refund</strong> is for spending categories where refunds should reduce expenses instead of counting as income.</li>
                        <li><strong>Income / reversal</strong> is for payroll or revenue categories where negative corrections should reduce income.</li>
                        <li><strong>Transfer / exclude</strong> removes internal transfers and card payments from both income and expense totals.</li>
                    </ul>
                </div>
            </div>
        </div>
    )
}
