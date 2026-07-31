import { useCallback, useMemo, useState } from 'react'
import type { SortDirection } from './types'
import type { ListQuery } from './adapters/resources'

interface ListState {
  query: ListQuery
  setPage: (page: number) => void
  /** Toggles direction when the same field is clicked again. */
  toggleSort: (field: string) => void
}

/**
 * Page + sort state for a list page. Sorting resets to page 1, so the user
 * never lands on an empty page after reordering.
 */
export function useListState(
  defaultSort: string,
  perPage = 10,
  defaultDirection: SortDirection = 'desc',
): ListState {
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState(defaultSort)
  const [direction, setDirection] = useState<SortDirection>(defaultDirection)

  const toggleSort = useCallback(
    (field: string) => {
      if (field === sort) {
        setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSort(field)
        setDirection('desc')
      }
      setPage(1)
    },
    [sort],
  )

  const query = useMemo<ListQuery>(
    () => ({ page, perPage, sort, direction }),
    [page, perPage, sort, direction],
  )

  return { query, setPage, toggleSort }
}
