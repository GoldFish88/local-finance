"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { TrendingUp, Menu, FileText, ArrowRightLeft, Tags, Upload, ChevronLeft, ChevronRight } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { PrivacyToggle } from "@/components/privacy-toggle"
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet"
import { useState } from "react"

const navLinks = [
    { href: "/transactions", label: "Transactions", icon: ArrowRightLeft },
    { href: "/statements", label: "Statements", icon: FileText },
    { href: "/categories", label: "Categories", icon: Tags },
]

export function Sidebar() {
    const pathname = usePathname()
    const [open, setOpen] = useState(false)
    const [collapsed, setCollapsed] = useState(false)

    const NavItems = ({ iconOnly = false }: { iconOnly?: boolean }) => (
        <div className="flex flex-col gap-2 w-full mt-4">
            {navLinks.map((link) => {
                const isActive = pathname === link.href || pathname?.startsWith(link.href + "/") && link.href !== "/"
                return (
                    <Button
                        key={link.href}
                        asChild
                        variant={isActive ? "secondary" : "ghost"}
                        className={iconOnly ? "justify-center px-0 w-full" : "justify-start gap-2"}
                        title={iconOnly ? link.label : undefined}
                        onClick={() => setOpen(false)}
                    >
                        <Link href={link.href}>
                            <link.icon className="h-4 w-4 shrink-0" />
                            {!iconOnly && link.label}
                        </Link>
                    </Button>
                )
            })}

            <div className="mt-4 pt-4 border-t">
                <Button
                    asChild
                    className={iconOnly ? "w-full justify-center px-0" : "w-full justify-start gap-2"}
                    title={iconOnly ? "Upload Statement" : undefined}
                    onClick={() => setOpen(false)}
                >
                    <Link href="/upload">
                        <Upload className="h-4 w-4 shrink-0" />
                        {!iconOnly && "Upload Statement"}
                    </Link>
                </Button>
            </div>
        </div>
    )

    return (
        <>
            {/* Desktop Sidebar */}
            <aside className={`hidden border-r bg-muted/20 md:flex flex-col shrink-0 h-screen sticky top-0 transition-[width] duration-200 ${collapsed ? "w-14" : "w-64"}`}>
                <div className="flex h-14 items-center border-b shrink-0 relative px-3">
                    {!collapsed && (
                        <Link href="/" className="flex items-center gap-2 font-semibold hover:opacity-80 transition-opacity flex-1 min-w-0">
                            <TrendingUp className="h-5 w-5 shrink-0" />
                            <span className="truncate">Local Finance</span>
                        </Link>
                    )}
                    {collapsed && (
                        <Link href="/" className="flex items-center justify-center w-full hover:opacity-80 transition-opacity" title="Local Finance">
                            <TrendingUp className="h-5 w-5" />
                        </Link>
                    )}
                    <button
                        onClick={() => setCollapsed((c) => !c)}
                        className={`absolute -right-3 top-1/2 -translate-y-1/2 z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-muted transition-colors ${collapsed ? "" : ""}`}
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
                    </button>
                </div>
                <div className={`flex-1 py-2 overflow-y-auto ${collapsed ? "px-1" : "px-4"}`}>
                    <NavItems iconOnly={collapsed} />
                </div>
                {!collapsed && (
                    <div className="p-4 border-t flex justify-between items-center shrink-0">
                        <span className="text-sm font-medium text-muted-foreground">Theme</span>
                        <div className="flex items-center gap-1">
                            <PrivacyToggle />
                            <ThemeToggle />
                        </div>
                    </div>
                )}
                {collapsed && (
                    <div className="p-2 border-t flex flex-col items-center gap-1 shrink-0">
                        <PrivacyToggle />
                        <ThemeToggle />
                    </div>
                )}
            </aside>

            {/* Mobile Top Header for Sheet trigger */}
            <header className="flex md:hidden h-14 shrink-0 items-center justify-between border-b px-4 bg-background/95 backdrop-blur sticky top-0 z-10 w-full">
                <Link href="/" className="flex items-center gap-2 font-semibold">
                    <TrendingUp className="h-5 w-5" />
                    <span>Local Finance</span>
                </Link>
                <div className="flex items-center gap-2">
                    <PrivacyToggle />
                    <ThemeToggle />
                    <Sheet open={open} onOpenChange={setOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="shrink-0">
                                <Menu className="h-5 w-5" />
                                <span className="sr-only">Toggle menu</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-[280px] p-0 flex flex-col h-full">
                            <SheetHeader className="p-4 border-b flex-shrink-0 text-left">
                                <SheetTitle className="flex items-center gap-2 m-0 text-lg">
                                    <TrendingUp className="h-5 w-5" />
                                    Local Finance
                                </SheetTitle>
                            </SheetHeader>
                            <div className="px-4 pb-4 flex-1 overflow-y-auto">
                                <NavItems />
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </header>
        </>
    )
}