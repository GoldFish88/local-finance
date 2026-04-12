import { useState, useRef, useEffect } from "react"
import { Category } from "@/lib/types"
import { Search, Check, Ban } from "lucide-react"

interface CategoryPickerProps {
  categories: Category[];
  currentCategoryId?: string | null;
  onAssign: (categoryId: string | null, learn: boolean) => void;
  onClose: () => void;
}

export function CategoryPicker({ categories, currentCategoryId, onAssign, onClose }: CategoryPickerProps) {
  const [search, setSearch] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Listen for Escape key
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose])

  const filtered = categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div
      ref={containerRef}
      className="absolute z-50 mt-1 w-64 rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95"
      style={{ left: "auto", right: 0 }}
    >
      <div className="flex items-center border-b px-3">
        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
        <input
          autoFocus
          className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Search category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="max-h-[250px] overflow-y-auto p-1">
        <div className="text-[10px] font-medium text-muted-foreground px-2 py-1.5 uppercase tracking-wider">
          Assign
        </div>

        {/* Unassign option */}
        <button
          className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
          onClick={() => onAssign(null, true)}
        >
          {currentCategoryId == null && (
            <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
              <Check className="h-4 w-4" />
            </span>
          )}
          <span className="text-muted-foreground italic">Unassigned</span>
        </button>

        {filtered.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No category found.</div>
        ) : (
          filtered.map(cat => (
            <div
              key={cat.id}
              className="group relative flex w-full items-center justify-between rounded-sm py-1 pl-8 pr-1 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
              onClick={() => onAssign(cat.id, true)}
            >
              {currentCategoryId === cat.id && (
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  <Check className="h-4 w-4" />
                </span>
              )}

              {/* Left side: Category Name */}
              <span className="truncate flex-1 text-left select-none">{cat.name}</span>

              {/* Right side: One-off button (shows on hover) */}
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 ml-2 transition-opacity">
                <button
                  className="flex items-center gap-1 text-[10px] bg-background border shadow-sm px-1.5 py-0.5 rounded-sm hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAssign(cat.id, false)
                  }}
                  title="Assign as one-off (do not learn)"
                >
                  <Ban className="h-3 w-3" />
                  One-off
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
