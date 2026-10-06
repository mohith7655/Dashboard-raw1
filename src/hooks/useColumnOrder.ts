import { useCallback, useEffect, useState } from 'react'

/** Persist a table's column order in this browser and carry it across schema updates. */
export function useColumnOrder(keys: string[], storageKey: string) {
  const [order, setOrder] = useState<string[]>(() => {
    if (typeof window === 'undefined') return keys
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null')
      if (!Array.isArray(saved)) return keys
      return [...saved.filter((key): key is string => typeof key === 'string' && keys.includes(key)),
        ...keys.filter((key) => !saved.includes(key))]
    } catch {
      return keys
    }
  })

  useEffect(() => {
    setOrder((current) => [
      ...current.filter((key) => keys.includes(key)),
      ...keys.filter((key) => !current.includes(key)),
    ])
  }, [keys.join('|')])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(order))
    } catch {
      // Storage may be disabled; reordering still works for this session.
    }
  }, [order, storageKey])

  const moveColumn = useCallback((source: string, target: string) => {
    if (source === target) return
    setOrder((current) => {
      const next = current.filter((key) => key !== source)
      const index = next.indexOf(target)
      if (index < 0) return current
      next.splice(index, 0, source)
      return next
    })
  }, [])

  return { order, moveColumn }
}
