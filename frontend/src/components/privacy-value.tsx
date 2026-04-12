"use client"

import { useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { usePrivacy } from "@/lib/privacy-context"

interface PrivacyValueProps {
    children: React.ReactNode
    className?: string
}

const REVEAL_DURATION_MS = 2000

export function PrivacyValue({ children, className }: PrivacyValueProps) {
    const { privacyMode } = usePrivacy()
    const [revealed, setRevealed] = useState(false)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    if (!privacyMode) {
        return <span className={className}>{children}</span>
    }

    function handleClick(e: React.MouseEvent) {
        e.preventDefault()
        e.stopPropagation()
        if (timerRef.current) clearTimeout(timerRef.current)
        setRevealed(true)
        timerRef.current = setTimeout(() => setRevealed(false), REVEAL_DURATION_MS)
    }

    return (
        <span
            className={cn(
                "transition-[filter] duration-300 cursor-pointer select-none",
                !revealed && "blur-sm",
                className
            )}
            onClick={handleClick}
            title="Click to reveal"
        >
            {children}
        </span>
    )
}
