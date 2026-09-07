import { useState } from 'react'
import {
  Plus,
  ArrowUpRight,
  FlaskConical,
  FileUp,
  Users,
  ArrowRight,
  Download,
  Info,
  Sparkles,
  Check,
  LockKeyhole,
  MessageSquare,
  Trash2,
} from 'lucide-react'
import type { Overview, Study, Session, HumanSummary } from './types'
import { api, download, number, dateLabel } from './api'
import { Dialog, Field, Empty, Submit, formValues } from './ui'

const colors = ['#e8e4f2', '#cdc4e7', '#afa1d7', '#8b78c8', '#6755b1']
export default function ConceptLab({
  data,
  session,
  reload,
  notify,
}: {
  data: Overview
  session: Session
  reload: () => Promise<void>
  notify: (s: string) => void
}) {
  const [selected, setSelected] = useState(data.studies[0]?.id || '')
  const [tab, setTab] = useState('human')
  const [modal, setModal] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<string | null>(null)
  const [conceptCount, setConceptCount] = useState(3)
  const study = data.studies.find((s) => s.id === selected) || data.studies[0]
  const open = (name: string) => {
    setError('')
    setModal(name)
  }
  const editable = data.role !== 'viewer'
  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await work()
      await reload()
      setModal('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const human = study?.human_summary || {}
  const synthetic = study?.datasets[0]?.metadata.synthetic
  const latestRun = study?.runs[0]
  const summary = latestRun?.summary as
    | {
        concepts?: Record<
          string,
          { ssr?: number[]; direct?: number[]; followup?: number[]; n?: number }
        >
        evaluation?: { validation?: string; ordering_status?: string }
      }
    | undefined
  const [method, setMethod] = useState<'ssr' | 'direct' | 'followup'>('ssr')
  return (
    <>
      <div className="lab-intro">
        <span className="lab-intro-icon">
          <FlaskConical size={21} />
        </span>
        <p>
          Compare ideas. Keep the evidence in perspective.
          <small>
            Concept ratings help you ask better questions. They don’t predict purchase or retention.
          </small>
        </p>
        <button className="button" disabled={!editable} onClick={() => open('new')}>
          New study <Plus size={15} />
        </button>
      </div>
      {!study ? (
        <Empty
          title="Start with a question."
          action={
            <button className="button primary" onClick={() => open('new')}>
              Create a concept study <Plus size={15} />
            </button>
          }
        >
          Add three to five concepts and compare feedback from the audience you want to understand.
          PostHog is optional.
        </Empty>
      ) : (
        <div className="lab-workspace">
          <aside className="study-nav">
            <span className="eyebrow">
              YOUR STUDIES <span>{data.studies.length}</span>
            </span>
            {data.studies.map((s) => (
              <button
                className={study.id === s.id ? 'active' : ''}
                key={s.id}
                onClick={() => {
                  setSelected(s.id)
                  setTab('human')
                }}
              >
                <span className="study-nav-icon">
                  <FlaskConical size={16} />
                </span>
                <span>
                  {s.title}
                  <small>
                    {s.concepts.length} concepts · v{s.version}
                  </small>
                </span>
              </button>
            ))}
            <div className="study-nav-note">
              <LockKeyhole size={15} />
              <p>
                Private to your workspace.
                <br />
                Concept versions stay frozen.
              </p>
            </div>
          </aside>
          <div className="study-main">
            <div className="study-heading">
              <span className="eyebrow">CONCEPT STUDY · V{study.version}</span>
              <h2>{study.title}</h2>
              <p>{study.question}</p>
              <div className="study-audience">
                <Users size={14} />
                {study.audience}
              </div>
            </div>
            <div className="report-tabs">
              <button className={tab === 'human' ? 'active' : ''} onClick={() => setTab('human')}>
                Human feedback
              </button>
              <button
                className={tab === 'synthetic' ? 'active' : ''}
                onClick={() => setTab('synthetic')}
              >
                Synthetic comparison <span>Lab</span>
              </button>
              <button className={tab === 'setup' ? 'active' : ''} onClick={() => setTab('setup')}>
                Study details
              </button>
            </div>
            {tab === 'setup' ? (
              <div className="study-details">
                <h3>One hypothesis. A reproducible comparison.</h3>
                <dl className="definition-list">
                  <div>
                    <dt>Hypothesis</dt>
                    <dd>{study.hypothesis || 'Not specified'}</dd>
                  </div>
                  <div>
                    <dt>Question</dt>
                    <dd>{study.question}</dd>
                  </div>
                  <div>
                    <dt>Audience</dt>
                    <dd>{study.audience}</dd>
                  </div>
                </dl>
                <h4>Frozen concept versions</h4>
                {study.concepts.map((c) => (
                  <div className="concept-detail" key={c.id}>
                    <h3>{c.name}</h3>
                    <p>{c.description}</p>
                    <span className="small-label">
                      {c.split.replace('_', ' ')} · group {c.group} · v{c.version}
                    </span>
                    <code className="hash">{c.id}</code>
                  </div>
                ))}
                <div className="notice">
                  <Info size={16} />
                  Related concepts remain in the same development or held-out group. Anchors must be
                  frozen before evaluating held-out labels.
                </div>
              </div>
            ) : (
              <>
                {tab === 'human' ? (
                  <div className="study-toolbar">
                    <div>
                      <span className={`status-label ${synthetic ? 'demo-label' : ''}`}>
                        <span />
                        {synthetic ? 'Illustrative ratings' : 'Reported by people'}
                      </span>
                      <small>
                        {Object.values(human).reduce((n, s) => n + s.n, 0)} responses across{' '}
                        {study.concepts.length} concepts
                      </small>
                    </div>
                    <button className="button" disabled={!editable} onClick={() => open('import')}>
                      <FileUp size={15} />
                      Import human CSV
                    </button>
                  </div>
                ) : (
                  <div className="study-toolbar">
                    <div>
                      <span className="status-label demo-label">
                        <span />
                        Experimental · unvalidated
                      </span>
                      <small>Generated reactions are not independent human respondents.</small>
                    </div>
                    <button
                      className="button primary"
                      disabled={!editable}
                      onClick={() => open('run')}
                    >
                      <Sparkles size={15} />
                      Run comparison
                    </button>
                  </div>
                )}
                {tab === 'human' && synthetic && (
                  <div className="notice">
                    <Info size={16} />
                    These example ratings are fabricated. Import a consented study to see real human
                    feedback.
                  </div>
                )}
                {tab === 'synthetic' && (
                  <div className="method-tabs">
                    {[
                      ['ssr', 'Semantic similarity'],
                      ['direct', 'Direct numeric'],
                      ['followup', 'Text → rating'],
                    ].map(([key, label]) => (
                      <button
                        className={method === key ? 'active' : ''}
                        key={key}
                        onClick={() => setMethod(key as typeof method)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {tab === 'synthetic' && !latestRun ? (
                  <Empty
                    title="Ideas to investigate, not a verdict."
                    action={
                      <button className="button" disabled={!editable} onClick={() => open('run')}>
                        Configure a comparison <ArrowRight size={15} />
                      </button>
                    }
                  >
                    A bounded panel compares SSR with simpler rating methods. You control the spend,
                    and every run preserves its configuration.
                  </Empty>
                ) : (
                  <div className="concept-grid">
                    {study.concepts.map((c, i) => {
                      const stats = human[c.id]
                      const dist =
                        tab === 'human' ? stats?.distribution : summary?.concepts?.[c.id]?.[method]
                      const mean = dist ? dist.reduce((s, v, i) => s + (i + 1) * v, 0) : null
                      return (
                        <article className="concept-card" key={c.id}>
                          <div className="concept-top">
                            <span className="concept-letter">{String.fromCharCode(65 + i)}</span>
                            <span>
                              Concept {i + 1} <span>· v{c.version}</span>
                            </span>
                            <button
                              className="icon-button"
                              aria-label={`Inspect ${c.name}`}
                              onClick={() => setDetail(c.id)}
                            >
                              <ArrowUpRight size={16} />
                            </button>
                          </div>
                          <h3>{c.name}</h3>
                          <p>{c.description}</p>
                          <div className="concept-score">
                            <strong>
                              {number(mean, 2)}
                              <small>/ 5</small>
                            </strong>
                            <span>
                              {tab === 'human'
                                ? `${stats?.n || 0} ${synthetic ? 'example' : 'human'} ratings`
                                : 'Generated distribution'}
                              <small>Descriptive mean</small>
                            </span>
                          </div>
                          {dist ? (
                            <>
                              <div
                                className="distribution-chart"
                                role="img"
                                aria-label={`Ratings 1 through 5: ${dist.map((v) => number(v * 100, 0) + '%').join(', ')}`}
                              >
                                {dist.map((p, i) => (
                                  <div key={i}>
                                    <span className="bar-value">{number(p * 100, 0)}%</span>
                                    <span
                                      className="dist-bar"
                                      style={{
                                        height: `${Math.max(3, p * 180)}px`,
                                        background: colors[i],
                                      }}
                                    />
                                    <span className="dist-label">{i + 1}</span>
                                  </div>
                                ))}
                              </div>
                              <details className="distribution-data">
                                <summary>Rating distribution</summary>
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Rating</th>
                                      <th>Share</th>
                                      {tab === 'human' && <th>Count</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {dist.map((p, i) => (
                                      <tr key={i}>
                                        <td>{i + 1}</td>
                                        <td>{number(p * 100)}%</td>
                                        {tab === 'human' && <td>{stats?.counts[i]}</td>}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </details>
                            </>
                          ) : (
                            <div className="no-ratings">No completed responses yet.</div>
                          )}
                          <div className="concept-bottom">
                            <CircleBadge />{' '}
                            {c.split === 'held_out' ? 'Held-out concept' : 'Development concept'}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
                {tab === 'synthetic' && latestRun && (
                  <div className="run-status">
                    <div>
                      <span className="eyebrow">LATEST RUN</span>
                      <h3>
                        {latestRun.job.status.replaceAll('_', ' ')} · {latestRun.job.progress}%
                      </h3>
                      <p>
                        Measured ${number(Number(latestRun.spent), 4)} · reserved $
                        {number(Number(latestRun.reserved), 4)} · uncertain $
                        {number(Number(latestRun.uncertain_cost), 4)}
                      </p>
                      {latestRun.job.error && <p className="error">{latestRun.job.error}</p>}
                    </div>
                    {['queued', 'running'].includes(latestRun.job.status) && (
                      <button
                        className="button"
                        onClick={() =>
                          run(async () => {
                            await api(`/jobs/${latestRun.job.id}/cancel`, 'POST')
                            notify('Cancellation requested. Completed work is preserved.')
                          })
                        }
                      >
                        Cancel run
                      </button>
                    )}
                    <span className="muted">
                      Ordering evidence: {summary?.evaluation?.ordering_status || 'inconclusive'}
                    </span>
                  </div>
                )}
                <div className="research-caution">
                  <MessageSquare size={20} />
                  <div>
                    <h3>A preference is a starting point.</h3>
                    <p>
                      Recruitment, wording, and the audience shape these ratings. Validate a
                      specific hypothesis with a real experiment before changing direction.
                    </p>
                  </div>
                </div>
                {tab === 'human' && (
                  <section className="dataset-section">
                    <div className="section-heading">
                      <h3>Source datasets</h3>
                      <button
                        className="quiet"
                        onClick={() => download(`/studies/${study.id}/human-template`)}
                      >
                        <Download size={13} />
                        CSV template
                      </button>
                    </div>
                    {study.datasets.length ? (
                      study.datasets.map((d) => (
                        <div className="dataset-row" key={d.id}>
                          <span className="file-icon">
                            <FileUp size={17} />
                          </span>
                          <span>
                            <strong>{d.name}</strong>
                            <small>
                              {d.metadata.recruitment_source} ·{' '}
                              {d.expired
                                ? 'Raw rows expired'
                                : `Raw rows expire ${dateLabel(d.expires_at)}`}
                            </small>
                          </span>
                          <span>{d.response_count} responses</span>
                          {data.role === 'owner' && (
                            <button
                              className="icon-button danger-text"
                              aria-label={`Delete dataset ${d.name}`}
                              onClick={() => {
                                setDetail(d.id)
                                open('delete')
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="muted">No datasets imported. Download the template to start.</p>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {modal === 'new' && (
        <Dialog title="Create a concept study" close={() => setModal('')} wide>
          <form
            onSubmit={(e) => {
              const v = formValues(e)
              void run(async () => {
                const created = await api<Study>(`/projects/${data.project.id}/studies`, 'POST', {
                  title: v.title,
                  audience: v.audience,
                  question: v.question,
                  hypothesis: v.hypothesis,
                  concepts: Array.from({ length: conceptCount }, (_, i) => ({
                    name: v[`name${i}`],
                    description: v[`description${i}`],
                    group: v[`group${i}`],
                    split: v[`split${i}`],
                  })),
                })
                setSelected(created.id)
                notify('Study created with frozen concept versions.')
              })
            }}
          >
            <div className="form-grid">
              <Field label="Study title">
                <input
                  name="title"
                  required
                  maxLength={160}
                  placeholder="Find the right first promise"
                />
              </Field>
              <Field label="Intended audience">
                <input
                  name="audience"
                  required
                  minLength={5}
                  defaultValue={data.project.audience}
                />
              </Field>
            </div>
            <Field label="The question people will answer">
              <input
                name="question"
                required
                minLength={5}
                placeholder="How likely would you be to use this concept?"
              />
            </Field>
            <Field label="Product hypothesis">
              <textarea name="hypothesis" rows={2} placeholder="What are you trying to learn?" />
            </Field>
            <div className="section-heading">
              <h3>Concepts to compare</h3>
              <label className="inline-select">
                Concepts
                <select
                  value={conceptCount}
                  onChange={(e) => setConceptCount(Number(e.target.value))}
                >
                  {[3, 4, 5].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            {Array.from({ length: conceptCount }, (_, i) => (
              <div className="concept-form" key={i}>
                <span className="concept-letter">{String.fromCharCode(65 + i)}</span>
                <div>
                  <Field label={`Concept ${i + 1} name`}>
                    <input name={`name${i}`} required maxLength={120} />
                  </Field>
                  <Field label="Description">
                    <textarea
                      name={`description${i}`}
                      required
                      minLength={10}
                      maxLength={3000}
                      rows={2}
                    />
                  </Field>
                  <div className="form-grid">
                    <Field label="Concept family / group">
                      <input name={`group${i}`} required defaultValue={`concept-${i + 1}`} />
                    </Field>
                    <Field label="Evaluation split">
                      <select name={`split${i}`}>
                        <option value="development">Development</option>
                        <option value="held_out">Held out</option>
                      </select>
                    </Field>
                  </div>
                </div>
              </div>
            ))}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <span>Versions freeze when you create the study.</span>
              <Submit busy={busy} label="Create study" />
            </div>
          </form>
        </Dialog>
      )}
      {modal === 'import' && study && (
        <Dialog title="Import human feedback" close={() => setModal('')}>
          <p>
            Use anonymous respondent IDs. Ratings must answer this study’s question using the exact
            concept-version IDs in the template.
          </p>
          <button
            className="button"
            onClick={() => download(`/studies/${study.id}/human-template`)}
          >
            <Download size={15} />
            Download CSV template
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              void run(async () => {
                await api(`/studies/${study.id}/human-data`, 'POST', fd)
                notify('Human feedback imported. Original concept versions are preserved.')
              })
            }}
          >
            <Field label="Ratings CSV · UTF-8, up to 5 MB">
              <input name="file" type="file" accept=".csv,text/csv" required />
            </Field>
            <Field label="Recruitment source and exclusions">
              <textarea
                name="recruitment_source"
                required
                minLength={3}
                maxLength={1000}
                placeholder="Who participated, how they were recruited, and who was excluded."
              />
            </Field>
            <label className="checkbox">
              <input type="checkbox" name="consent" value="true" required />
              <span>
                I have consent to use this research and have removed direct identifiers. The
                question and concept stimuli match this study.
              </span>
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <span>Raw rows expire after {data.project.raw_retention_days} days.</span>
              <Submit busy={busy} label="Import feedback" />
            </div>
          </form>
        </Dialog>
      )}
      {modal === 'run' && study && (
        <Dialog title="Configure a synthetic comparison" close={() => setModal('')}>
          <div className="notice">
            <FlaskConical size={18} />
            Experimental method. No held-out SaaS validation is established.
          </div>
          <p>
            The run freezes these concept versions, audience, anchors, provider model, and spend
            cap. SSR and follow-up ratings use the same generated reactions.
          </p>
          {!session.model_enabled && (
            <div className="error">
              A generation provider is not configured. Set MODEL_API_KEY, MODEL_NAME, and current
              token prices on the server to enable runs.
            </div>
          )}
          <form
            onSubmit={(e) => {
              const v = formValues(e)
              void run(async () => {
                await api(
                  `/studies/${study.id}/runs`,
                  'POST',
                  { personas: Number(v.personas), budget: Number(v.budget), consent: true },
                  crypto.randomUUID(),
                )
                notify('Comparison queued. You can leave this screen while it runs.')
              })
            }}
          >
            <div className="form-grid">
              <Field label="Exploratory personas">
                <input name="personas" type="number" min="1" max="10" defaultValue="3" required />
              </Field>
              <Field label="Maximum spend (USD)">
                <input
                  name="budget"
                  type="number"
                  min="0.01"
                  max={Number(data.project.run_budget_limit)}
                  step="0.01"
                  defaultValue={Math.min(1, Number(data.project.run_budget_limit))}
                  required
                />
              </Field>
            </div>
            <p className="muted">
              Serial bounded calls; at most 10 personas per concept. Ambiguous provider timeouts are
              counted as uncertain spend and are not blindly retried.
            </p>
            <label className="checkbox">
              <input name="consent" type="checkbox" required />
              <span>
                I approve sending these concept descriptions and the reviewed audience to the
                configured provider. No analytics credentials or customer histories are included.
              </span>
            </label>
            {error && <p className="error">{error}</p>}
            <div className="form-actions">
              <span>
                Owner’s per-run limit: ${number(Number(data.project.run_budget_limit), 2)}
              </span>
              <Submit busy={busy} disabled={!session.model_enabled} label="Queue comparison" />
            </div>
          </form>
        </Dialog>
      )}
      {modal === 'delete' && (
        <Dialog
          title="Delete this research dataset?"
          close={() => {
            setModal('')
            setDetail(null)
          }}
        >
          <p>
            This removes the imported rows, saved distributions, and dependent comparison summaries.
            This cannot be undone in the application.
          </p>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button
              className="button"
              onClick={() => {
                setModal('')
                setDetail(null)
              }}
            >
              Keep dataset
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api(`/datasets/${detail}`, 'DELETE')
                  setDetail(null)
                  notify('Dataset and dependent comparison summaries deleted.')
                })
              }
            >
              Delete dataset
            </button>
          </div>
        </Dialog>
      )}
      {detail && modal !== 'delete' && study?.concepts.some((c) => c.id === detail) && (
        <Dialog
          title={study.concepts.find((c) => c.id === detail)!.name}
          close={() => setDetail(null)}
          drawer
        >
          <span className="eyebrow">FROZEN CONCEPT VERSION</span>
          <p>{study.concepts.find((c) => c.id === detail)!.description}</p>
          <h4>Rating distribution</h4>
          <RatingTable stats={human[detail]} />
          <h4>Provenance</h4>
          <p>
            {synthetic
              ? 'Fabricated example data. No real human participants.'
              : study.datasets[0]?.metadata.recruitment_source || 'No dataset imported.'}
          </p>
          <code className="hash">{detail}</code>
          <p>
            Generated concept ratings never become behavioral observations and cannot override the
            measured cohort analysis.
          </p>
        </Dialog>
      )}
    </>
  )
}
function CircleBadge() {
  return <Check size={12} />
}
function RatingTable({ stats }: { stats?: HumanSummary }) {
  return stats ? (
    <table>
      <thead>
        <tr>
          <th>Rating</th>
          <th>Count</th>
          <th>Share</th>
        </tr>
      </thead>
      <tbody>
        {stats.counts.map((n, i) => (
          <tr key={i}>
            <td>{i + 1}</td>
            <td>{n}</td>
            <td>{number(stats.distribution[i] * 100)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <p>No ratings imported.</p>
  )
}
