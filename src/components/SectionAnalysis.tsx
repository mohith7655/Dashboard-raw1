import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, XCircle } from 'lucide-react'
import { Skeleton } from './Skeleton'
import type { SectionPromptKey, TargetAdvice, TargetNote } from '../lib/types'

const TONE: Record<
  TargetNote['tone'],
  { icon: typeof AlertTriangle; className: string }
> = {
  good: { icon: CheckCircle2, className: 'text-pos' },
  warn: { icon: AlertTriangle, className: 'text-amber-400' },
  bad: { icon: XCircle, className: 'text-neg' },
}

/**
 * What needs doing, before what is merely true.
 *
 * The model writes its notes in whatever order it reasoned in, which puts
 * whatever it noticed first at the top — often a figure that is fine. A review
 * is read to decide what to change this week, so the notes that name something
 * wrong lead, the warnings follow, and the things going well come last: they
 * are worth knowing and worth not acting on.
 *
 * Sorted rather than filtered. A section with nothing wrong should say so
 * rather than come back empty, and a good note is the evidence that the bad
 * ones are the exception.
 *
 * Stable within a tone — `sort` is stable in every engine this runs on — so
 * the model's own ordering survives among notes of equal urgency, and a rerun
 * that changes nothing reads the same way twice.
 */
const TONE_ORDER: Record<TargetNote['tone'], number> = { bad: 0, warn: 1, good: 2 }

const actionFirst = (notes: TargetNote[]): TargetNote[] =>
  [...notes].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])

/** Everything a section needs to render its own analysis panel. */
export interface SectionAnalysisWiring {
  prompt: string | undefined
  onSavePrompt: (prompt: string) => void
  savingPrompt: boolean
  promptError: string | null
  onAnalyse: (prompt: string, snapshot: Record<string, unknown>) => void
  running: boolean
  result: TargetAdvice | undefined
  analysisError: string | null
}

interface SectionAnalysisProps {
  section: SectionPromptKey
  /** What the section is called on screen, so the model names it as you do. */
  label: string
  open: boolean
  /** The id the section's toggle points `aria-controls` at. */
  panelId: string
  /** The prompt as stored, or undefined while it is still loading. */
  prompt: string | undefined
  onSavePrompt: (prompt: string) => void
  savingPrompt: boolean
  promptError: string | null
  /** Builds the figures to send, at the moment the button is pressed. */
  onAnalyse: (prompt: string) => void
  running: boolean
  result: TargetAdvice | undefined
  analysisError: string | null
  /** Spacing for the panel, which sits in a different flow in each caller. */
  className?: string
}

/**
 * The AI review of one section, and the standing instruction it is run under.
 *
 * Folded away until asked for. The panel is not the section's subject — the
 * figures above it are — and a textarea permanently open under every card
 * would make the prompt look like something that has to be filled in before
 * the numbers can be read.
 */
export function SectionAnalysis({
  section,
  label,
  open,
  panelId,
  prompt,
  onSavePrompt,
  savingPrompt,
  promptError,
  onAnalyse,
  running,
  result,
  analysisError,
  className = '',
}: SectionAnalysisProps) {
  const [draft, setDraft] = useState(prompt ?? '')
  // Tracks what was last loaded or saved, so the Save button can say whether
  // there is anything to save rather than being live at all times.
  const [saved, setSaved] = useState(prompt ?? '')

  // The stored prompt arrives after the first render. Adopted only while the
  // box is untouched: overwriting a half-typed instruction when a background
  // refetch lands is the one thing a prompt editor must never do.
  useEffect(() => {
    if (prompt === undefined) return
    setDraft((current) => (current === saved ? prompt : current))
    setSaved(prompt)
    // `saved` is deliberately absent: including it would re-run this on every
    // save and re-adopt the stored value over whatever was typed since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt])

  const dirty = draft.trim() !== saved.trim()

  return (
    <div id={panelId} hidden={!open} className={className}>
      <div className="card flex flex-col gap-3">
        <div>
          <label
            htmlFor={`${panelId}-prompt`}
            className="text-[10.5px] uppercase tracking-wide text-label"
          >
            What should the analysis pay attention to?
          </label>
          {/* No explainer under the label. What the prompt does is evident
              from the two buttons under it, and a paragraph of caveat above
              the box made the panel read as terms to accept rather than a
              field to type in. The caveats still hold — the saved prompt is
              appended to the built-in rules server-side, never replacing
              them — they are just not the first thing on the card. */}
          <textarea
            id={`${panelId}-prompt`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={PLACEHOLDER[section]}
            className="input-base mt-2 w-full resize-y leading-relaxed"
          />
        </div>

        {promptError && (
          <p className="text-[12px] leading-relaxed text-neg">{promptError}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onAnalyse(draft.trim())}
            disabled={running}
            className="flex h-9 items-center gap-2 rounded-lg border border-btn-border bg-btn px-3 text-[13px] text-ink transition-colors hover:border-[#3a3a40] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? (
              <Loader2 size={14} className="animate-spin text-muted" />
            ) : (
              <Sparkles size={14} className="text-muted" />
            )}
            {running ? 'Thinking…' : result ? 'Analyse again' : 'Analyse'}
          </button>

          <button
            type="button"
            onClick={() => {
              onSavePrompt(draft.trim())
              setSaved(draft.trim())
            }}
            disabled={savingPrompt || !dirty}
            className="flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted"
          >
            {savingPrompt && <Loader2 size={14} className="animate-spin" />}
            {dirty ? 'Save prompt' : 'Prompt saved'}
          </button>

          {/* Analysing does not save. The two are separate on purpose: trying
              a wording out should not commit it, and a prompt worth keeping is
              usually the third one tried, not the first. */}
          {dirty && !savingPrompt && (
            <span className="text-[11.5px] text-label">
              Unsaved — this run will use what is typed above.
            </span>
          )}
        </div>

        {analysisError && (
          <p className="text-[12px] leading-relaxed text-neg">{analysisError}</p>
        )}

        {/* The answer's place, held while it is being written.

            Without this the only sign a run is under way is the word on the
            button, and the space the answer will occupy stays empty — so
            pressing Analyse reads as having done nothing, in exactly the part
            of the card being watched. The block appears where the answer will,
            at the size it will roughly be.

            Shown only for the first run. Re-analysing already has its answer
            on screen, and replacing it with bars would take away the thing
            being compared against for as long as the new one takes. */}
        {running && !result && (
          <div className="border-t border-row-line pt-3">
            <div className="flex items-center gap-2 text-[12.5px] text-muted">
              <Loader2 size={13} className="animate-spin" />
              Reading the period’s figures…
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          </div>
        )}

        {result && (
          <div className="border-t border-row-line pt-3">
            <p className="text-[13px] font-medium text-ink">{result.headline}</p>
            <ul className="mt-2.5 flex flex-col gap-2.5">
              {actionFirst(result.notes).map((note, i) => {
                const { icon: Icon, className } = TONE[note.tone]
                return (
                  <li key={i} className="flex gap-2">
                    <Icon size={14} className={`mt-0.5 shrink-0 ${className}`} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink">{note.title}</p>
                      <p className="mt-0.5 max-w-prose text-[12px] leading-relaxed text-muted">
                        {note.detail}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
            {/* Named and dated, so a review written about a different period
                cannot pass for one about this one. */}
            <p className="mt-2.5 text-[11px] text-label">
              {label} · written by {result.model} ·{' '}
              {new Date(result.generatedAt).toLocaleString()}. Check the figures
              it quotes before acting on them.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/** A worked example per section, rather than one generic line for both. */
const PLACEHOLDER: Record<SectionPromptKey, string> = {
  ceo: 'e.g. Net profit is the figure we are judged on, not revenue. Say which line moved it most against last period, and what to change this week.',
  ads: 'e.g. We judge Meta on blended return, not platform ROAS. Flag any platform above 40% of spend that is below 2x, and say what to move where.',
  leads: 'e.g. Cost per lead matters more than volume. Call out any list whose signups fell while spend held, and check the lists are still writing.',
}

/**
 * The icon button that opens the panel, for a section's title row.
 *
 * Exported beside the panel rather than left to each caller: the two are one
 * control, and a second copy of the sparkles markup is how the two sections
 * come to disagree about what the button looks like.
 */
export function AnalyseButton({
  open,
  panelId,
  label,
  onToggle,
  running,
  disabled,
}: {
  open: boolean
  panelId: string
  label: string
  onToggle: () => void
  running: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={`Analyse ${label}`}
      title={`Analyse ${label} — what changed, and how to improve it`}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-btn hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
    >
      {running ? (
        <Loader2 size={15} className="animate-spin" />
      ) : (
        <Sparkles size={15} />
      )}
    </button>
  )
}
