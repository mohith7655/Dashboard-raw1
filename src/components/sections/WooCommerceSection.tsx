import { SectionLabel } from '../SectionLabel'

interface WooCommerceSectionProps {
  /**
   * Controls on the section's own title row, right-aligned.
   *
   * They belong to the section rather than to any one card inside it: the
   * statement they fold has no header of its own any more, and a control
   * floating above a card that does not claim it reads as belonging to
   * whatever happens to sit nearest.
   */
  actions?: React.ReactNode
  /**
   * The panel one of those controls opens, directly under the title row.
   *
   * Its own slot rather than part of `summary`: it belongs to the control
   * above it, and folded inside the statement it would be a panel you had to
   * open the statement to reach.
   */
  analysis?: React.ReactNode
  /** Leads the section — the statement in full. */
  summary?: React.ReactNode
  /**
   * Under the statement.
   *
   * Where the advertising sits: it is what the statement's costliest line was
   * spent on, and it reads immediately after the line it explains.
   */
  beforeStats?: React.ReactNode
}

/**
 * The money the period made and what was spent to make it.
 *
 * Order counts used to close this section. They have their own now — see
 * `OrdersCustomersSection` — because they answer a different question: this
 * section is what the period earned, that one is who bought. Keeping them
 * together meant one heading over both, and a reader looking for customers
 * had to know to find them under a statement.
 */
export function WooCommerceSection({
  actions,
  analysis,
  summary,
  beforeStats,
}: WooCommerceSectionProps) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <SectionLabel size="lg">CEO Dashboard</SectionLabel>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>

      {/* Under the control that opens it, above everything it is about. */}
      {analysis}

      <div className="flex flex-col gap-4">
        {summary}
        {beforeStats}
      </div>
    </section>
  )
}
