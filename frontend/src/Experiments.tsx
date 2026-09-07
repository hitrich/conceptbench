import { useState } from 'react'
import {
  Plus,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CircleDot,
  CheckCheck,
  FlaskConical,
  Play,
  Download,
  Clock3,
} from 'lucide-react'
import type { Overview, Experiment, Assessment } from './types'
import { api, download, dateLabel } from './api'
import { Dialog, Field, Empty, Submit, formValues, tomorrow } from './ui'

export function ExperimentForm({
  data,
  assessment,
  experiment,
  close,
  reload,
  notify,
}: {
  data: Overview
  assessment: Assessment | null
  experiment?: Experiment
  close: () => void
  reload: () => Promise<void>
  notify: (s: string) => void
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const mix = assessment?.brief.state === 'test_segment_focus'
  return (
    <Dialog
      title={experiment ? 'Edit experiment' : 'Turn evidence into an experiment'}
      close={close}
      wide
    >
      <form
        onSubmit={async (e) => {
          const v = formValues(e)
          setBusy(true)
          setError('')
          try {
            await api(
              experiment
                ? `/experiments/${experiment.id}`
                : assessment
                  ? `/assessments/${assessment.id}/experiments`
                  : `/projects/${data.project.id}/experiments`,
              experiment ? 'PUT' : 'POST',
              { ...v, assignment_unit: 'identified_user' },
            )
            await reload()
            notify(
              experiment
                ? 'Experiment specification saved.'
                : 'Experiment created. Your next review has an owner.',
            )
            close()
          } catch (e) {
            setError((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <Field label="Experiment name">
          <input
            name="title"
            required
            maxLength={180}
            defaultValue={experiment?.title || (mix ? 'Test a focused paid audience' : '')}
            placeholder="What will you test?"
          />
        </Field>
        <Field label="Hypothesis">
          <textarea
            name="hypothesis"
            required
            minLength={10}
            rows={3}
            defaultValue={
              experiment?.hypothesis ||
              (mix
                ? 'Targeting paid acquisition toward the needs seen in organic users will improve W4 value retention.'
                : '')
            }
            placeholder="We believe that… because…"
          />
        </Field>
        <Field label="Population">
          <input
            name="population"
            required
            minLength={3}
            defaultValue={
              experiment?.population ||
              (mix ? 'New identified users from paid acquisition' : data.project.audience)
            }
          />
        </Field>
        <div className="form-grid">
          <Field label="Study design">
            <select name="design" defaultValue={experiment?.design || 'randomized'}>
              <option value="randomized">Randomized comparison</option>
              <option value="observational">Observational before / after</option>
            </select>
          </Field>
          <Field label="Primary metric">
            <input
              name="primary_metric"
              required
              minLength={3}
              defaultValue={experiment?.primary_metric || 'W4 value retention'}
            />
          </Field>
        </div>
        <Field
          label="Minimum useful effect"
          hint="Choose a meaningful effect for your decision; there is no universal retention threshold."
        >
          <input
            name="minimum_effect"
            maxLength={100}
            defaultValue={experiment?.minimum_effect || ''}
            placeholder="e.g. an agreed percentage-point improvement"
          />
        </Field>
        <Field label="Guardrails">
          <textarea
            name="guardrails"
            required
            minLength={3}
            rows={2}
            defaultValue={
              experiment?.guardrails ||
              'Monitor A7 activation and acquisition costs. Investigate any tracking discontinuity.'
            }
          />
        </Field>
        <Field label="Duration or stopping rule">
          <textarea
            name="stopping_rule"
            required
            minLength={3}
            rows={2}
            defaultValue={
              experiment?.stopping_rule ||
              'Review once the predeclared signup cohort completes its 28-day window. Do not stop early based on favorable interim results.'
            }
          />
        </Field>
        <Field label="Instrumentation check">
          <textarea
            name="instrumentation_check"
            rows={2}
            defaultValue={
              experiment?.instrumentation_check ||
              'Verify cohort-entry attribution, canonical user identity, and complete event coverage in both conditions.'
            }
          />
        </Field>
        <div className="form-grid">
          <Field label="Owner">
            <input
              name="owner_name"
              required
              maxLength={100}
              defaultValue={experiment?.owner_name || assessment?.owner_name || ''}
            />
          </Field>
          <Field label="Outcome review date">
            <input
              name="review_date"
              type="date"
              required
              defaultValue={experiment?.review_date || tomorrow(35)}
            />
          </Field>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <span>
            {assessment
              ? `Linked to Decision Brief v${assessment.version}`
              : 'An independent concept-research experiment'}
          </span>
          <Submit busy={busy} label={experiment ? 'Save specification' : 'Create experiment'} />
        </div>
      </form>
    </Dialog>
  )
}

export default function Experiments({
  data,
  create,
  reload,
  notify,
}: {
  data: Overview
  create: () => void
  reload: () => Promise<void>
  notify: (s: string) => void
}) {
  const [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState<string | null>(null),
    [edit, setEdit] = useState(false),
    [outcome, setOutcome] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const active = data.experiments.find((e) => e.id === selected)
  const visible = data.experiments.filter((e) => filter === 'all' || e.status === filter)
  const complete = data.experiments.filter((e) => e.status === 'complete').length
  return (
    <>
      <div className="experiments-summary">
        <div>
          <span className="eyebrow">THE LEARNING LOOP</span>
          <h2>A decision is only the beginning.</h2>
          <p>Give each test an owner, a clear metric, and a date to learn from it.</p>
        </div>
        <div className="loop-steps">
          <span>
            <FileStep />
            Review
          </span>
          <ArrowRight size={14} />
          <span className="current">
            <FlaskConical size={16} />
            Experiment
          </span>
          <ArrowRight size={14} />
          <span>
            <CheckCheck size={16} />
            Outcome
          </span>
        </div>
      </div>
      <div className="list-toolbar">
        <div className="segmented">
          {[
            ['all', 'All experiments'],
            ['planned', 'Planned'],
            ['running', 'Running'],
            ['complete', 'Completed'],
          ].map(([key, label]) => (
            <button
              className={filter === key ? 'active' : ''}
              key={key}
              onClick={() => setFilter(key)}
            >
              {label}
              <span>
                {key === 'all'
                  ? data.experiments.length
                  : data.experiments.filter((e) => e.status === key).length}
              </span>
            </button>
          ))}
        </div>
        <button className="button" disabled={data.role === 'viewer'} onClick={create}>
          New experiment <Plus size={14} />
        </button>
      </div>
      {visible.length ? (
        <div className="experiment-list">
          {visible.map((e) => (
            <button
              className="experiment-item"
              key={e.id}
              onClick={() => {
                setSelected(e.id)
                setError('')
              }}
            >
              <span className={`experiment-status-icon ${e.status}`}>
                {e.status === 'complete' ? (
                  <CheckCheck size={20} />
                ) : e.status === 'running' ? (
                  <CircleDot size={20} />
                ) : (
                  <FlaskConical size={20} />
                )}
              </span>
              <span className="experiment-main">
                <span className={`status-text ${e.status}`}>
                  {e.status === 'running'
                    ? 'IN PROGRESS'
                    : e.status === 'complete'
                      ? 'OUTCOME RECORDED'
                      : 'PLANNED'}{' '}
                  <span>· {e.design}</span>
                </span>
                <strong>{e.title}</strong>
                <small>{e.primary_metric}</small>
              </span>
              <span className="experiment-meta">
                <span className="avatar small">
                  {e.owner_name
                    .split(' ')
                    .map((s) => s[0])
                    .join('')
                    .slice(0, 2)}
                </span>
                <span>
                  {e.owner_name}
                  <small>
                    <CalendarDays size={12} />
                    {dateLabel(e.review_date)}
                  </small>
                </span>
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="A little structure. A lot more learning."
          action={
            <button className="button primary" onClick={create}>
              Plan an experiment <ArrowRight size={15} />
            </button>
          }
        >
          There are no {filter === 'all' ? '' : filter} experiments here yet. Start with one
          question you can answer.
        </Empty>
      )}
      <div className="outcome-footnote">
        <span className="outcome-number">
          {complete}
          <small>/{data.experiments.length}</small>
        </span>
        <p>
          experiments with a recorded outcome
          <small>This measures follow-through, not the correctness of a strategic decision.</small>
        </p>
        <Clock3 size={25} />
      </div>
      {active && !edit && (
        <Dialog
          title={active.title}
          close={() => {
            setSelected(null)
            setOutcome(false)
          }}
          drawer
        >
          <span className={`status-label ${active.status === 'complete' ? 'good' : ''}`}>
            <span />
            {active.status} · {active.design}
          </span>
          <h4>Hypothesis</h4>
          <p>{active.hypothesis}</p>
          <dl className="definition-list">
            <div>
              <dt>Population</dt>
              <dd>{active.population}</dd>
            </div>
            <div>
              <dt>Primary metric</dt>
              <dd>{active.primary_metric}</dd>
            </div>
            <div>
              <dt>Useful effect</dt>
              <dd>{active.minimum_effect || 'Not yet specified'}</dd>
            </div>
            <div>
              <dt>Assignment unit</dt>
              <dd>Identified user</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{active.owner_name}</dd>
            </div>
            <div>
              <dt>Review date</dt>
              <dd>{dateLabel(active.review_date)}</dd>
            </div>
          </dl>
          <h4>Guardrails</h4>
          <p>{active.guardrails}</p>
          <h4>Stopping rule</h4>
          <p>{active.stopping_rule}</p>
          <h4>Instrumentation check</h4>
          <p>{active.instrumentation_check || 'Not recorded'}</p>
          {active.design === 'observational' && (
            <div className="notice">
              An observational comparison cannot isolate causality; record acquisition mix,
              seasonality, and other changes.
            </div>
          )}
          {active.outcome && (
            <div className="outcome-box">
              <span className="eyebrow">OUTCOME · {active.outcome.decision}</span>
              <p>{active.outcome.result}</p>
              <h4>Supporting evidence</h4>
              <p>{active.outcome.evidence}</p>
              <h4>Limitations</h4>
              <p>{active.outcome.limitations}</p>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          {outcome ? (
            <form
              onSubmit={async (e) => {
                const v = formValues(e)
                setBusy(true)
                try {
                  await api(`/experiments/${active.id}/outcomes`, 'POST', v)
                  await reload()
                  setOutcome(false)
                  notify('Outcome recorded. The experiment specification is now frozen.')
                } catch (e) {
                  setError((e as Error).message)
                } finally {
                  setBusy(false)
                }
              }}
            >
              <h3>Record what happened</h3>
              <Field label="Decision">
                <select name="decision">
                  <option value="inconclusive">Inconclusive — collect more evidence</option>
                  <option value="adopt">Adopt the change</option>
                  <option value="iterate">Iterate and test again</option>
                  <option value="stop">Stop this approach</option>
                </select>
              </Field>
              <Field label="Observed result">
                <textarea name="result" minLength={10} required rows={3} />
              </Field>
              <Field label="Supporting evidence or source reference">
                <textarea name="evidence" minLength={3} required rows={2} />
              </Field>
              <Field label="Limitations and alternative explanations">
                <textarea name="limitations" minLength={3} required rows={2} />
              </Field>
              <div className="form-actions">
                <button className="quiet" type="button" onClick={() => setOutcome(false)}>
                  Cancel
                </button>
                <Submit busy={busy} label="Record outcome" />
              </div>
            </form>
          ) : (
            <div className="drawer-actions">
              {active.status === 'planned' && data.role !== 'viewer' && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await api(`/experiments/${active.id}/start`, 'POST')
                      await reload()
                      notify('Experiment started.')
                    } catch (e) {
                      setError((e as Error).message)
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  <Play size={14} />
                  Start experiment
                </button>
              )}
              {active.status === 'running' && data.role !== 'viewer' && (
                <button className="button primary" onClick={() => setOutcome(true)}>
                  Record outcome <ArrowRight size={14} />
                </button>
              )}
              {active.status === 'planned' && data.role !== 'viewer' && (
                <button className="button" onClick={() => setEdit(true)}>
                  Edit specification
                </button>
              )}
              {data.can_export && (
                <button
                  className="button"
                  onClick={() => download(`/experiments/${active.id}/export`)}
                >
                  <Download size={14} />
                  Export
                </button>
              )}
            </div>
          )}
        </Dialog>
      )}
      {active && edit && (
        <ExperimentForm
          data={data}
          assessment={data.assessment}
          experiment={active}
          close={() => setEdit(false)}
          reload={reload}
          notify={notify}
        />
      )}
    </>
  )
}
function FileStep() {
  return <span className="tiny-review-icon">↗</span>
}
