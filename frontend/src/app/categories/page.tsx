"use client"

import { useEffect, useState } from "react"
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Plus, Save, Tag, Trash2, X } from "lucide-react"
import { api } from "@/lib/api"
import { REPORTING_RULE_OPTIONS } from "@/lib/reporting"
import type { Category, ReportingRule } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

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

export default function CategoriesPage() {
    const [categories, setCategories] = useState<Category[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        api.getCategories().then(setCategories).catch((e) => setError(e.message))
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

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
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
