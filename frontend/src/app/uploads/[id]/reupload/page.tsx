"use client"

import { useCallback, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
    AlertCircle,
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    FileUp,
    Info,
    Loader2,
    UploadCloud,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import type { ReuploadPreviewResponse } from "@/lib/types"
import { Button } from "@/components/ui/button"

function formatAUD(n: number) {
    if (!isFinite(n)) return "—"
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Math.abs(n))
}

function formatDate(iso: string) {
    if (!iso) return "—"
    const parts = iso.split("T")[0].split("-")
    if (parts.length >= 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
    return iso
}

type Step = "drop" | "previewing" | "review" | "confirming" | "done"

export default function ReuploadPage() {
    const { id } = useParams<{ id: string }>()

    const [step, setStep] = useState<Step>("drop")
    const [file, setFile] = useState<File | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const [preview, setPreview] = useState<ReuploadPreviewResponse | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [confirmResult, setConfirmResult] = useState<{ added: number; classified: number } | null>(null)

    const inputRef = useRef<HTMLInputElement>(null)

    // ── File selection ────────────────────────────────────────────────────────

    const handleFile = useCallback(
        async (f: File) => {
            if (!f.name.toLowerCase().endsWith(".pdf")) {
                setError("Only PDF files are accepted.")
                return
            }
            setError(null)
            setFile(f)
            setStep("previewing")
            try {
                const result = await api.reuploadPreview(id, f)
                setPreview(result)
                setStep("review")
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Preview failed")
                setStep("drop")
            }
        },
        [id]
    )

    function onDrop(e: React.DragEvent) {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files[0]
        if (f) handleFile(f)
    }

    function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0]
        if (f) handleFile(f)
    }

    // ── Confirm ───────────────────────────────────────────────────────────────

    async function handleConfirm() {
        if (!file) return
        setError(null)
        setStep("confirming")
        try {
            const result = await api.reuploadConfirm(id, file)
            setConfirmResult({ added: result.added_count, classified: result.classified_count })
            setStep("done")
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Confirm failed")
            setStep("review")
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
            {/* Back nav */}
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild className="-ml-2">
                    <Link href={`/uploads/${id}`}>
                        <ArrowLeft className="h-4 w-4" />
                        Back to statement
                    </Link>
                </Button>
            </div>

            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <FileUp className="h-6 w-6 text-muted-foreground" />
                    Re-upload statement
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Upload a new version of the PDF. Only new transactions will be added — existing rows
                    are never modified or deleted.
                </p>
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* ── Step: drop ─────────────────────────────────────────────────────── */}
            {(step === "drop" || step === "previewing") && (
                <div
                    className={cn(
                        "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-8 py-16 text-center cursor-pointer transition-colors",
                        dragOver
                            ? "border-primary bg-primary/5"
                            : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"
                    )}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    onClick={() => inputRef.current?.click()}
                >
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={onInputChange}
                    />
                    {step === "previewing" ? (
                        <>
                            <Loader2 className="h-10 w-10 text-muted-foreground animate-spin mb-3" />
                            <p className="text-sm font-medium">Extracting transactions…</p>
                            <p className="text-xs text-muted-foreground mt-1">This may take a few seconds</p>
                        </>
                    ) : (
                        <>
                            <UploadCloud className="h-10 w-10 text-muted-foreground mb-3" />
                            <p className="text-sm font-medium">Drop PDF here or click to browse</p>
                            <p className="text-xs text-muted-foreground mt-1">Max 50 MB</p>
                        </>
                    )}
                </div>
            )}

            {/* ── Step: review ───────────────────────────────────────────────────── */}
            {(step === "review" || step === "confirming") && preview && (
                <div className="space-y-4">
                    {/* Filename warning */}
                    {preview.filename_changed && (
                        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>
                                <strong>Different filename detected.</strong> Original:{" "}
                                <code className="font-mono text-xs">{preview.original_filename}</code>, new:{" "}
                                <code className="font-mono text-xs">{preview.new_filename}</code>. Make sure
                                you selected the correct file.
                            </span>
                        </div>
                    )}

                    {/* Date range warning */}
                    {preview.date_range_warning && (
                        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            {preview.date_range_warning}
                        </div>
                    )}

                    {/* Summary row */}
                    <div className="flex flex-wrap gap-3">
                        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 min-w-[130px]">
                            <div>
                                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                                    {preview.new_count}
                                </p>
                                <p className="text-xs text-muted-foreground">New rows to add</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 min-w-[130px]">
                            <div>
                                <p className="text-2xl font-bold text-muted-foreground">
                                    {preview.existing_count}
                                </p>
                                <p className="text-xs text-muted-foreground">Already in statement</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 min-w-[130px]">
                            <div>
                                <p className="text-2xl font-bold">{preview.total_in_file}</p>
                                <p className="text-xs text-muted-foreground">Total in file</p>
                            </div>
                        </div>
                    </div>

                    {preview.new_count === 0 ? (
                        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
                            <Info className="h-4 w-4 shrink-0" />
                            No new transactions found — this file appears identical to what&apos;s already
                            stored. Nothing would change if you confirm.
                        </div>
                    ) : (
                        <>
                            <h2 className="text-sm font-semibold">
                                New transactions that will be added ({preview.new_count})
                            </h2>
                            <div className="rounded-lg border overflow-hidden divide-y">
                                {preview.new_transactions.map((txn) => {
                                    const amt = Number(txn.amount)
                                    const bal = txn.balance !== null ? Number(txn.balance) : null
                                    return (
                                        <div key={txn.dedup_hash} className="px-4 py-2.5">
                                            <div className="flex items-start justify-between gap-3">
                                                <span className="text-sm min-w-0 flex-1 truncate" title={txn.description}>
                                                    {txn.description}
                                                </span>
                                                <span
                                                    className={cn(
                                                        "font-mono text-sm font-medium whitespace-nowrap shrink-0",
                                                        amt < 0
                                                            ? "text-red-600 dark:text-red-400"
                                                            : "text-green-600 dark:text-green-400"
                                                    )}
                                                >
                                                    {amt < 0 ? "−" : "+"}
                                                    {formatAUD(amt)}
                                                </span>
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                                                <span className="font-mono">{formatDate(String(txn.date))}</span>
                                                {bal !== null && (
                                                    <span className="font-mono">bal: {formatAUD(bal)}</span>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-3 pt-1">
                        <Button
                            onClick={handleConfirm}
                            disabled={step === "confirming"}
                            className="bg-green-600 hover:bg-green-700 text-white"
                        >
                            {step === "confirming" ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Saving…
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                    {preview.new_count === 0 ? "Nothing to add — go back" : `Add ${preview.new_count} transaction${preview.new_count !== 1 ? "s" : ""}`}
                                </>
                            )}
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => { setStep("drop"); setPreview(null); setFile(null); setError(null) }}
                            disabled={step === "confirming"}
                        >
                            Choose a different file
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Step: done ─────────────────────────────────────────────────────── */}
            {step === "done" && confirmResult && (
                <div className="space-y-4">
                    <div className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 px-5 py-4 text-sm text-green-800 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300">
                        <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
                        <div>
                            <p className="font-semibold text-base">Statement updated</p>
                            {confirmResult.added > 0 ? (
                                <p className="mt-1">
                                    Added{" "}
                                    <strong>{confirmResult.added}</strong>{" "}
                                    new transaction{confirmResult.added !== 1 ? "s" : ""}.{" "}
                                    {confirmResult.classified > 0 && (
                                        <span>{confirmResult.classified} classified automatically.</span>
                                    )}
                                </p>
                            ) : (
                                <p className="mt-1">No new transactions — the statement is already up to date.</p>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Button asChild>
                            <Link href={`/uploads/${id}`}>View statement</Link>
                        </Button>
                        <Button variant="outline" asChild>
                            <Link href={`/uploads/${id}/review`}>Review PDF</Link>
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
