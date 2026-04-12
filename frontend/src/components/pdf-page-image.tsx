"use client"

import { useState } from "react"
import type { TxnBBox } from "@/lib/types"

export interface BBoxHighlight {
    txnId: string
    bbox: TxnBBox
}

interface DraftRect { x: number; y: number; w: number; h: number }

interface Props {
    src: string
    /** PDF-point dimensions of this page — needed to convert drawn coords back to PDF space. */
    pageW: number
    pageH: number
    highlights: BBoxHighlight[]
    activeTxnId: string | null
    hoveredTxnId: string | null
    onBboxClick: (txnId: string) => void
    onBboxHover: (txnId: string | null) => void
    /** When true the user can drag to draw a new bounding box. */
    drawMode?: boolean
    /** A confirmed-but-not-yet-saved bbox shown as a green dashed preview. */
    pendingBbox?: TxnBBox | null
    onDraw?: (bbox: Omit<TxnBBox, "page">) => void
}

export function PdfPageImage({
    src,
    pageW,
    pageH,
    highlights,
    activeTxnId,
    hoveredTxnId,
    onBboxClick,
    onBboxHover,
    drawMode = false,
    pendingBbox,
    onDraw,
}: Props) {
    const [draft, setDraft] = useState<DraftRect | null>(null)
    const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)

    function pctFromMouse(e: React.MouseEvent<SVGSVGElement>) {
        const rect = e.currentTarget.getBoundingClientRect()
        return {
            x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
            y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
        }
    }

    function pctFromTouch(e: React.TouchEvent<SVGSVGElement>) {
        const touch = e.touches[0] ?? e.changedTouches[0]
        const rect = e.currentTarget.getBoundingClientRect()
        return {
            x: Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100)),
            y: Math.max(0, Math.min(100, ((touch.clientY - rect.top) / rect.height) * 100)),
        }
    }

    function startDraw(x: number, y: number) {
        setDrawStart({ x, y })
        setDraft({ x, y, w: 0, h: 0 })
    }

    function updateDraw(x: number, y: number) {
        if (!drawStart) return
        setDraft({
            x: Math.min(drawStart.x, x),
            y: Math.min(drawStart.y, y),
            w: Math.abs(x - drawStart.x),
            h: Math.abs(y - drawStart.y),
        })
    }

    function commitDraw(x: number, y: number) {
        if (!drawStart) return
        const final = {
            x: Math.min(drawStart.x, x),
            y: Math.min(drawStart.y, y),
            w: Math.abs(x - drawStart.x),
            h: Math.abs(y - drawStart.y),
        }
        setDraft(null)
        setDrawStart(null)
        if (final.w > 1 && final.h > 0.5 && onDraw) {
            onDraw({
                x1: r2((final.x / 100) * pageW),
                y1: r2((final.y / 100) * pageH),
                x2: r2(((final.x + final.w) / 100) * pageW),
                y2: r2(((final.y + final.h) / 100) * pageH),
                page_w: pageW,
                page_h: pageH,
            })
        }
    }

    return (
        <div className="relative w-full select-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="PDF page" className="w-full h-auto block" draggable={false} />

            <svg
                className="absolute inset-0 w-full h-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{ cursor: drawMode ? "crosshair" : "default", touchAction: drawMode ? "none" : undefined }}
                aria-hidden="true"
                // Mouse
                onMouseDown={(e) => { if (drawMode) { e.preventDefault(); const p = pctFromMouse(e); startDraw(p.x, p.y) } }}
                onMouseMove={(e) => { if (drawMode && drawStart) updateDraw(pctFromMouse(e).x, pctFromMouse(e).y) }}
                onMouseUp={(e) => { if (drawMode && drawStart) commitDraw(pctFromMouse(e).x, pctFromMouse(e).y) }}
                onMouseLeave={() => { if (drawStart) { setDraft(null); setDrawStart(null) } if (!drawMode) onBboxHover(null) }}
                // Touch
                onTouchStart={(e) => { if (drawMode) { e.preventDefault(); const p = pctFromTouch(e); startDraw(p.x, p.y) } }}
                onTouchMove={(e) => { if (drawMode && drawStart) { e.preventDefault(); const p = pctFromTouch(e); updateDraw(p.x, p.y) } }}
                onTouchEnd={(e) => { if (drawMode && drawStart) { e.preventDefault(); const p = pctFromTouch(e); commitDraw(p.x, p.y) } }}
            >
                {/* Existing transaction highlights */}
                {highlights.map(({ txnId, bbox }) => {
                    const x = (bbox.x1 / bbox.page_w) * 100
                    const y = (bbox.y1 / bbox.page_h) * 100
                    const w = ((bbox.x2 - bbox.x1) / bbox.page_w) * 100
                    const h = ((bbox.y2 - bbox.y1) / bbox.page_h) * 100
                    const isActive = txnId === activeTxnId
                    const isHovered = txnId === hoveredTxnId
                    return (
                        <rect
                            key={txnId}
                            x={x} y={y} width={w} height={h}
                            fill={isActive ? "rgba(245,158,11,0.30)" : isHovered ? "rgba(245,158,11,0.18)" : "rgba(245,158,11,0.07)"}
                            stroke={isActive ? "rgba(245,158,11,0.95)" : isHovered ? "rgba(245,158,11,0.70)" : "rgba(245,158,11,0.30)"}
                            strokeWidth={isActive ? 0.5 : 0.3}
                            style={{ cursor: drawMode ? "crosshair" : "pointer" }}
                            onClick={() => { if (!drawMode) onBboxClick(txnId) }}
                            onMouseEnter={() => { if (!drawMode) onBboxHover(txnId) }}
                            onMouseLeave={() => { if (!drawMode) onBboxHover(null) }}
                        />
                    )
                })}

                {/* Confirmed pending bbox (green dashed preview) */}
                {pendingBbox && (
                    <rect
                        x={(pendingBbox.x1 / pendingBbox.page_w) * 100}
                        y={(pendingBbox.y1 / pendingBbox.page_h) * 100}
                        width={((pendingBbox.x2 - pendingBbox.x1) / pendingBbox.page_w) * 100}
                        height={((pendingBbox.y2 - pendingBbox.y1) / pendingBbox.page_h) * 100}
                        fill="rgba(34,197,94,0.18)"
                        stroke="rgba(34,197,94,0.90)"
                        strokeWidth={0.6}
                        strokeDasharray="2 1"
                        pointerEvents="none"
                    />
                )}

                {/* Live draw draft */}
                {draft && draft.w > 0 && draft.h > 0 && (
                    <rect
                        x={draft.x} y={draft.y} width={draft.w} height={draft.h}
                        fill="rgba(34,197,94,0.12)"
                        stroke="rgba(34,197,94,0.85)"
                        strokeWidth={0.5}
                        strokeDasharray="2 1"
                        pointerEvents="none"
                    />
                )}
            </svg>

            {/* Draw mode hint */}
            {drawMode && !drawStart && (
                <div className="absolute top-2 inset-x-0 flex justify-center pointer-events-none">
                    <span className="bg-green-600/90 text-white text-[11px] px-2.5 py-0.5 rounded-full font-medium shadow">
                        {pendingBbox ? "Box drawn — drag to redraw" : "Drag to draw bounding box"}
                    </span>
                </div>
            )}
        </div>
    )
}

function r2(n: number) { return Math.round(n * 100) / 100 }

