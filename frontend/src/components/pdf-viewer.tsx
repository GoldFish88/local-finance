"use client"

import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { PdfPagesResponse, StoredTransaction, TxnBBox } from "@/lib/types"
import { PdfPageImage } from "@/components/pdf-page-image"
import { Skeleton } from "@/components/ui/skeleton"

interface Props {
    uploadId: string
    transactions: StoredTransaction[]
    activeTxnId: string | null
    hoveredTxnId: string | null
    onBboxClick: (txnId: string) => void
    onBboxHover: (txnId: string | null) => void
    /** When true, enables draw mode on all pages so the user can drag to create a bbox. */
    drawMode?: boolean
    /** A confirmed-but-unsaved bbox to show as a green dashed preview. */
    pendingBbox?: TxnBBox | null
    /** Fired when the user finishes drawing a rect; bbox includes the page number. */
    onDraw?: (bbox: TxnBBox) => void
}

export function PdfViewer({
    uploadId,
    transactions,
    activeTxnId,
    hoveredTxnId,
    onBboxClick,
    onBboxHover,
    drawMode = false,
    pendingBbox,
    onDraw,
}: Props) {
    const [pdfPages, setPdfPages] = useState<PdfPagesResponse | null>(null)
    const [error, setError] = useState(false)
    const pageRefs = useRef<(HTMLDivElement | null)[]>([])

    useEffect(() => {
        setPdfPages(null)
        setError(false)
        api.getPdfPageCount(uploadId)
            .then(setPdfPages)
            .catch(() => setError(true))
    }, [uploadId])

    // Auto-scroll to the page containing the active transaction
    useEffect(() => {
        if (!activeTxnId) return
        const txn = transactions.find((t) => t.id === activeTxnId)
        if (!txn?.bbox) return
        const el = pageRefs.current[txn.bbox.page]
        el?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }, [activeTxnId, transactions])

    if (error) {
        return (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-6">
                Could not load PDF pages.
            </div>
        )
    }

    if (pdfPages === null) {
        return (
            <div className="flex-1 overflow-auto p-2 space-y-2">
                <Skeleton className="w-full aspect-[1/1.414]" />
            </div>
        )
    }

    return (
        <div className="flex-1 overflow-auto bg-muted/20">
            {pdfPages.pages.map((pageInfo, pageIdx) => {
                const pageHighlights = transactions
                    .filter((t) => t.bbox?.page === pageIdx)
                    .map((t) => ({ txnId: t.id, bbox: t.bbox! }))

                // Only show the pending bbox preview on the page it belongs to
                const pagePendingBbox = pendingBbox?.page === pageIdx ? pendingBbox : null

                return (
                    <div
                        key={pageIdx}
                        ref={(el) => { pageRefs.current[pageIdx] = el }}
                        className="border-b last:border-b-0"
                    >
                        <PdfPageImage
                            src={api.getPdfPageUrl(uploadId, pageIdx)}
                            pageW={pageInfo.width_pt}
                            pageH={pageInfo.height_pt}
                            highlights={pageHighlights}
                            activeTxnId={activeTxnId}
                            hoveredTxnId={hoveredTxnId}
                            onBboxClick={onBboxClick}
                            onBboxHover={onBboxHover}
                            drawMode={drawMode}
                            pendingBbox={pagePendingBbox}
                            onDraw={(partial) => onDraw?.({ ...partial, page: pageIdx })}
                        />
                    </div>
                )
            })}
        </div>
    )
}

