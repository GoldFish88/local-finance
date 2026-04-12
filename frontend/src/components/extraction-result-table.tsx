"use client"

import { useState } from "react"
import { Upload, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ExtractionResult } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface Props {
  result: ExtractionResult
  onReset: () => void
}

function formatAUD(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(Math.abs(amount))
}

export function ExtractionResultTable({ result, onReset }: Props) {
  const [showRaw, setShowRaw] = useState(false)
  const { transactions, extraction_summary, transaction_count, upload_filename } = result

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Extracted Transactions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{upload_filename}</p>
          </div>
          <Button variant="outline" onClick={onReset} className="shrink-0">
            <Upload className="h-4 w-4" />
            Upload Another
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{transaction_count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">transactions found</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Docling
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{extraction_summary.docling_count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">table extraction</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Vision Fallback
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{extraction_summary.vision_fallback_count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {extraction_summary.vision_fallback_count > 0 ? "via qwen2.5vl" : "not needed"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Transaction table */}
        <Card>
          <CardContent className="p-0">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right w-[140px]">Amount</TableHead>
                  <TableHead className="text-right w-[140px]">Balance</TableHead>
                  <TableHead className="w-[110px]">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((txn, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {txn.date}
                    </TableCell>
                    <TableCell className="text-sm max-w-xs truncate" title={txn.description}>
                      {txn.description}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono text-sm font-medium",
                        txn.amount < 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-green-600 dark:text-green-400"
                      )}
                    >
                      {txn.amount < 0 ? "−" : "+"}
                      {formatAUD(txn.amount)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {txn.balance != null ? formatAUD(txn.balance) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={txn.extraction_method === "docling" ? "secondary" : "outline"}
                      >
                        {txn.extraction_method === "docling" ? "Docling" : "Vision"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Raw JSON toggle */}
        <div>
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showRaw ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showRaw ? "Hide" : "View"} raw JSON
          </button>
          {showRaw && (
            <pre className="mt-3 p-4 rounded-lg bg-muted text-xs overflow-auto max-h-96 font-mono">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>

      </div>
    </div>
  )
}
