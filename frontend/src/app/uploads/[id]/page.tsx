"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  AlertCircle,
  Clock,
  Download,
  FileSpreadsheet,
  FileUp,
  Pencil,
  RefreshCw,
  ScanSearch,
  TriangleAlert,
} from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import { exportToCSV, exportToXLSX } from "@/lib/export"
import type { Upload, StoredTransaction, Category } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CategoryPicker } from "@/components/category-picker"
import { PrivacyValue } from "@/components/privacy-value"
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

function formatAUD(amount: number) {
  if (!isFinite(amount)) return "—"
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(
    Math.abs(amount)
  )
}

// ─── Inline amount editor ─────────────────────────────────────────────────────

interface AmountEditorProps {
  txnId: string
  current: number
  onSave: (id: string, value: number) => void
}

function AmountEditor({ txnId, current, onSave }: AmountEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(isFinite(current) ? String(current) : "")

  function commit() {
    const n = parseFloat(draft)
    if (isFinite(n)) onSave(txnId, n)
  }



  // Sortable Header helper

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        commit()
      }}
      className="flex items-center gap-1 justify-end"
    >
      <input
        ref={inputRef}
        autoFocus
        type="number"
        step="0.01"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        className="w-28 h-7 rounded border border-input bg-background px-2 text-right text-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        placeholder="0.00"
      />
    </form>
  )
}


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

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

type Filter = "all" | "debits" | "credits"

export default function UploadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [upload, setUpload] = useState<Upload | null>(null)
  const [transactions, setTransactions] = useState<StoredTransaction[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Correction map: transactionId → manually entered amount
  const [corrections, setCorrections] = useState<Record<string, number>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [reclassifying, setReclassifying] = useState(false)
  const [reclassifyMsg, setReclassifyMsg] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryEditId, setCategoryEditId] = useState<string | null>(null)

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories]
  )

  // Client-side filters
  const [sortConfig, setSortConfig] = useState<SortConfig>(null)

  const requestSort = (key: "date" | "description" | "amount" | "category") => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    Promise.all([api.getUpload(id), api.getUploadTransactions(id), api.getCategories()])
      .then(([u, txns, cats]) => {
        setUpload(u)
        setTransactions(txns)
        setCategories(cats)
      })
      .catch((e) => setError(e.message))
  }, [id])

  function effectiveAmount(txn: StoredTransaction): number {
    if (corrections[txn.id] !== undefined) return corrections[txn.id]
    if (txn.override_amount !== null) return txn.override_amount
    return txn.amount
  }

  function saveCorrection(txnId: string, value: number) {
    setCorrections((prev) => ({ ...prev, [txnId]: value }))
    setEditingId(null)
  }

  const nanCount = useMemo(
    () => (transactions ?? []).filter((t) => !isFinite(effectiveAmount(t))).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, corrections]
  )

  const filtered = useMemo(() => {
    if (!transactions) return []
    return transactions.filter((t) => {
      const amt = effectiveAmount(t)
      if (filter === "debits" && amt >= 0) return false
      if (filter === "credits" && amt < 0) return false
      if (categoryFilter !== "all") {
        if (categoryFilter === "__none__" && t.category_id != null) return false
        if (categoryFilter !== "__none__" && t.category_id !== categoryFilter) return false
      }
      if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, corrections, filter, categoryFilter, search])

  const totalOut = useMemo(
    () =>
      (transactions ?? [])
        .map(effectiveAmount)
        .filter((a) => isFinite(a) && a < 0)
        .reduce((s, a) => s + a, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, corrections]
  )

  const totalIn = useMemo(
    () =>
      (transactions ?? [])
        .map(effectiveAmount)
        .filter((a) => isFinite(a) && a > 0)
        .reduce((s, a) => s + a, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, corrections]
  )

  // Category expense breakdown (debits only, by category)
  const categoryExpenseData = useMemo(() => {
    if (!transactions) return []
    const buckets: Record<string, { name: string; color: string; value: number }> = {}
    for (const t of transactions) {
      const amt = effectiveAmount(t)
      if (!isFinite(amt) || amt >= 0) continue
      const key = t.category_id ?? "__uncategorised__"
      const cat = t.category_id ? categoryMap[t.category_id] : null
      if (!buckets[key]) {
        buckets[key] = {
          name: cat?.name ?? "Uncategorised",
          color: cat?.color ?? "#94a3b8",
          value: 0,
        }
      }
      buckets[key].value += Math.abs(amt)
    }
    return Object.values(buckets)
      .sort((a, b) => b.value - a.value)
      .map((d) => ({ ...d, value: Math.round(d.value * 100) / 100 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, corrections, categoryMap])

  const totalCategoryExpenses = useMemo(
    () => categoryExpenseData.reduce((s, d) => s + d.value, 0),
    [categoryExpenseData]
  )


  async function handleAssignCategory(txn: StoredTransaction, categoryId: string | null, learn: boolean = true) {
    setCategoryEditId(null)
    try {
      const updated = await api.assignCategory(id, txn.id, categoryId, learn)
      setTransactions((prev) => prev?.map((t) => (t.id === txn.id ? updated : t)) ?? null)

      if (learn) {
        // Reclassify remaining unverified transactions using the improved matching pool
        setReclassifyMsg(null)
        setReclassifying(true)
        await api.reclassifyUpload(id)
        setReclassifyMsg("Category assigned. Reclassification running — refresh in a moment.")
      }
    } catch (e: unknown) {
      setReclassifyMsg(e instanceof Error ? e.message : "Failed to assign category")
    } finally {
      setReclassifying(false)
    }
  }

  async function handleReclassify() {
    setReclassifying(true)
    setReclassifyMsg(null)
    try {
      await api.reclassifyUpload(id)
      const txns = await api.getUploadTransactions(id)
      setTransactions(txns)
      setReclassifyMsg("Reclassification complete.")
    } catch (e: unknown) {
      setReclassifyMsg(e instanceof Error ? e.message : "Failed to reclassify")
    } finally {
      setReclassifying(false)
    }
  }

  async function handleExport(format: "csv" | "xlsx") {
    if (!filtered.length) return
    setExporting(true)
    try {
      const rows = filtered.map((t) => ({
        Date: t.date,
        Description: t.description,
        Amount: effectiveAmount(t),
        Balance: t.balance,
        Status: t.status,
      }))
      const stem = upload?.filename.replace(/\.pdf$/i, "") ?? `upload-${id}`
      if (format === "csv") {
        exportToCSV(rows, `${stem}.csv`)
      } else {
        await exportToXLSX(rows, `${stem}.xlsx`)
      }
    } finally {
      setExporting(false)
    }
  }


  const sortedTransactions = useMemo(() => {
    const sortableItems = [...filtered];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aVal = a[sortConfig.key as keyof typeof a];
        let bVal = b[sortConfig.key as keyof typeof b];
        if (sortConfig.key === 'amount') {
          aVal = effectiveAmount ? effectiveAmount(a) : (a.override_amount !== null ? a.override_amount : a.amount);
          bVal = effectiveAmount ? effectiveAmount(b) : (b.override_amount !== null ? b.override_amount : b.amount);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortConfig]);

  const loading = !upload && !error

  const period =
    upload?.period_start && upload?.period_end
      ? `${formatDate(upload.period_start)} – ${formatDate(upload.period_end)}`
      : null

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Back link + Review button */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/statements">
            <ArrowLeft className="h-4 w-4" />
            All Statements
          </Link>
        </Button>
        {upload?.status === "done" && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReclassify}
              disabled={reclassifying}
              title="Re-run classification on all transactions"
            >
              <RefreshCw className={cn("h-4 w-4", reclassifying && "animate-spin")} />
              <span className="hidden sm:inline ml-1">{reclassifying ? "Reclassifying\u2026" : "Reclassify"}</span>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/uploads/${id}/reupload`}>
                <FileUp className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Re-upload</span>
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/uploads/${id}/review`}>
                <ScanSearch className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Review PDF</span>
              </Link>
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Header */}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      ) : upload ? (
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{upload.filename}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {period ?? (upload.uploaded_at ? `Uploaded ${new Date(upload.uploaded_at).toLocaleDateString("en-AU")}` : "")}
          </p>
          {upload.status === "processing" && (
            <div className="mt-2 flex items-center gap-1.5 text-sm text-amber-600">
              <Clock className="h-4 w-4 animate-pulse" />
              Still processing — refresh in a moment
            </div>
          )}
        </div>
      ) : null}

      {reclassifyMsg && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 shrink-0" />
          {reclassifyMsg}
        </div>
      )}

      {/* Extraction warning — pages Docling couldn't cover */}
      {upload?.status === "done" && upload.error_message && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{upload.error_message}</span>
        </div>
      )}

      {/* NaN warning banner */}
      {nanCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>{nanCount}</strong> transaction{nanCount !== 1 ? "s have" : " has"} an
            unreadable amount. Click the <Pencil className="inline h-3 w-3" /> icon in the
            Amount column to enter the correct value manually. Corrected values are used in
            totals and exports.
          </span>
        </div>
      )}

      {/* Summary cards — left column: stats; right column: donut */}
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
              {/* Card 1 — Transaction count */}
              <Card>
                <CardHeader className="pb-1 sm:pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Transactions</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl sm:text-3xl font-bold">{upload?.transaction_count ?? 0}</p>
                  {nanCount > 0 && (
                    <p className="text-xs text-amber-600 mt-0.5 hidden sm:block">{nanCount} need correction</p>
                  )}
                </CardContent>
              </Card>

              {/* Card 2 — Total Out + Total In */}
              <Card>
                <CardHeader className="pb-1 sm:pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Total out</span>
                    <PrivacyValue className="font-mono text-sm font-bold text-red-600">
                      {transactions ? formatAUD(totalOut) : "—"}
                    </PrivacyValue>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Total in</span>
                    <PrivacyValue className="font-mono text-sm font-bold text-green-600">
                      {transactions ? formatAUD(totalIn) : "—"}
                    </PrivacyValue>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Card 3 — Expenses by category donut */}
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expenses by Category</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                {categoryExpenseData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No categorised expenses yet</p>
                ) : (
                  <div className="flex items-center gap-4">
                    {/* Donut */}
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
                    {/* Legend */}
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
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

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
          {transactions && (
            <p className="text-sm text-muted-foreground">
              {filtered.length} of {transactions.length}
            </p>
          )}
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

      {/* Legend & Info */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-amber-50 dark:bg-amber-900/50 border border-amber-200 dark:border-amber-800" />
          Needs review / Unreadable amount
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700" />
          Low confidence match
        </span>
      </div>

      {/* Transaction table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 sm:p-6 space-y-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px] sm:w-[110px] cursor-pointer select-none" onClick={() => requestSort("date")}>
                      <div className="flex items-center gap-1 hover:text-foreground">
                        Date
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => requestSort("description")}>
                      <div className="flex items-center gap-1 hover:text-foreground">
                        Description
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      </div>
                    </TableHead>
                    <TableHead className="text-right w-[120px] sm:w-[160px] cursor-pointer select-none" onClick={() => requestSort("amount")}>
                      <div className="flex items-center gap-1 hover:text-foreground justify-end">
                        Amount
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      </div>
                    </TableHead>


                    <TableHead className="w-[130px] cursor-pointer select-none" onClick={() => requestSort("category")}>
                      <div className="flex items-center gap-1 hover:text-foreground">
                        Category
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                        No transactions match the current filter
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedTransactions.map((txn) => {
                      const amt = effectiveAmount(txn)
                      const isNaNAmt = !isFinite(amt)
                      const isEditing = editingId === txn.id
                      const needsReview = txn.status === "pending_review"
                      const lowConfidence = txn.status === "auto_classified" && typeof txn.similarity_score === "number" && txn.similarity_score < 0.5

                      return (
                        <TableRow
                          key={txn.id}
                          className={cn(
                            (isNaNAmt || needsReview) && "bg-amber-50/60 dark:bg-amber-900/10",
                            lowConfidence && !needsReview && !isNaNAmt && "bg-neutral-100/50 dark:bg-neutral-800/30"
                          )}
                        >
                          <TableCell className="font-mono text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                            {formatTxnDate(txn.date)}
                          </TableCell>
                          <TableCell className="text-sm max-w-[140px] sm:max-w-xs truncate" title={txn.description}>
                            {txn.description}
                          </TableCell>
                          <TableCell className="text-right">
                            {isEditing ? (
                              <AmountEditor txnId={txn.id} current={amt} onSave={saveCorrection} />
                            ) : isNaNAmt ? (
                              <button
                                onClick={() => setEditingId(txn.id)}
                                className="flex items-center gap-1.5 ml-auto text-amber-600 hover:text-amber-700 text-sm font-medium"
                                title="Click to enter correct amount"
                              >
                                <TriangleAlert className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Invalid</span>
                                <Pencil className="h-3 w-3" />
                              </button>
                            ) : (
                              <span
                                className={cn(
                                  "font-mono text-sm font-medium whitespace-nowrap",
                                  amt < 0
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-green-600 dark:text-green-400"
                                )}
                              >
                                {amt < 0 ? "−" : "+"}
                                {formatAUD(amt)}
                              </span>
                            )}
                          </TableCell>


                          <TableCell className="relative">
                            {categoryEditId === txn.id ? (
                              <CategoryPicker
                                categories={categories}
                                currentCategoryId={txn.category_id}
                                onAssign={(catId, learn) => handleAssignCategory(txn, catId, learn)}
                                onClose={() => setCategoryEditId(null)}
                              />
                            ) : (
                              <button
                                className="group flex items-center gap-1.5 w-full text-left"
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
                                        : txn.status === "verified"
                                          ? undefined
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
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
