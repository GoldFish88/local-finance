"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  uploading: boolean
  transactionCount: number
}

interface Stage {
  key: string
  label: string
  detail: string
  estimate: string
}

function useElapsed() {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return elapsed
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

export function LoadingScreen({ uploading, transactionCount }: Props) {
  const elapsed = useElapsed()

  const extracted = transactionCount > 0
  const classifying = extracted // transaction_count > 0 means extraction done, classification running
  const likelyVision = !extracted && elapsed > 40

  // Derive which pipeline stage we're in
  const stages: (Stage & { done: boolean; active: boolean })[] = [
    {
      key: "upload",
      label: "Upload",
      detail: "Transferring PDF to server",
      estimate: "~1s",
      done: !uploading,
      active: uploading,
    },
    {
      key: "extract",
      label: "Extraction",
      detail: likelyVision
        ? "Using vision model fallback for complex layout — this takes longer"
        : "Parsing tables with Docling",
      estimate: likelyVision ? "~1–2 min" : "~15–30s",
      done: extracted,
      active: !uploading && !extracted,
    },
    {
      key: "classify",
      label: "Classification",
      detail: transactionCount > 0
        ? `Embedding and classifying ${transactionCount} transaction${transactionCount !== 1 ? "s" : ""}`
        : "Embedding and classifying transactions",
      estimate: transactionCount > 0 ? `~${Math.max(5, transactionCount * 2)}s` : "~5–30s",
      done: false,
      active: classifying,
    },
  ]

  const activeStage = stages.find((s) => s.active)

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-10 px-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />

      {/* Stage list */}
      <ol className="space-y-4 w-full max-w-sm">
        {stages.map((stage) => (
          <li key={stage.key} className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {stage.done ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : stage.active ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : (
                <div className="h-5 w-5 rounded-full border-2 border-muted" />
              )}
            </div>
            <div className={cn("space-y-0.5", !stage.done && !stage.active && "opacity-40")}>
              <p className={cn("text-sm font-semibold", stage.active && "text-primary")}>
                {stage.label}
                {stage.active && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    est. {stage.estimate}
                  </span>
                )}
              </p>
              {(stage.active || stage.done) && (
                <p className="text-xs text-muted-foreground">{stage.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <p className="text-xs text-muted-foreground tabular-nums">
        {activeStage ? `${fmtTime(elapsed)} elapsed` : "Finishing up…"}
      </p>
    </div>
  )
}
