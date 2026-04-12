"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { AlertCircle, ArrowLeft, ArrowUpDown, Check, Crosshair, Pencil, Plus, ScanSearch, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import type { Upload, StoredTransaction, Category, TxnBBox } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { PdfViewer } from "@/components/pdf-viewer"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function formatAUD(amount: number) {
  if (!isFinite(amount)) return "—"
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(
    Math.abs(amount)
  )
}


function formatTxnDate(isoDate: string) {
  if (!isoDate) return "";
  const parts = isoDate.split("T")[0].split("-");
  if (parts.length >= 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return isoDate;
}
// Convert ISO format (YYYY-MM-DD) to input display format (dd/mm/yyyy)
function formatDateForInput(isoDate: string): string {
  if (!isoDate) return ""
  const parts = isoDate.split("T")[0].split("-")
  if (parts.length >= 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return isoDate
}

// Convert input format (dd/mm/yyyy) to ISO format (YYYY-MM-DD)
function parseDateFromInput(ddmmyyyy: string): string {
  if (!ddmmyyyy) return ""
  const trimmed = ddmmyyyy.trim()
  const parts = trimmed.split("/")
  if (parts.length === 3) {
    const [day, month, year] = parts
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
  }
  return trimmed
} function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface FormState {
  date: string
  description: string
  amount: string
  balance: string
  override_amount: string
  category_id: string | null
}

const emptyForm: FormState = { date: "", description: "", amount: "", balance: "", override_amount: "", category_id: null }

// ─── Floating add panel (overlays the table, no table-row disruption) ──────────

interface AddPanelProps {
  form: FormState
  onChange: (f: FormState) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  hasBbox?: boolean
  onClearBbox?: () => void
  categories: Category[]
}

function AddPanel({ form, onChange, onSave, onCancel, saving, hasBbox, onClearBbox, categories }: AddPanelProps) {
  function field(key: keyof FormState) {
    return (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      let value = e.target.value
      if (key === "date") {
        value = parseDateFromInput(value)
      }
      onChange({ ...form, [key]: value })
    }
  }
  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 border-t bg-background shadow-[0_-4px_24px_rgba(0,0,0,0.10)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)]">
      {/* Arrow connector pointing down toward the Add trigger */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 border-b border-dashed border-green-200 dark:border-green-800 bg-green-50/60 dark:bg-green-900/10">
        <Plus className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
        <span className="text-xs font-semibold text-green-700 dark:text-green-400 flex-1">New Transaction</span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className={cn("h-7 px-2 text-xs gap-1 transition-colors", hasBbox ? "text-green-600" : "text-muted-foreground/50 hover:text-muted-foreground")}
            onClick={hasBbox ? onClearBbox : undefined}
            disabled={saving || !hasBbox}
            title={hasBbox ? "Bbox drawn — click to clear" : "Drag on the PDF to link a region"}
          >
            <Crosshair className="h-3.5 w-3.5" />
            {hasBbox ? "Bbox linked" : "No bbox"}
          </Button>
          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white px-3" onClick={onSave} disabled={saving}>
            <Check className="h-3.5 w-3.5 mr-1" />Save
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel} disabled={saving}>
            <X className="h-3.5 w-3.5 mr-1" />Cancel
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-[130px_1fr_90px_90px_90px_1fr] gap-2 px-3 py-2.5">
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">Date</label>
          <Input type="text" value={formatDateForInput(form.date)} onChange={field("date")} placeholder="dd/mm/yyyy" className="h-7 text-xs px-2" />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">Description</label>
          <Input value={form.description} onChange={field("description")} placeholder="Description" className="h-7 text-xs" />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">Amount</label>
          <Input type="number" step="0.01" value={form.amount} onChange={field("amount")} placeholder="0.00" className="h-7 text-xs text-right" />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">My Share</label>
          <Input type="number" step="0.01" value={form.override_amount} onChange={field("override_amount")} placeholder="—" className="h-7 text-xs text-right" />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">Balance</label>
          <Input type="number" step="0.01" value={form.balance} onChange={field("balance")} placeholder="—" className="h-7 text-xs text-right" />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">Category</label>
          <select
            value={form.category_id || ""}
            onChange={field("category_id")}
            className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Uncategorised</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

// ─── Edit row (inline, replaces existing row in place) ────────────────────────

interface AddRowProps {
  form: FormState
  onChange: (f: FormState) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  hasBbox?: boolean
  onClearBbox?: () => void
  categories: Category[]
}

function AddRow({ form, onChange, onSave, onCancel, saving, hasBbox, onClearBbox, categories }: AddRowProps) {
  function field(key: keyof FormState) {
    return (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      let value = e.target.value
      if (key === "date") {
        value = parseDateFromInput(value)
      }
      onChange({ ...form, [key]: value })
    }
  }
  return (
    <TableRow className="bg-blue-50/60 dark:bg-blue-900/10">
      <TableCell className="py-1 pr-1">
        <Input type="text" value={formatDateForInput(form.date)} onChange={field("date")} placeholder="dd/mm/yyyy" className="h-7 w-[130px] text-xs px-2" />
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input value={form.description} onChange={field("description")} placeholder="Description" className="h-7 text-xs min-w-[120px]" />
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input type="number" step="0.01" value={form.amount} onChange={field("amount")} placeholder="0.00" className="h-7 w-[80px] text-xs text-right ml-auto" />
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input type="number" step="0.01" value={form.override_amount} onChange={field("override_amount")} placeholder="Optional" className="h-7 w-[80px] text-xs text-right ml-auto" />
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input type="number" step="0.01" value={form.balance} onChange={field("balance")} placeholder="Optional" className="h-7 w-[80px] text-xs text-right ml-auto" />
      </TableCell>
      <TableCell className="py-1 px-1">
        <select
          value={form.category_id || ""}
          onChange={field("category_id")}
          className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">Uncategorised</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </TableCell>
      <TableCell className="py-1 pl-1">
        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className={cn("h-7 w-7 transition-colors", hasBbox ? "text-green-600" : "text-muted-foreground/40 hover:text-muted-foreground")}
            onClick={hasBbox ? onClearBbox : undefined}
            disabled={saving || !hasBbox}
            title={hasBbox ? "Bbox drawn — click to clear" : "Drag on the PDF to draw a box"}
          >
            <Crosshair className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:text-green-700" onClick={onSave} disabled={saving} title="Save">
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={onCancel} disabled={saving} title="Cancel">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ─── Sort types ─────────────────────────────────────────────────────────────
type ReviewSortKey = "date" | "description" | "amount" | "category"
type ReviewSortConfig = { key: ReviewSortKey; direction: "asc" | "desc" } | null

// ─── Shared inline input style ─────────────────────────────────────────────────

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>()
  const [upload, setUpload] = useState<Upload | null>(null)
  const [transactions, setTransactions] = useState<StoredTransaction[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  // Full-row editing
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState | null>(null)

  // Add state
  const [isAdding, setIsAdding] = useState(false)
  const [addForm, setAddForm] = useState<FormState>(emptyForm)

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Sort
  const [sortConfig, setSortConfig] = useState<ReviewSortConfig>(null)

  // PDF viewer — active/hovered transaction linkage
  const [activeTxnId, setActiveTxnId] = useState<string | null>(null)
  const [hoveredTxnId, setHoveredTxnId] = useState<string | null>(null)
  const tableRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})

  // Bbox for the active add/edit row
  const [drawingBbox, setDrawingBbox] = useState<TxnBBox | null>(null)

  const [categories, setCategories] = useState<Category[]>([])

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories]
  )

  useEffect(() => {
    Promise.all([api.getUpload(id), api.getUploadTransactions(id), api.getCategories()])
      .then(([u, txns, cats]) => {
        setUpload(u)
        setTransactions(txns)
        setCategories(cats)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  async function handleDelete(txnId: string) {
    setDeletingId(txnId)
    setMutationError(null)
    try {
      await api.deleteTransaction(id, txnId)
      setTransactions((prev) => prev?.filter((t) => t.id !== txnId) ?? null)
    } catch (e: unknown) {
      setMutationError(e instanceof Error ? e.message : "Failed to delete")
    } finally {
      setDeletingId(null)
    }
  }

  function startAdd() {
    setMutationError(null)
    setIsAdding(true)
    setAddForm(emptyForm)
    setDrawingBbox(null)
    setEditingRowId(null)
    setEditForm(null)
  }

  async function saveAdd() {
    setSaving(true)
    setMutationError(null)
    try {
      const created = await api.createTransaction(id, {
        date: addForm.date,
        description: addForm.description,
        amount: parseFloat(addForm.amount),
        balance: addForm.balance !== "" ? parseFloat(addForm.balance) : undefined,
        bbox: drawingBbox ?? undefined,
      })
      let finalTxn = created
      if (addForm.override_amount !== "") {
        const v = parseFloat(addForm.override_amount)
        if (isFinite(v)) finalTxn = await api.setOverrideAmount(id, finalTxn.id, v)
      }
      if (addForm.category_id) {
        finalTxn = await api.assignCategory(id, finalTxn.id, addForm.category_id, true)
      }
      setTransactions((prev) => (prev ? [finalTxn, ...prev] : [finalTxn]))
      setIsAdding(false)
      setAddForm(emptyForm)
      setDrawingBbox(null)
    } catch (e: unknown) {
      setMutationError(e instanceof Error ? e.message : "Failed to create transaction")
    } finally {
      setSaving(false)
    }
  }

  function startEdit(txn: StoredTransaction) {
    setEditingRowId(txn.id)
    setEditForm({
      date: txn.date,
      description: txn.description,
      amount: String(txn.amount),
      balance: txn.balance != null ? String(txn.balance) : "",
      override_amount: txn.override_amount !== null ? String(txn.override_amount) : "",
      category_id: txn.category_id ?? null,
    })
    setIsAdding(false)
    setDrawingBbox(null)
    setMutationError(null)
  }

  async function saveEdit(txnId: string) {
    if (!editForm) return
    setSaving(true)
    setMutationError(null)
    try {
      let updated = await api.updateTransaction(id, txnId, {
        date: editForm.date,
        description: editForm.description,
        amount: parseFloat(editForm.amount),
        balance: editForm.balance !== "" ? parseFloat(editForm.balance) : undefined,
        bbox: drawingBbox ?? undefined,
      })
      const newOverride = editForm.override_amount !== "" ? parseFloat(editForm.override_amount) : null
      if (newOverride !== updated.override_amount) {
        updated = await api.setOverrideAmount(id, txnId, newOverride)
      }
      const newCatId = editForm.category_id ?? null
      if (newCatId !== updated.category_id) {
        updated = await api.assignCategory(id, txnId, newCatId, true)
      }
      setTransactions((prev) => prev?.map((t) => (t.id === txnId ? updated : t)) ?? null)
      setEditingRowId(null)
      setEditForm(null)
      setDrawingBbox(null)
    } catch (e: unknown) {
      setMutationError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const busy = saving || deletingId !== null
  const router = useRouter()

  const requestSort = (key: ReviewSortKey) => {
    setSortConfig((prev) =>
      prev?.key === key && prev.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" }
    )
  }

  const sortHead = (label: string, key: ReviewSortKey, right = false) => (
    <TableHead
      className={cn("cursor-pointer select-none py-2", right ? "text-right w-[110px]" : "")}
      onClick={() => requestSort(key)}
    >
      <div className={cn("flex items-center gap-1 hover:text-foreground", right && "justify-end")}>
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      </div>
    </TableHead>
  )

  // When a bbox on the PDF is clicked, scroll the matching table row into view
  function handleBboxClick(txnId: string) {
    setActiveTxnId(txnId)
    const el = tableRowRefs.current[txnId]
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }

  // Called when user finishes drawing a rect on any PDF page
  function handleDraw(bbox: TxnBBox) {
    setDrawingBbox(bbox)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0 bg-background">
        <Button variant="ghost" size="sm" asChild className="-ml-1">
          <Link href={`/uploads/${id}`}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        <ScanSearch className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          {upload ? (
            <span className="text-sm font-semibold truncate block">{upload.filename}</span>
          ) : (
            <Skeleton className="h-4 w-48" />
          )}
        </div>
        {mutationError && (
          <div className="flex items-center gap-1.5 text-xs text-destructive shrink-0">
            <AlertCircle className="h-3.5 w-3.5" />
            {mutationError}
          </div>
        )}
        <div className="h-5 w-px bg-border" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/uploads/${id}`)}
          title="Skip review — go straight to the statement"
        >
          Skip
        </Button>
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white"
          onClick={() => router.push(`/uploads/${id}`)}
          title="Mark as reviewed and go to the statement"
        >
          <Check className="h-4 w-4" />
          <span className="hidden sm:inline ml-1">Done Reviewing</span>
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive px-4 py-2 border-b shrink-0">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Split view */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* ── PDF panel ── */}
        <div className="h-[45vh] shrink-0 lg:h-auto lg:w-2/5 border-b lg:border-b-0 lg:border-r flex flex-col overflow-hidden relative">
          <div className="text-xs font-medium px-3 py-1.5 border-b bg-muted/30 shrink-0 flex items-center gap-1.5">
            {isAdding || editingRowId !== null ? (
              <>
                <Crosshair className="h-3 w-3 text-green-600 shrink-0" />
                <span className="text-green-600 font-semibold">
                  {drawingBbox ? "Box drawn — drag to redraw" : "Drag on the PDF to place a box"}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Original Statement</span>
            )}
          </div>
          {transactions && (
            <PdfViewer
              uploadId={id}
              transactions={transactions}
              activeTxnId={activeTxnId}
              hoveredTxnId={hoveredTxnId}
              onBboxClick={handleBboxClick}
              onBboxHover={setHoveredTxnId}
              drawMode={isAdding || editingRowId !== null}
              pendingBbox={drawingBbox}
              onDraw={handleDraw}
            />
          )}

          {/* Floating action button — over the PDF, always visible */}
          {!isAdding && !editingRowId && (
            <Button
              size="default"
              className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 gap-2 shadow-lg px-5 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => !busy && !loading && startAdd()}
              disabled={busy || loading}
            >
              <Plus className="h-4 w-4" />
              Add transaction
            </Button>
          )}
        </div>

        {/* ── Table panel ── */}
        <div className="flex-1 lg:w-3/5 flex flex-col overflow-hidden min-h-0 relative">
          <div className="text-xs font-medium text-muted-foreground px-3 py-1.5 border-b bg-muted/30 shrink-0 flex items-center gap-2 flex-wrap">
            <span>Parsed Transactions</span>
            {transactions && (
              <Badge variant="secondary" className="text-xs py-0">
                {transactions.length}
              </Badge>
            )}
            {transactions && transactions.length > 0 && (() => {
              const totalIn = transactions.filter(t => isFinite(t.amount) && t.amount > 0).reduce((s, t) => s + t.amount, 0)
              const totalOut = transactions.filter(t => isFinite(t.amount) && t.amount < 0).reduce((s, t) => s + t.amount, 0)
              return (
                <>
                  <span className="ml-auto flex items-center gap-3">
                    <span className="text-green-600 dark:text-green-400">
                      +{new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(totalIn)}
                    </span>
                    <span className="text-red-600 dark:text-red-400">
                      −{new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Math.abs(totalOut))}
                    </span>
                  </span>
                </>
              )
            })()}
          </div>

          <div className="text-[10px] px-3 py-1.5 bg-muted/10 border-b flex gap-4 text-muted-foreground shrink-0 font-medium">
            <span className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-[3px] bg-amber-50 dark:bg-amber-900/50 border border-amber-200 dark:border-amber-800" />
              Needs review
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-[3px] bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700" />
              Low confidence match
            </span>
          </div>

          <div className={cn("flex-1 overflow-auto transition-[padding]", isAdding && "pb-[148px]")}>
            {loading ? (
              <div className="p-3 space-y-2">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow className="text-xs">
                    {sortHead("Date", "date")}
                    {sortHead("Description", "description")}
                    {sortHead("Amount", "amount", true)}
                    <TableHead className="text-right w-[100px] py-2">My Share</TableHead>
                    <TableHead className="text-right w-[110px] py-2">Balance</TableHead>
                    {sortHead("Category", "category")}
                    <TableHead className="w-[36px] py-2" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const txns = (() => {
                      const base = transactions ?? []
                      if (!sortConfig) return base
                      return [...base].sort((a, b) => {
                        const aVal: string | number = sortConfig.key === "amount" ? a.amount
                          : sortConfig.key === "category" ? (a.category_name ?? "")
                            : (a[sortConfig.key as "date" | "description"] ?? "")
                        const bVal: string | number = sortConfig.key === "amount" ? b.amount
                          : sortConfig.key === "category" ? (b.category_name ?? "")
                            : (b[sortConfig.key as "date" | "description"] ?? "")
                        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1
                        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1
                        return 0
                      })
                    })()

                    if (txns.length === 0 && !isAdding) {
                      return (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-16 text-sm">
                            No transactions — click Add to create one
                          </TableCell>
                        </TableRow>
                      )
                    }

                    return txns.map((txn) => {
                      const isDeleting = deletingId === txn.id
                      const needsReview = txn.status === "pending_review"
                      const lowConfidence = txn.status === "auto_classified" && typeof txn.similarity_score === "number" && txn.similarity_score < 0.5
                      const isActive = activeTxnId === txn.id
                      const isHovered = hoveredTxnId === txn.id
                      const amt = txn.amount

                      if (editingRowId === txn.id && editForm) {
                        return (
                          <AddRow
                            key={txn.id}
                            form={editForm}
                            onChange={setEditForm}
                            onSave={() => saveEdit(txn.id)}
                            onCancel={() => { setEditingRowId(null); setEditForm(null); setDrawingBbox(null); setMutationError(null) }}
                            saving={saving}
                            hasBbox={drawingBbox !== null}
                            onClearBbox={() => setDrawingBbox(null)}
                            categories={categories}
                          />
                        )
                      }

                      return (
                        <TableRow
                          key={txn.id}
                          ref={(el) => { tableRowRefs.current[txn.id] = el }}
                          className={cn(
                            "text-xs group",
                            isDeleting && "opacity-40 pointer-events-none",
                            isActive && "ring-1 ring-inset ring-amber-400",
                            isHovered && !isActive && "bg-amber-50/40 dark:bg-amber-900/10",
                            needsReview && "bg-amber-50/60 dark:bg-amber-900/10",
                            lowConfidence && !needsReview && "bg-neutral-100/50 dark:bg-neutral-800/30",
                          )}
                          onMouseEnter={() => { if (!isAdding) { setHoveredTxnId(txn.id); setActiveTxnId(txn.id) } }}
                          onMouseLeave={() => { if (!isAdding) setHoveredTxnId(null) }}
                        >
                          {/* Date */}
                          <TableCell className="font-mono text-muted-foreground whitespace-nowrap py-1.5 pl-3 pr-1">
                            {formatTxnDate(txn.date)}
                          </TableCell>

                          {/* Description */}
                          <TableCell className="py-1.5 px-3 max-w-[200px]">
                            <span className="truncate block" title={txn.description}>{txn.description}</span>
                          </TableCell>

                          {/* Amount */}
                          <TableCell className="text-right py-1.5 px-1">
                            <span className={cn(
                              "font-mono font-medium whitespace-nowrap",
                              !isFinite(amt) ? "text-amber-600" : amt < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                            )}>
                              {!isFinite(amt) ? "—" : `${amt < 0 ? "−" : "+"}${formatAUD(amt)}`}
                            </span>
                          </TableCell>

                          {/* My Share */}
                          <TableCell className="text-right py-1.5 px-1">
                            {txn.override_amount !== null ? (
                              <span className={cn(
                                "font-mono font-medium whitespace-nowrap",
                                txn.override_amount < 0 ? "text-red-500 dark:text-red-400" : "text-green-600 dark:text-green-400"
                              )}>
                                {txn.override_amount < 0 ? "−" : "+"}{formatAUD(txn.override_amount)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </TableCell>

                          {/* Balance */}
                          <TableCell className="text-right font-mono text-muted-foreground py-1.5 px-1">
                            {txn.balance != null ? formatAUD(txn.balance) : "—"}
                          </TableCell>

                          {/* Category */}
                          <TableCell className="py-1.5 px-1">
                            {txn.category_name ? (
                              <Badge
                                variant="secondary"
                                className="text-xs border-transparent"
                                style={(() => {
                                  const color = txn.category_id ? categoryMap[txn.category_id]?.color : null
                                  return color ? { backgroundColor: hexToRgba(color, 0.15), color } : undefined
                                })()}
                              >
                                {txn.category_name}
                              </Badge>
                            ) : (
                              <span className={cn(
                                "text-xs font-medium",
                                txn.status === "pending_review" ? "text-amber-600" : "text-muted-foreground/50",
                              )}>
                                {txn.status === "pending_review" ? "Review" : "—"}
                              </span>
                            )}
                          </TableCell>

                          {/* Actions: Edit + Delete */}
                          <TableCell className="py-1.5 pl-0 pr-2">
                            <div className="flex items-center justify-end">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-blue-600"
                                onClick={() => startEdit(txn)}
                                disabled={busy || isAdding || editingRowId !== null}
                                title="Edit row"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                onClick={() => handleDelete(txn.id)}
                                disabled={busy || isAdding || editingRowId !== null}
                                title="Delete"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  })()}

                </TableBody>
              </Table>
            )}
          </div>

          {/* Floating add panel — slides up from bottom */}
          {isAdding && (
            <AddPanel
              form={addForm}
              onChange={setAddForm}
              onSave={saveAdd}
              onCancel={() => { setIsAdding(false); setDrawingBbox(null); setMutationError(null); setHoveredTxnId(null) }}
              saving={saving}
              hasBbox={drawingBbox !== null}
              onClearBbox={() => setDrawingBbox(null)}
              categories={categories}
            />
          )}
        </div>
      </div >
    </div >
  )
}
