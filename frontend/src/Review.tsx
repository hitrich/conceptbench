import { useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  ArrowDown,
  Check,
  ChevronRight,
  SlidersHorizontal,
  Users,
  CalendarDays,
  Info,
  Table2,
  Sparkles,
  CircleDashed,
  Layers,
  Clock3,
  FileText,
  ExternalLink,
  ShieldCheck,
  Minus,
} from 'lucide-react'
import type { Overview, Assessment, Metric, Comparison, Source, Row, Rate } from './types'
import { api, number, dateLabel } from './api'
import { Dialog } from './ui'

export const stateLabels: Record<string, string> = {
  test_segment_focus: 'Test segment focus',
  insufficient_evidence: 'Gather more evidence',
  fix_measurement: 'Fix measurement',
  investigate_friction: 'Investigate friction',
  test_positioning: 'Test positioning',
  evaluate_pivot: 'Evaluate a pivot',
  continue_and_measure: 'Continue and measure',
}
const metricLabels: Record<Metric, string> = {
  retention: 'W4 value retention',
  activation: 'A7 activation',
  conditional: 'W4 among activated users',
}

function RateCell({ value }: { value: Rate }) {
  return (
    <td>
      <strong>{value.rate === null ? '—' : `${number(value.rate, 2)}%`}</strong>
      <small>
        {value.interval ? (
          <>
            {value.numerator} / {value.denominator} · CI{' '}
            {value.interval.map((v) => number(v)).join('–')}%
          </>
        ) : (
          'No mature eligible users'
        )}
      </small>
    </td>
  )
}

function Change({ comparison }: { comparison: Comparison }) {
  const delta = comparison.change.pp
  return (
    <span
      className={`change ${delta == null ? '' : delta < -0.05 ? 'down' : Math.abs(delta) < 0.05 ? 'flat' : 'up'}`}
    >
      {delta != null &&
        (delta < -0.05 ? (
          <ArrowDownRight size={14} />
        ) : delta > 0.05 ? (
          <ArrowUpRight size={14} />
        ) : (
          <Minus size={14} />
        ))}
      {delta == null ? 'Incomplete comparison' : `${number(Math.abs(delta), 2)} pp`}
      <span>vs. earlier cohort</span>
    </span>
  )
}

function SlopeChart({
  comparison,
  standardized,
  metric,
}: {
  comparison: Comparison
  standardized: number | null
  metric: Metric
}) {
  const max = Math.max(
    30,
    ...[comparison.earlier.rate || 0, comparison.later.rate || 0, standardized || 0].map(
      (v) => Math.ceil(v / 10) * 10,
    ),
  )
  const y = (v: number) => 178 - (v / max) * 142
  const a = comparison.earlier.rate,
    b = comparison.later.rate
  return (
    <svg
      viewBox="0 0 540 224"
      className="retention-chart"
      role="img"
      aria-label={`${metricLabels[metric]}: earlier ${number(a)} percent, later ${number(b)} percent. ${standardized == null ? '' : `Holding earlier mix fixed: ${number(standardized)} percent.`}`}
    >
      <defs>
        <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-observed)" stopOpacity=".10" />
          <stop offset="100%" stopColor="var(--chart-observed)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <line
            x1="46"
            x2="486"
            y1={y((i * max) / 3)}
            y2={y((i * max) / 3)}
            stroke="var(--line)"
            strokeDasharray={i ? '3 4' : ''}
          />
          <text x="36" y={y((i * max) / 3) + 4} textAnchor="end" fill="var(--muted)" fontSize="11">
            {number((i * max) / 3, 0)}%
          </text>
        </g>
      ))}
      {a != null && b != null && (
        <>
          <path d={`M76 ${y(a)} L452 ${y(b)} L452 178 L76 178 Z`} fill="url(#area)" />
          {standardized != null && (
            <>
              <path
                d={`M76 ${y(a)} L452 ${y(standardized)}`}
                stroke="var(--chart-secondary)"
                strokeWidth="2"
                strokeDasharray="5 5"
                fill="none"
              />
              <circle
                cx="452"
                cy={y(standardized)}
                r="4"
                fill="var(--paper)"
                stroke="var(--chart-secondary)"
                strokeWidth="2"
              />
              <text
                x="452"
                y={y(standardized) - 13}
                textAnchor="end"
                className="chart-value secondary-value"
              >
                {number(standardized, 2)}%
              </text>
            </>
          )}
          <path
            className="chart-line"
            d={`M76 ${y(a)} L452 ${y(b)}`}
            stroke="var(--chart-observed)"
            strokeWidth="3"
            fill="none"
          />
          <circle
            cx="76"
            cy={y(a)}
            r="5"
            fill="var(--paper)"
            stroke="var(--chart-observed)"
            strokeWidth="3"
          />
          <circle
            cx="452"
            cy={y(b)}
            r="5"
            fill="var(--paper)"
            stroke="var(--chart-observed)"
            strokeWidth="3"
          />
          <text x="76" y={y(a) - 14} textAnchor="middle" className="chart-value">
            {number(a, 2)}%
          </text>
          <text x="452" y={y(b) + 23} textAnchor="end" className="chart-value">
            {number(b, 2)}%
          </text>
        </>
      )}
      <text x="76" y="213" textAnchor="middle" fontSize="11" fill="var(--muted)">
        Earlier cohort
      </text>
      <text x="452" y="213" textAnchor="middle" fontSize="11" fill="var(--muted)">
        Later cohort
      </text>
    </svg>
  )
}
function CohortTable({ rows }: { rows: Row[] }) {
  return (
    <div className="table-scroll">
      <table>
        <caption className="sr-only">Cohort counts and mature-window metrics</caption>
        <thead>
          <tr>
            <th>Cohort / acquisition</th>
            <th>Eligible users</th>
            <th>A7 activated</th>
            <th>W4 returners</th>
            <th>W4 retention</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <span className="table-main">{r.segment}</span>
                <small>
                  {dateLabel(r.cohort_start, { month: 'short', day: 'numeric' })} –{' '}
                  {dateLabel(r.cohort_end, { month: 'short', day: 'numeric' })}
                </small>
              </td>
              <td>{r.signups.toLocaleString()}</td>
              <td>{r.a7_mature === false ? 'Immature' : r.activated.toLocaleString()}</td>
              <td>{r.w4_mature === false ? 'Immature' : r.retained.toLocaleString()}</td>
              <td>
                {r.w4_mature === false
                  ? 'Not yet eligible'
                  : r.signups
                    ? `${number((r.retained / r.signups) * 100, 2)}%`
                    : 'No eligible users'}
                {r.retention?.interval && (
                  <small>
                    95% CI {number(r.retention.interval[0])}–{number(r.retention.interval[1])}%
                  </small>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Review({
  data,
  assessment,
  setAssessment,
  createExperiment,
  editBrief,
  source,
  navigateData,
}: {
  data: Overview
  assessment: Assessment
  setAssessment: (a: Assessment) => void
  createExperiment: () => void
  editBrief: () => void
  source: () => void
  navigateData: () => void
}) {
  const [tab, setTab] = useState('brief')
  const [metric, setMetric] = useState<Metric>('retention')
  const [population, setPopulation] = useState('all')
  const [table, setTable] = useState(false)
  const [reasoning, setReasoning] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const b = assessment.brief,
    a = b.analysis
  const selectedSegment = a.segments.find((s) => s.segment === population)
  const comparison = selectedSegment && metric === 'retention' ? selectedSegment : a.metrics[metric]
  const isMix = b.state === 'test_segment_focus'
  const rows = a.cohorts.filter((r) => population === 'all' || r.segment === population)
  return (
    <>
      {b.synthetic && (
        <div className="demo-banner">
          <span>
            <span className="demo-orb" />A little context: you’re exploring a demo. All evidence is
            illustrative.
          </span>
          <button onClick={navigateData}>
            Connect your data <ArrowUpRight size={13} />
          </button>
        </div>
      )}
      <div className="report-tabs" role="tablist" aria-label="Review views">
        {[
          ['brief', 'Decision brief'],
          ['cohorts', 'Cohort analysis'],
          ['history', 'Version history'],
        ].map(([key, label]) => (
          <button
            role="tab"
            aria-selected={tab === key}
            key={key}
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            {label}
            {key === 'history' && <span>{data.assessment_versions.length}</span>}
          </button>
        ))}
        <span className="report-version">
          <Clock3 size={13} />{' '}
          {dateLabel(assessment.created_at, { month: 'short', day: 'numeric' })} · v
          {assessment.version}
        </span>
      </div>
      <div className="filters">
        <label>
          <Users size={14} />
          <select
            aria-label="Acquisition population"
            value={population}
            onChange={(e) => {
              setPopulation(e.target.value)
              setMetric('retention')
            }}
          >
            <option value="all">All acquisition sources</option>
            {a.segments.map((s) => (
              <option key={s.segment}>{s.segment}</option>
            ))}
          </select>
        </label>
        <span className="filter-date">
          <CalendarDays size={14} />
          {a.periods.earlier &&
            dateLabel(a.periods.earlier.start, { month: 'short', day: 'numeric' })}{' '}
          –{' '}
          {a.periods.later &&
            dateLabel(a.periods.later.end, { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <label>
          <SlidersHorizontal size={14} />
          <select
            aria-label="Metric definition"
            value={metric}
            onChange={(e) => {
              setMetric(e.target.value as Metric)
              setPopulation('all')
            }}
          >
            {Object.entries(metricLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button className="quiet filter-definition" onClick={source}>
          Definition <ArrowUpRight size={13} />
        </button>
      </div>
      {data.connection?.status === 'stale' && (
        <div className="notice">
          <Clock3 size={15} />
          This report uses the last successful snapshot. The latest PostHog refresh failed:{' '}
          {data.connection.last_error}
        </div>
      )}
      {assessment.contract_id && data.contract && assessment.contract_id !== data.contract.id && (
        <div className="notice">
          <Info size={15} />
          Your metric definition changed. This preserved brief uses its original definition;
          reconcile and import new evidence.
        </div>
      )}
      {population !== 'all' && (
        <p className="scope-note">
          Chart and table filtered to {population}. The Decision Brief covers all acquisition
          sources.
        </p>
      )}
      {data.contract?.id && assessment.snapshot_id && data.assessment?.id !== assessment.id && (
        <div className="notice">
          <Clock3 size={15} />
          You’re viewing a preserved version. Current evidence may have changed.
        </div>
      )}
      {tab === 'history' ? (
        <div className="history">
          <h2>A decision trail you can follow.</h2>
          <p>Each revision preserves its definition, evidence, and analyst notes.</p>
          {historyError && <p className="error">{historyError}</p>}
          {data.assessment_versions.map((v) => (
            <button
              className="history-row"
              key={v.id}
              onClick={async () => {
                try {
                  setAssessment(await api<Assessment>(`/assessments/${v.id}`))
                  setTab('brief')
                } catch (e) {
                  setHistoryError(String(e))
                }
              }}
            >
              <span className="history-symbol">
                <FileText size={18} />
              </span>
              <span>
                <strong>Decision Brief · version {v.version}</strong>
                <small>{dateLabel(v.created_at)}</small>
              </span>
              <span>{v.id === assessment.id ? 'Viewing' : ''}</span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      ) : (
        <>
          {tab === 'brief' && (
            <section className="decision-panel">
              <div className="decision-label">
                <span className="status-label">
                  <span />
                  {stateLabels[b.state]}
                </span>
                <span className="evidence-count">
                  <Layers size={13} />
                  {a.mature_cohorts} mature cohorts · {b.evidence.length} metrics
                </span>
              </div>
              <div className="decision-content">
                <div className="decision-copy">
                  <h2>{b.title}</h2>
                  <p>{b.summary}</p>
                </div>
              </div>
              <div className="decision-actions">
                <button
                  className="button primary"
                  onClick={createExperiment}
                  disabled={data.role === 'viewer'}
                >
                  Create experiment <ArrowRight size={15} />
                </button>
                <button className="text-button" onClick={() => setReasoning(true)}>
                  Inspect the reasoning <ArrowUpRight size={14} />
                </button>
                <span className="decision-footnote">
                  A recommendation to investigate. Your team decides.
                </span>
              </div>
            </section>
          )}
          <div className="metrics">
            <button
              className={`metric ${metric === 'retention' ? 'selected' : ''}`}
              onClick={() => setMetric('retention')}
            >
              <span className="metric-label">
                W4 value retention <Info size={13} />
              </span>
              <span className="metric-number">
                {number(a.metrics.retention.later.rate)}
                <small>%</small>
              </span>
              <Change comparison={a.metrics.retention} />
              <span className="metric-detail">
                {a.metrics.retention.later.numerator.toLocaleString()} of{' '}
                {a.metrics.retention.later.denominator.toLocaleString()} eligible users
              </span>
            </button>
            <button
              className={`metric ${metric === 'activation' ? 'selected' : ''}`}
              onClick={() => {
                setMetric('activation')
                setPopulation('all')
              }}
            >
              <span className="metric-label">
                A7 activation <Info size={13} />
              </span>
              <span className="metric-number">
                {number(a.metrics.activation.later.rate)}
                <small>%</small>
              </span>
              <Change comparison={a.metrics.activation} />
              <span className="metric-detail">
                {a.metrics.activation.later.numerator.toLocaleString()} of{' '}
                {a.metrics.activation.later.denominator.toLocaleString()} eligible users
              </span>
            </button>
            <button
              className="metric"
              onClick={() => {
                setMetric('retention')
                setPopulation('all')
                setReasoning(true)
              }}
            >
              <span className="metric-label">
                Retention, holding mix fixed <Info size={13} />
              </span>
              <span className="metric-number">
                {number(a.standardized_later, 2)}
                <small>%</small>
              </span>
              <span className="change flat">
                <Minus size={14} />
                {a.standardized_later == null
                  ? 'Unavailable'
                  : `${number(a.standardized_later - (a.metrics.retention.earlier.rate || 0), 2)} pp`}
                <span>within the same source mix</span>
              </span>
              <span className="metric-detail">Weighted to the earlier acquisition mix</span>
            </button>
          </div>
          <div className="evidence-layout">
            <section className="chart-section">
              <div className="section-heading">
                <div>
                  <h3>
                    {isMix && metric === 'retention'
                      ? 'The change is in the mix.'
                      : metricLabels[metric]}
                  </h3>
                  <p>
                    {isMix && metric === 'retention'
                      ? 'Compare the observed rate with a fixed acquisition mix.'
                      : 'Complete observation windows, measured in elapsed UTC days.'}
                  </p>
                </div>
                <button className="quiet" onClick={source}>
                  View source <ArrowUpRight size={13} />
                </button>
              </div>
              <div className="chart-legend">
                <span>
                  <i className="dot purple" />
                  Observed {metric === 'retention' ? 'retention' : 'rate'}
                </span>
                {metric === 'retention' && population === 'all' && (
                  <span>
                    <i className="dash" />
                    Fixed earlier mix
                  </span>
                )}
              </div>
              <SlopeChart
                comparison={comparison}
                standardized={
                  metric === 'retention' && population === 'all' ? a.standardized_later : null
                }
                metric={metric}
              />
              <div className="chart-bottom">
                <span>
                  95% CI for change:{' '}
                  {comparison.change.interval
                    ? `${number(comparison.change.interval[0], 2)} to ${number(comparison.change.interval[1], 2)} pp`
                    : 'Unavailable'}
                </span>
                <button className="quiet" onClick={() => setTable(!table)}>
                  <Table2 size={13} />
                  {table ? 'Hide' : 'Show'} data table
                </button>
              </div>
              {(table || tab === 'cohorts') && <CohortTable rows={rows} />}
            </section>
            <aside className="mix-section">
              <div className="section-heading">
                <div>
                  <h3>Who’s coming in?</h3>
                  <p>Share of eligible signup users</p>
                </div>
              </div>
              {['earlier', 'later'].map((p) => (
                <div className="mix-row" key={p}>
                  <span>
                    {p === 'earlier' ? 'Earlier cohort' : 'Later cohort'}
                    <small>
                      {a.segments
                        .reduce((sum, s) => sum + s[p as 'earlier' | 'later'].denominator, 0)
                        .toLocaleString()}{' '}
                      users
                    </small>
                  </span>
                  <div className="mix-bar">
                    {a.segments.map((s, i) => {
                      const count = s[p as 'earlier' | 'later'].denominator
                      const total = a.metrics.retention[p as 'earlier' | 'later'].denominator
                      const pct = total ? (count / total) * 100 : 0
                      return (
                        <span
                          key={s.segment}
                          style={{
                            width: `${pct}%`,
                            background: i === 0 ? 'var(--accent)' : 'var(--chart-paid)',
                          }}
                          title={`${s.segment}: ${number(pct, 0)}%`}
                        >
                          {pct >= 15 ? `${number(pct, 0)}%` : ''}
                        </span>
                      )
                    })}
                  </div>
                </div>
              ))}
              <div className="mix-legend">
                {a.segments.map((s, i) => (
                  <span key={s.segment}>
                    <i
                      className="dot"
                      style={{ background: i === 0 ? 'var(--accent)' : 'var(--chart-paid)' }}
                    />
                    {s.segment}
                  </span>
                ))}
              </div>
              <div className="mix-insight">
                <Info size={15} />
                <p>
                  {isMix
                    ? 'Within-source rates are unchanged. The measured mix explains the aggregate arithmetic.'
                    : 'Inspect within-source rates before attributing the aggregate change.'}
                </p>
              </div>
            </aside>
          </div>
          <section className="segment-section">
            <div className="section-heading">
              <div>
                <h3>A closer look at the sources</h3>
                <p>W4 returners / eligible signup users · 95% Wilson intervals</p>
              </div>
              <span className="small-label">MEASURED BEHAVIOR</span>
            </div>
            <div className="table-scroll">
              <table>
                <caption className="sr-only">
                  Earlier and later retention by acquisition source
                </caption>
                <thead>
                  <tr>
                    <th>Acquisition source</th>
                    <th>Earlier cohort</th>
                    <th>Later cohort</th>
                    <th>Change</th>
                    <th>Interpretation</th>
                  </tr>
                </thead>
                <tbody>
                  {a.segments.map((s, i) => (
                    <tr key={s.segment}>
                      <td>
                        <span className="source-name">
                          <span className={`source-icon source-${i}`}>
                            <ArrowUpRight size={15} />
                          </span>
                          {s.segment}
                        </span>
                      </td>
                      <RateCell value={s.earlier} />
                      <RateCell value={s.later} />
                      <td>
                        <span className="neutral-pill">
                          {s.change.pp !== null && <Minus size={12} />}
                          {s.change.pp === null ? 'Unavailable' : `${number(s.change.pp, 2)} pp`}
                        </span>
                      </td>
                      <td>
                        <span className="table-interpretation">
                          {s.change.pp === null
                            ? 'Incomplete comparison'
                            : Math.abs(s.change.pp) < 0.05
                              ? 'Same observed rate'
                              : 'Inspect the interval'}
                          <button
                            aria-label={`Inspect ${s.segment} source`}
                            className="icon-button"
                            onClick={source}
                          >
                            <ArrowUpRight size={14} />
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {a.excluded.length > 0 && (
            <div className="notice">
              <Clock3 size={17} />
              <div>
                {a.excluded.length} immature cells excluded. Next eligible:{' '}
                {dateLabel(a.excluded[0].eligible_on)}. Missing windows are never counted as zero
                retention.
              </div>
            </div>
          )}
          {b.intervention_evidence && b.intervention_evidence.length > 0 && (
            <section className="settings-section">
              <h3>Reviewed intervention outcomes</h3>
              {b.intervention_evidence.map((e) => (
                <details key={e.id}>
                  <summary>
                    {e.title} · {e.outcome?.decision}
                  </summary>
                  <p>{e.outcome?.result}</p>
                  <p className="muted">
                    Evidence: {e.outcome?.evidence}
                    <br />
                    Limitations: {e.outcome?.limitations}
                  </p>
                  <small className="evidence-id">Experiment {e.id}</small>
                </details>
              ))}
            </section>
          )}
          {b.research_evidence && b.research_evidence.length > 0 && (
            <section className="settings-section">
              <h3>Research linked to this review</h3>
              {b.research_evidence.map((r) => (
                <div className="dataset-row" key={r.id}>
                  <span className="file-icon">
                    <FileText size={16} />
                  </span>
                  <span>
                    <strong>{r.name}</strong>
                    <small>
                      {r.type === 'demonstration'
                        ? 'Fabricated demonstration'
                        : r.recruitment_source}
                    </small>
                  </span>
                  <span>{r.response_count} responses</span>
                </div>
              ))}
            </section>
          )}
          <div className="bottom-evidence">
            <section>
              <span className="eyebrow">
                <CircleDashed size={13} /> KEEP IN VIEW
              </span>
              <h3>What the data doesn’t tell us.</h3>
              {b.contradictions.map((s, i) => (
                <p key={s}>
                  <span className="point-number">0{i + 1}</span>
                  {s}
                </p>
              ))}
            </section>
            <section className="next-review">
              <span className="eyebrow">
                <CalendarDays size={13} /> NEXT CHECK-IN
              </span>
              <h3>Turn this review into a learning loop.</h3>
              <div className="owner-row">
                <span className="avatar small">
                  {assessment.owner_name
                    .split(' ')
                    .map((v) => v[0])
                    .join('')
                    .slice(0, 2)}
                </span>
                <span>
                  {assessment.owner_name || 'Assign an owner'}
                  <small>Review by {dateLabel(assessment.review_date)}</small>
                </span>
                <button className="quiet" onClick={editBrief} disabled={data.role === 'viewer'}>
                  Edit <ArrowUpRight size={13} />
                </button>
              </div>
              {assessment.analyst_note && <p className="analyst-note">{assessment.analyst_note}</p>}
            </section>
          </div>
          <div className="report-footer">
            <span>
              <ShieldCheck size={13} />
              Calculated from saved evidence · {b.rule_version}
            </span>
            <button className="quiet" onClick={() => setReasoning(true)}>
              Method & limitations <ArrowUpRight size={13} />
            </button>
          </div>
        </>
      )}
      {reasoning && (
        <Dialog title="How we reached this recommendation" close={() => setReasoning(false)} drawer>
          <div className="drawer-tag">
            <Sparkles size={14} /> Deterministic rulebook · {b.rule_version}
          </div>
          <h3>{stateLabels[b.state]}</h3>
          <p>{b.summary}</p>
          <h4>Four separate evidence dimensions</h4>
          <dl className="definition-list">
            {Object.entries(b.dimensions).map(([k, v]) => (
              <div key={k}>
                <dt>{k.replaceAll('_', ' ')}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <h4>Competing explanations</h4>
          <ul className="prose-list">
            {b.contradictions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {b.missing.length > 0 && (
            <>
              <h4>Missing evidence</h4>
              <ul className="prose-list">
                {b.missing.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
          <h4>What would change this recommendation?</h4>
          <p>{b.what_would_change}</p>
          <h4>Limits of this analysis</h4>
          <ul className="prose-list">
            {b.limitations.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <button
            className="button"
            onClick={() => {
              setReasoning(false)
              source()
            }}
          >
            Open source evidence <ExternalLink size={15} />
          </button>
        </Dialog>
      )}
    </>
  )
}

export function SourceDrawer({ source, close }: { source: Source; close: () => void }) {
  return (
    <Dialog title="Follow the evidence" close={close} drawer>
      <div className="drawer-tag">
        <Layers size={14} />
        {source.source === 'demo'
          ? 'Fabricated demo fixture'
          : source.source === 'posthog'
            ? 'PostHog aggregate endpoint'
            : 'Reviewed aggregate import'}
      </div>
      <h3>{String(source.source_metadata.name || 'Analytics snapshot')}</h3>
      <p>
        Counts are computed under metric definition v{source.contract.version}. This source is a
        saved, immutable snapshot.
      </p>
      <dl className="definition-list">
        <div>
          <dt>Collected</dt>
          <dd>
            {dateLabel(source.collected_at)} · {new Date(source.collected_at).toLocaleTimeString()}
          </dd>
        </div>
        <div>
          <dt>Latest event</dt>
          <dd>
            {source.latest_event_at
              ? new Date(source.latest_event_at).toUTCString()
              : 'Not supplied'}
          </dd>
        </div>
        <div>
          <dt>Analysis cutoff</dt>
          <dd>{new Date(source.analysis_cutoff).toUTCString()}</dd>
        </div>
        <div>
          <dt>Completeness</dt>
          <dd>
            {source.quality.completeness_verified
              ? 'Confirmed for this snapshot'
              : 'Unverified · assumed cutoff'}
          </dd>
        </div>
        <div>
          <dt>Counting unit</dt>
          <dd>Identified users</dd>
        </div>
      </dl>
      <h4>The metric contract</h4>
      <div className="event-mapping">
        <span>Signup</span>
        <code>{source.contract.config.entry_event}</code>
        <ArrowDown size={14} />
        <span>First delivered value · [0, 7 days)</span>
        <code>{source.contract.config.value_event}</code>
        <ArrowDown size={14} />
        <span>Repeated value · [21, 28 days)</span>
        <code>{source.contract.config.return_event}</code>
      </div>
      <h4>Coverage checks</h4>
      <ul className="quality-list">
        {[
          'definitions_verified',
          'identity_verified',
          'completeness_verified',
          'sampling_verified',
        ].map((k) => (
          <li key={k}>
            {source.quality[k] ? <Check size={15} /> : <CircleDashed size={15} />}
            <span>{k.replaceAll('_', ' ')}</span>
            <strong>{source.quality[k] ? 'Confirmed' : 'Unverified'}</strong>
          </li>
        ))}
      </ul>
      <h4>Original aggregate rows</h4>
      <CohortTable rows={source.rows} />
      <h4>Exclusions</h4>
      <p>{source.exclusions}</p>
      <p>
        Windows use elapsed UTC days from first-observed eligible signup. A latest-event timestamp
        does not establish ingestion completeness.
      </p>
      <h4>Evidence fingerprint</h4>
      <code className="hash">{source.content_hash}</code>
      <small className="muted">Snapshot {source.id}</small>
    </Dialog>
  )
}
