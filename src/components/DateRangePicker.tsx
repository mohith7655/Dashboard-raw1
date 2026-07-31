import { useEffect, useRef, useState } from 'react'
import { Calendar, Check } from 'lucide-react'
import type { DateRange, PresetId } from '../lib/types'
import { PRESETS, formatRangeLabel, rangeFromPreset } from '../lib/dateRange'

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ start: value.start, end: value.end })
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraft({ start: value.start, end: value.end })
  }, [value.start, value.end])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selectPreset = (preset: PresetId) => {
    if (preset === 'custom') {
      setDraft({ start: value.start, end: value.end })
      return
    }
    onChange(rangeFromPreset(preset))
    setOpen(false)
  }

  const applyCustom = () => {
    const start = draft.start <= draft.end ? draft.start : draft.end
    const end = draft.start <= draft.end ? draft.end : draft.start
    onChange({ start, end, preset: 'custom' })
    setOpen(false)
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-btn-border bg-btn px-3 py-2 text-[13px] text-ink transition-colors hover:border-[#3a3a40]"
      >
        <Calendar size={14} className="text-muted" />
        <span className="whitespace-nowrap">{formatRangeLabel(value)}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Select date range"
          className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-line bg-card p-2 shadow-xl shadow-black/40"
        >
          {PRESETS.filter((p) => p.id !== 'custom').map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => selectPreset(preset.id)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] text-ink transition-colors hover:bg-[#1f1f23]"
            >
              {preset.label}
              {value.preset === preset.id && <Check size={14} className="text-muted" />}
            </button>
          ))}

          <div className="mt-2 border-t border-line pt-2">
            <div className="px-3 pb-2 text-[11px] uppercase tracking-[0.08em] text-label">
              Custom
            </div>
            <div className="flex flex-col gap-2 px-3">
              <label className="flex items-center justify-between gap-2 text-[12px] text-muted">
                Start
                <input
                  type="date"
                  value={draft.start}
                  onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
                  className="rounded-md border border-btn-border bg-btn px-2 py-1 text-[12px] text-ink"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-[12px] text-muted">
                End
                <input
                  type="date"
                  value={draft.end}
                  onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
                  className="rounded-md border border-btn-border bg-btn px-2 py-1 text-[12px] text-ink"
                />
              </label>
              <button
                type="button"
                onClick={applyCustom}
                disabled={!draft.start || !draft.end}
                className="mb-1 mt-1 rounded-lg border border-btn-border bg-[#1f1f23] px-3 py-1.5 text-[12px] text-ink transition-colors hover:border-[#3a3a40] disabled:opacity-40"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
