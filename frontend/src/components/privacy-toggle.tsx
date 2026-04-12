"use client"

import { Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePrivacy } from "@/lib/privacy-context"

export function PrivacyToggle() {
    const { privacyMode, togglePrivacy } = usePrivacy()

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={togglePrivacy}
            aria-label={privacyMode ? "Disable privacy mode" : "Enable privacy mode"}
        >
            {privacyMode ? (
                <EyeOff className="h-[1.2rem] w-[1.2rem]" />
            ) : (
                <Eye className="h-[1.2rem] w-[1.2rem]" />
            )}
        </Button>
    )
}
