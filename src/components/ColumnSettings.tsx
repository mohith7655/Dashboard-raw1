import { useState } from 'react'
import { ArrowDown, ArrowUp, Settings2 } from 'lucide-react'

interface ColumnSettingsProps {
  columns: { key: string; label: string }[]
  order: string[]
  onMove: (source: string, target: string) => void
}

/** A compact, touch friendly way to arrange a table's columns. */
export function ColumnSettings({ columns, order, onMove }: ColumnSettingsProps) {
  const [open, setOpen] = useState(false)
  const byKey = new Map(columns.map((column) => [column.key, column]))
  const ordered = order.map((key) => byKey.get(key)).filter((column) => column !== undefined)

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Set up table columns"
        aria-expanded={open}
        title="Set up table columns"
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-btn-border bg-btn text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#777]"
      >
        <Settings2 size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-[min(19rem,calc(100vw-2rem))] rounded-lg border border-line bg-card p-3 shadow-xl">
          <p className="mb-2 text-[12px] font-semibold text-ink">Set up columns</p>
          <p className="mb-2 text-[11px] text-muted">Move columns with the arrows.</p>
          <ol className="max-h-[min(60vh,24rem)] space-y-1 overflow-y-auto">
            {ordered.map((column, index) => (
              <li key={column.key} className="flex min-h-9 items-center justify-between gap-2 rounded-md px-2 hover:bg-[#1b1b1f]">
                <span className="min-w-0 truncate text-[12px] text-ink">{column.label}</span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${column.label} left`}
                    title="Move left"
                    disabled={index === 0}
                    onClick={() => onMove(column.key, ordered[index - 1].key)}
                    className="flex h-7 w-7 items-center justify-center rounded border border-btn-border text-muted hover:text-ink disabled:opacity-30"
                  ><ArrowUp size={13} /></button>
                  <button
                    type="button"
                    aria-label={`Move ${column.label} right`}
                    title="Move right"
                    disabled={index === ordered.length - 1}
                    onClick={() => onMove(ordered[index + 1].key, column.key)}
                    className="flex h-7 w-7 items-center justify-center rounded border border-btn-border text-muted hover:text-ink disabled:opacity-30"
                  ><ArrowDown size={13} /></button>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
