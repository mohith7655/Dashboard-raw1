interface CardRowProps {
  children: React.ReactNode
  /** Spacing between rows, mostly. */
  className?: string
  /**
   * The grid from `sm` up. Only the column template belongs here — the mobile
   * behaviour is fixed, so every row on the dashboard swipes the same way.
   */
  cols?: string
}

/**
 * A row of cards: swipeable on a phone, a grid from `sm` up.
 *
 * Stacked one per screen, four KPIs cost four screens of scrolling before the
 * next section began, and a dashboard that has to be scrolled past is not one
 * anyone reads. Side by side, a row is one gesture.
 *
 * Cards take 78% of the width so the next one is always visibly cut off at the
 * edge. Nothing else says "there is more this way" — a scrollbar is hidden on
 * touch, and a row that ends flush at the screen edge reads as a row that ends.
 *
 * The bleed (`-mx-4 px-4`) lets the strip run to the edges of the phone while
 * the cards stay aligned with everything above and below, so a swipe starting
 * at the very edge still catches it.
 */
export function CardRow({
  children,
  className = '',
  cols = 'sm:grid-cols-2 lg:grid-cols-4',
}: CardRowProps) {
  return (
    <div
      className={`-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:w-[78%] [&>*]:shrink-0 [&>*]:snap-start sm:mx-0 sm:grid sm:snap-none sm:overflow-visible sm:px-0 sm:pb-0 sm:[&>*]:w-auto ${cols} ${className}`}
    >
      {children}
    </div>
  )
}
