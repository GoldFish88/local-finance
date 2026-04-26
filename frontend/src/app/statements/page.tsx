"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { FileText, RefreshCw, Upload, AlertCircle, Clock, CheckCircle, XCircle, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import { expenseImpact, incomeImpact, signedCurrencyLabel } from "@/lib/reporting"
import { cn } from "@/lib/utils"
import type { Upload as UploadType, StoredTransaction, Category } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { PrivacyValue } from "@/components/privacy-value"

function StatusBadge({ status }: { status: UploadType["status"] }) {
  if (status === "done")
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle className="h-3 w-3 mr-1" /> Done
      </Badge>
    )
  if (status === "processing")
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400">
        <Clock className="h-3 w-3 mr-1" /> Processing
      </Badge>
    )
  return (
    <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400">
      <XCircle className="h-3 w-3 mr-1" /> Failed
    </Badge>
  )
}

interface UploadCardProps {
  upload: UploadType
  transactions: StoredTransaction[] | undefined
  categoryMap: Record<string, Category>
  onDelete: (id: string) => void
}

function UploadCard({ upload, transactions, categoryMap, onDelete }: UploadCardProps) {
  const uploadedDate = upload.uploaded_at
    ? new Date(upload.uploaded_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : "—"

  const period =
    upload.period_start && upload.period_end
      ? `${new Date(upload.period_start + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${new Date(upload.period_end + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
      : null

  // Compute totals + category breakdown
  const stats = useMemo(() => {
    if (!transactions?.length) return null
    let totalIncome = 0
    let totalExpenses = 0
    const catSpend: Record<string, { name: string; color: string; value: number }> = {}
    for (const t of transactions) {
      totalIncome += incomeImpact(t, categoryMap)
      const expense = expenseImpact(t, categoryMap)
      totalExpenses += expense

      if (expense > 0) {
        const key = t.category_id ?? "__none__"
        const cat = t.category_id ? categoryMap[t.category_id] : null
        if (!catSpend[key]) {
          catSpend[key] = { name: cat?.name ?? "Uncategorised", color: cat?.color ?? "#94a3b8", value: 0 }
        }
        catSpend[key].value += expense
      }
    }
    const breakdown = Object.values(catSpend).sort((a, b) => b.value - a.value)
    const total = breakdown.reduce((s, d) => s + d.value, 0)

    let currentPct = 0
    const conicStops = breakdown.map((d) => {
      const start = currentPct
      const pct = total > 0 ? (d.value / total) * 100 : 0
      currentPct += pct
      return `${d.color} ${start}% ${currentPct}%`
    }).join(", ")

    return { totalIncome, totalExpenses, breakdown, total, conicStops }
  }, [transactions, categoryMap])

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    if (confirm(`Delete "${upload.filename}"? This cannot be undone.`)) {
      onDelete(upload.id)
    }
  }

  return (
    <Link href={`/uploads/${upload.id}`} className="block group">
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="p-5 space-y-3">
          {/* Top row */}
          <div className="flex items-center gap-4">
            <div className="shrink-0 h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate group-hover:underline">{upload.filename}</p>
              <p className="text-sm text-muted-foreground">{period ?? `Uploaded ${uploadedDate}`}</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium">{upload.transaction_count}</p>
                <p className="text-xs text-muted-foreground">transactions</p>
              </div>
              <StatusBadge status={upload.status} />
              <button
                onClick={handleDelete}
                className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label="Delete statement"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Stats + chart (only when data loaded) */}
          {stats && (
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/50">
              {/* In / Out chips */}
              <div className="flex flex-col gap-1 text-sm">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-muted-foreground w-14">Income</span>
                  <PrivacyValue className="font-mono font-medium text-green-600 dark:text-green-400">{stats.totalIncome !== 0 ? signedCurrencyLabel(stats.totalIncome) : "—"}</PrivacyValue>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-muted-foreground w-14">Expenses</span>
                  <PrivacyValue className="font-mono font-medium text-red-600 dark:text-red-400">{stats.totalExpenses !== 0 ? signedCurrencyLabel(stats.totalExpenses) : "—"}</PrivacyValue>
                </span>
              </div>

              {/* Small Donut Chart indicator and link */}
              <div className="flex flex-col items-end gap-2">
                {stats.breakdown.length > 0 && stats.conicStops && (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: `conic-gradient(${stats.conicStops})` }}
                    title="Expense breakdown"
                  >
                    <div className="w-[1.125rem] h-[1.125rem] rounded-full bg-card" />
                  </div>
                )}
                <Link
                  href="/categories"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] text-primary hover:underline"
                >
                  More insights →
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

export default function Home() {
  const [uploads, setUploads] = useState<UploadType[] | null>(null)
  const [uploadTransactions, setUploadTransactions] = useState<Record<string, StoredTransaction[]>>({})
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reclassifying, setReclassifying] = useState(false)

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories]
  )

  useEffect(() => {
    Promise.all([api.getUploads(), api.getCategories()])
      .then(([allUploads, cats]) => {
        setUploads(allUploads)
        setCategories(cats)
        // Fetch transactions for all done uploads in parallel
        const done = allUploads.filter((u) => u.status === "done")
        Promise.all(
          done.map((u) =>
            api.getUploadTransactions(u.id).then((txns) => ({ id: u.id, txns }))
          )
        ).then((results) => {
          const map: Record<string, StoredTransaction[]> = {}
          for (const { id, txns } of results) map[id] = txns as StoredTransaction[]
          setUploadTransactions(map)
        }).catch(() => { /* non-fatal: cards degrade gracefully */ })
      })
      .catch((e) => setError(e.message))
  }, [])

  function handleDelete(id: string) {
    setUploads((prev) => prev?.filter((u) => u.id !== id) ?? prev)
    api.archiveUpload(id).catch((e) => {
      setError(e.message)
      api.getUploads().then(setUploads).catch(() => { })
    })
  }

  async function handleReclassifyAll() {
    if (!uploads) return
    const done = uploads.filter((u) => u.status === "done")
    if (!done.length) return
    setReclassifying(true)
    try {
      await Promise.all(done.map((u) => api.reclassifyUpload(u.id)))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reclassification failed")
    } finally {
      setReclassifying(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Statements</h1>
        <div className="flex items-center gap-2">
          {uploads && uploads.some((u) => u.status === "done") && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReclassifyAll}
              disabled={reclassifying}
              title="Re-run classification on all uncategorised transactions"
            >
              <RefreshCw className={cn("h-4 w-4", reclassifying && "animate-spin")} />
              <span className="hidden sm:inline ml-1">{reclassifying ? "Reclassifying…" : "Reclassify all"}</span>
            </Button>
          )}
          <Button asChild>
            <Link href="/upload">
              <Upload className="h-4 w-4" />
              Upload Statement
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {!uploads && !error && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {uploads?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-lg">No statements yet</p>
            <p className="text-sm text-muted-foreground">Upload your first ANZ statement to get started</p>
          </div>
          <Button asChild>
            <Link href="/upload">
              <Upload className="h-4 w-4" />
              Upload Statement
            </Link>
          </Button>
        </div>
      )}

      {/* Uploads list */}
      {uploads && uploads.length > 0 && (
        <div className="space-y-3">
          {uploads.map((u) => (
            <UploadCard
              key={u.id}
              upload={u}
              transactions={uploadTransactions[u.id]}
              categoryMap={categoryMap}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
