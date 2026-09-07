import { useState, useEffect } from 'react'
import {
  Database,
  ArrowUpRight,
  Link2,
  FileUp,
  Check,
  ShieldCheck,
  ArrowDown,
  CalendarDays,
  RefreshCw,
  Unplug,
  KeyRound,
  Download,
  Trash2,
  Layers,
  LockKeyhole,
} from 'lucide-react'
import type { Overview } from './types'
import { api, dateLabel, download } from './api'
import { Dialog, Field, Submit, formValues } from './ui'

export default function Settings({
  data,
  reload,
  notify,
  onDeleted,
}: {
  data: Overview
  reload: () => Promise<void>
  notify: (s: string) => void
  onDeleted: () => Promise<void>
}) {
  const [tab, setTab] = useState('sources'),
    [modal, setModal] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [members, setMembers] = useState<
    { user_id: number; username: string; role: string; can_export: boolean }[]
  >([])
  const c = data.contract,
    owner = data.role === 'owner',
    editable = data.role !== 'viewer'
  useEffect(() => {
    if (tab === 'privacy' && owner) {
      let active = true
      api<typeof members>(`/projects/${data.project.id}/members`)
        .then((v) => {
          if (active) setMembers(v)
        })
        .catch((e) => {
          if (active) setError((e as Error).message)
        })
      return () => {
        active = false
      }
    }
  }, [tab, owner, data])
  const open = (s: string) => {
    setError('')
    setModal(s)
  }
  const run = async (action: () => Promise<void>, close = true) => {
    setError('')
    setBusy(true)
    try {
      await action()
      await reload()
      if (close) setModal('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const qualityFields = [
    ['definitions_verified', 'Metric definitions reconciled with the source'],
    ['identity_verified', 'Canonical user identity and exclusions verified'],
    ['completeness_verified', 'Completeness through the cutoff confirmed'],
    ['sampling_verified', 'Sampling and coverage verified'],
  ]
  return (
    <>
      <div className="report-tabs settings-tabs">
        {[
          ['sources', 'Data sources'],
          ['definition', 'Metric definition'],
          ['context', 'Product context'],
          ['privacy', 'Privacy & access'],
        ].map(([key, label]) => (
          <button
            className={tab === key ? 'active' : ''}
            key={key}
            onClick={() => {
              setError('')
              setTab(key)
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'sources' && (
        <>
          <div className="settings-intro">
            <h2>Good decisions start with known data.</h2>
            <p>
              Connect a supported source or bring reviewed aggregates. Confirm what your events
              actually mean before interpreting them.
            </p>
          </div>
          <div className="source-cards">
            <section className="source-card">
              <div className="source-card-top">
                <span className="provider-logo" aria-hidden="true">
                  ▥
                </span>
                <span className={`status-label ${data.connection ? 'good' : ''}`}>
                  <span />
                  {data.connection ? 'Connected' : 'Available for setup'}
                </span>
              </div>
              <h3>PostHog</h3>
              <p>
                Bounded aggregate endpoints for acquisition, activation, and recurring value. Your
                API key stays on the server.
              </p>
              <div className="source-capabilities">
                <span>
                  <Check size={13} />
                  US & EU cloud
                </span>
                <span>
                  <Check size={13} />
                  Read-only refresh
                </span>
              </div>
              {data.connection ? (
                <>
                  <div className="connection-details">
                    <span>
                      Project {data.connection.external_project_id} ·{' '}
                      {data.connection.region.toUpperCase()}
                    </span>
                    <span>
                      {data.connection.last_refresh
                        ? `Refreshed ${dateLabel(data.connection.last_refresh)}`
                        : 'Ready for first refresh'}
                    </span>
                  </div>
                  {data.connection.last_error && (
                    <div className="error">{data.connection.last_error}</div>
                  )}
                  <div className="source-buttons">
                    <button
                      className="button primary"
                      disabled={!editable}
                      onClick={() => open('refresh')}
                    >
                      <RefreshCw size={14} />
                      Refresh aggregates
                    </button>
                    <button
                      className="icon-button"
                      disabled={!owner}
                      aria-label="Disconnect PostHog"
                      onClick={() => open('disconnect')}
                    >
                      <Unplug size={16} />
                    </button>
                  </div>
                </>
              ) : (
                <button className="button" disabled={!owner} onClick={() => open('connect')}>
                  <Link2 size={15} />
                  Connect PostHog <ArrowUpRight size={14} />
                </button>
              )}
            </section>
            <section className="source-card">
              <div className="source-card-top">
                <span className="file-provider">
                  <FileUp size={25} />
                </span>
                <span className="small-label">NO CREDENTIALS NEEDED</span>
              </div>
              <h3>Aggregate CSV</h3>
              <p>
                Import reviewed signup cohorts and event counts. The same definitions, maturity
                checks, and source trail apply.
              </p>
              <div className="source-capabilities">
                <span>
                  <Check size={13} />
                  Up to 2,000 rows
                </span>
                <span>
                  <Check size={13} />5 MB maximum
                </span>
              </div>
              <div className="source-buttons">
                <button className="button" disabled={!editable} onClick={() => open('import')}>
                  <FileUp size={15} />
                  Import aggregates
                </button>
                <button className="quiet" onClick={() => download('/templates/aggregates')}>
                  Template <Download size={13} />
                </button>
              </div>
            </section>
          </div>
          <div className="integration-note">
            <ShieldCheck size={20} />
            <div>
              <h3>Your analytics are evidence, not a verdict.</h3>
              <p>
                ConceptBench reads approved aggregates through PostHog Endpoints. Live compatibility
                must be reconciled against your deployment. It does not export raw customer activity
                or modify your flags and experiments.
              </p>
            </div>
          </div>
          <div className="settings-section">
            <div className="section-heading">
              <h3>Recent background activity</h3>
              <button className="quiet" onClick={() => run(async () => {}, false)} disabled={busy}>
                <RefreshCw size={13} />
                Refresh status
              </button>
            </div>
            {data.jobs.length ? (
              data.jobs.map((j) => (
                <div className="job-row" key={j.id}>
                  <RefreshCw size={16} className={j.status === 'running' ? 'spin' : ''} />
                  <span>
                    <strong>{j.kind.replaceAll('_', ' ')}</strong>
                    <small>{j.error || `${j.progress}% complete`}</small>
                  </span>
                  <span className="neutral-pill">{j.status.replaceAll('_', ' ')}</span>
                  {['queued', 'running'].includes(j.status) && editable && (
                    <button
                      className="quiet"
                      onClick={() =>
                        run(async () => {
                          await api(`/jobs/${j.id}/cancel`, 'POST')
                          notify('Cancellation requested.')
                        }, false)
                      }
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="empty-inline">
                <Layers size={17} />
                <span>No background jobs yet. Imported snapshots are available immediately.</span>
              </div>
            )}
          </div>
        </>
      )}
      {tab === 'definition' && (
        <>
          <div className="settings-intro">
            <span className="eyebrow">
              {c ? `CURRENT DEFINITION · V${c.version}` : 'START HERE'}
            </span>
            <h2>Define what delivered value looks like.</h2>
            <p>
              Event names can suggest a mapping. Only your team can confirm it. Each change creates
              a new frozen version.
            </p>
          </div>
          <form
            className="settings-form"
            onSubmit={(e) => {
              const v = formValues(e)
              void run(async () => {
                await api(`/projects/${data.project.id}/metric-contracts`, 'POST', {
                  entry_event: v.entry_event,
                  value_event: v.value_event,
                  return_event: v.return_event,
                  segment_properties: v.segments
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                  minimum_detectable_change_pp: v.effect ? Number(v.effect) : null,
                  viability_target: v.target ? Number(v.target) : null,
                  baseline_approved: v.baseline === 'on',
                  review_windows: [0, 1, 2, 3, 4, 5]
                    .map((i) => ({ start: v[`window_start_${i}`], end: v[`window_end_${i}`] }))
                    .filter((w) => w.start || w.end),
                  confirmed: true,
                })
                notify(
                  'Metric contract saved. Reconcile new data before interpreting this definition.',
                )
              }, false)
            }}
          >
            <div className="mapping-row">
              <span className="mapping-number">1</span>
              <Field label="Eligible signup event">
                <input
                  name="entry_event"
                  defaultValue={c?.config.entry_event || 'account_created'}
                  required
                  maxLength={120}
                />
              </Field>
            </div>
            <div className="mapping-connector">
              <ArrowDown size={15} />
            </div>
            <div className="mapping-row">
              <span className="mapping-number">2</span>
              <Field label="First value event · within 7 days">
                <input
                  name="value_event"
                  defaultValue={c?.config.value_event || ''}
                  required
                  maxLength={120}
                  placeholder="first_report_completed"
                />
              </Field>
            </div>
            <div className="mapping-connector">
              <ArrowDown size={15} />
            </div>
            <div className="mapping-row">
              <span className="mapping-number">3</span>
              <Field label="Return value event · days 21–28">
                <input
                  name="return_event"
                  defaultValue={c?.config.return_event || ''}
                  required
                  maxLength={120}
                  placeholder="report_completed"
                />
              </Field>
            </div>
            <Field
              label="Approved segment properties"
              hint="One to three non-sensitive properties, separated by commas. Use joint, mutually exclusive segment cells in imports."
            >
              <input
                name="segments"
                defaultValue={
                  c?.config.segment_properties.join(', ') || 'initial_acquisition_source'
                }
                required
              />
            </Field>
            <div className="definition-constant">
              <span>
                <UsersIcon />
                Identified users
              </span>
              <span>
                <CalendarDays size={14} />
                Elapsed UTC days
              </span>
              <span>
                <ShieldCheck size={14} />
                Internal traffic excluded
              </span>
            </div>
            <div className="form-grid">
              <Field label="Minimum useful change (pp)" hint="Leave blank until the team agrees.">
                <input
                  name="effect"
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  defaultValue={c?.config.minimum_detectable_change_pp ?? ''}
                  placeholder="Not set"
                />
              </Field>
              <Field
                label="Viability target (%)"
                hint="There is no universal good-retention target."
              >
                <input
                  name="target"
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  defaultValue={c?.config.viability_target ?? ''}
                  placeholder="Not set"
                />
              </Field>
            </div>
            <details className="review-windows">
              <summary>Predeclare future review windows (optional)</summary>
              <p className="muted">
                For a persistent shortfall assessment, approve at least two disjoint signup windows
                before they begin. Later edits create a new definition. Leave unused pairs blank.
              </p>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div className="form-grid" key={i}>
                  <Field label={`Window ${i + 1} starts (UTC)`}>
                    <input
                      name={`window_start_${i}`}
                      type="date"
                      defaultValue={c?.config.review_windows?.[i]?.start}
                    />
                  </Field>
                  <Field label={`Window ${i + 1} ends (UTC)`}>
                    <input
                      name={`window_end_${i}`}
                      type="date"
                      defaultValue={c?.config.review_windows?.[i]?.end}
                    />
                  </Field>
                </div>
              ))}
            </details>
            <label className="checkbox">
              <input name="baseline" type="checkbox" defaultChecked={c?.config.baseline_approved} />
              <span>Our earlier cohort is the approved baseline for this review window.</span>
            </label>
            <label className="checkbox">
              <input name="confirmed" type="checkbox" required />
              <span>
                I reviewed these events and confirm that they represent eligible signup and
                delivered value for this audience.
              </span>
            </label>
            {error && <p className="error">{error}</p>}
            <div className="form-actions">
              <span>Historical briefs keep their original definition.</span>
              <Submit busy={busy} disabled={!editable} label="Approve definition" />
            </div>
          </form>
        </>
      )}
      {tab === 'context' && (
        <>
          <div className="settings-intro">
            <h2>What is your product trying to do?</h2>
            <p>The context your analytics cannot supply.</p>
          </div>
          <form
            className="settings-form"
            onSubmit={(e) => {
              const v = formValues(e)
              void run(async () => {
                await api(`/projects/${data.project.id}`, 'PATCH', { ...v, cadence: 'weekly' })
                notify('Product context saved.')
              }, false)
            }}
          >
            <Field label="Project name">
              <input name="name" required maxLength={160} defaultValue={data.project.name} />
            </Field>
            <Field label="Product promise">
              <textarea
                name="promise"
                rows={3}
                maxLength={2000}
                defaultValue={data.project.promise}
              />
            </Field>
            <Field label="Intended audience">
              <textarea
                name="audience"
                rows={3}
                maxLength={2000}
                defaultValue={data.project.audience}
              />
            </Field>
            <Field label="Current concern">
              <textarea
                name="concern"
                rows={3}
                maxLength={2000}
                defaultValue={data.project.concern}
              />
            </Field>
            <div className="notice">
              <CalendarDays size={17} />
              This pilot uses weekly recurring value and identified users. Account-based or
              different-cadence metrics require a separate contract.
            </div>
            {error && <p className="error">{error}</p>}
            <div className="form-actions">
              <Submit busy={busy} disabled={!editable} />
            </div>
          </form>
        </>
      )}
      {tab === 'privacy' && (
        <>
          <div className="settings-intro">
            <h2>Keep only what the decision needs.</h2>
            <p>Owner-managed retention, private reports, and clear deletion behavior.</p>
          </div>
          <div className="privacy-status">
            <ShieldCheck size={20} />
            <div>
              <strong>Your role: {data.role}</strong>
              <p>
                Owners manage connections, budgets, and deletion. Editors prepare reviews. Viewers
                have read access; private exports require permission.
              </p>
            </div>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {owner && (
            <section className="settings-section">
              <h3>Workspace members</h3>
              <p className="muted">
                Access applies to every project in this workspace. Add an existing registered
                username, or enter a member’s username to change their role.
              </p>
              <div className="member-list">
                {members.map((m) => (
                  <div className="dataset-row" key={m.user_id}>
                    <span>
                      <strong>{m.username}</strong>
                      <small>
                        {m.role} ·{' '}
                        {m.role !== 'viewer' || m.can_export
                          ? 'Exports allowed'
                          : 'No export permission'}
                      </small>
                    </span>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${m.username} from workspace`}
                      onClick={() =>
                        run(async () => {
                          await api(`/projects/${data.project.id}/members/${m.user_id}`, 'DELETE')
                          notify('Workspace access removed.')
                        }, false)
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <form
                className="settings-form"
                onSubmit={(e) => {
                  const v = formValues(e)
                  void run(async () => {
                    await api(`/projects/${data.project.id}/members`, 'PUT', {
                      username: v.member_username,
                      role: v.member_role,
                      can_export: v.member_export === 'on',
                    })
                    notify('Workspace access saved.')
                  }, false)
                }}
              >
                <div className="form-grid">
                  <Field label="Registered username">
                    <input
                      name="member_username"
                      minLength={3}
                      maxLength={100}
                      required
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Workspace role">
                    <select name="member_role" defaultValue="viewer">
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="owner">Owner</option>
                    </select>
                  </Field>
                </div>
                <label className="checkbox">
                  <input name="member_export" type="checkbox" />
                  <span>
                    Allow private exports for this viewer. Owners and editors can already export.
                  </span>
                </label>
                <div className="form-actions">
                  <Submit busy={busy} label="Save access" />
                </div>
              </form>
            </section>
          )}
          <form
            className="settings-form"
            onSubmit={(e) => {
              const v = formValues(e)
              void run(async () => {
                await api(`/projects/${data.project.id}/retention`, 'PUT', {
                  raw_retention_days: Number(v.raw_retention_days),
                  aggregate_retention_days: Number(v.aggregate_retention_days),
                  run_budget_limit: Number(v.run_budget_limit),
                })
                notify('Retention and spending policy saved.')
              }, false)
            }}
          >
            <div className="form-grid">
              <Field label="Raw research retention (days)">
                <input
                  type="number"
                  name="raw_retention_days"
                  min="1"
                  max="30"
                  defaultValue={data.project.raw_retention_days}
                  required
                />
              </Field>
              <Field label="Aggregate report retention (days)">
                <input
                  type="number"
                  name="aggregate_retention_days"
                  min="1"
                  max="90"
                  defaultValue={data.project.aggregate_retention_days}
                  required
                />
              </Field>
            </div>
            <Field label="Maximum spend per synthetic run (USD)">
              <input
                type="number"
                name="run_budget_limit"
                min="0"
                max="100"
                step=".01"
                required
                defaultValue={data.project.run_budget_limit}
              />
            </Field>
            <p className="muted">
              The worker purges expired research rows and copied model text. Aggregate summaries
              survive only until their own expiry. Backups follow the operator’s documented expiry
              policy.
            </p>
            <div className="form-actions">
              <Submit busy={busy} disabled={!owner} label="Save policy" />
            </div>
          </form>
          <section className="danger-zone">
            <div>
              <h3>Delete project data</h3>
              <p>Remove sources, credentials, studies, reports, experiments, and queued work.</p>
            </div>
            <button
              className="button danger-outline"
              disabled={!owner}
              onClick={() => open('delete')}
            >
              Delete project <Trash2 size={14} />
            </button>
          </section>
        </>
      )}
      {modal === 'connect' && (
        <Dialog title="Connect your PostHog project" close={() => setModal('')}>
          <div className="drawer-tag">
            <KeyRound size={15} />
            Self-hosted pilot · scoped personal API key
          </div>
          <p>
            Use a personal API key with project read and endpoint read scopes. A public
            event-capture token cannot read analytics. US and EU cloud hosts are fixed by region.
          </p>
          {!c && <div className="error">Approve a metric definition first.</div>}
          <form
            onSubmit={(e) => {
              const v = formValues(e)
              void run(async () => {
                await api(`/projects/${data.project.id}/connections/posthog`, 'POST', {
                  region: v.region,
                  external_project_id: Number(v.project_id),
                  api_key: v.api_key,
                  endpoint_name: v.endpoint_name,
                  endpoint_version: Number(v.endpoint_version),
                  contract_id: c!.id,
                })
                notify(
                  'PostHog project and endpoint verified. Refresh a reviewed aggregate snapshot next.',
                )
              })
            }}
          >
            <div className="form-grid">
              <Field label="Cloud region">
                <select name="region">
                  <option value="us">US · us.posthog.com</option>
                  <option value="eu">EU · eu.posthog.com</option>
                </select>
              </Field>
              <Field label="PostHog project ID">
                <input name="project_id" type="number" min="1" required />
              </Field>
            </div>
            <Field label="Scoped personal API key">
              <input
                name="api_key"
                type="password"
                autoComplete="off"
                minLength={20}
                required
                placeholder="phx_…"
              />
            </Field>
            <div className="form-grid">
              <Field label="Reviewed aggregate endpoint name">
                <input
                  name="endpoint_name"
                  required
                  pattern="[a-zA-Z0-9_-]+"
                  placeholder="conceptbench-cohorts"
                />
              </Field>
              <Field label="Pinned endpoint version">
                <input name="endpoint_version" type="number" min="1" defaultValue="1" required />
              </Field>
            </div>
            <p className="muted">
              Install a compatible aggregate endpoint in PostHog using the repository’s connector
              contract. Hosted OAuth and assisted installation are not enabled in this pilot.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <span>
                <LockKeyhole size={13} />
                Encrypted at rest on the server
              </span>
              <Submit busy={busy} disabled={!c} label="Verify connection" />
            </div>
          </form>
        </Dialog>
      )}
      {(modal === 'import' || modal === 'refresh') && (
        <Dialog
          title={modal === 'import' ? 'Import reviewed aggregates' : 'Refresh PostHog aggregates'}
          close={() => setModal('')}
        >
          <p>
            Use complete, disjoint signup cohorts and mutually exclusive segment cells. Each
            successful import creates a new snapshot and Decision Brief.
          </p>
          {!c && (
            <div className="error">
              Approve a metric definition in the Metric definition tab first.
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const metadata = {
                contract_id: c!.id,
                analysis_cutoff: new Date(String(fd.get('cutoff'))).toISOString(),
                quality: Object.fromEntries(
                  qualityFields.map(([key]) => [key, fd.get(key) === 'on']),
                ),
                source_name: String(fd.get('source_name') || 'PostHog aggregate endpoint'),
              }
              void run(async () => {
                if (modal === 'import') {
                  const upload = new FormData()
                  upload.append('file', fd.get('file')!)
                  upload.append('metadata', JSON.stringify(metadata))
                  await api(`/projects/${data.project.id}/analytics/csv`, 'POST', upload)
                } else {
                  await api(
                    `/projects/${data.project.id}/analytics/refresh`,
                    'POST',
                    {
                      date_from: fd.get('date_from'),
                      date_to: fd.get('date_to'),
                      analysis_cutoff: metadata.analysis_cutoff,
                      quality: metadata.quality,
                    },
                    crypto.randomUUID(),
                  )
                }
                notify(
                  modal === 'import'
                    ? 'Aggregate snapshot imported and a new brief calculated.'
                    : 'Refresh queued. The last successful report remains available.',
                )
              })
            }}
          >
            {modal === 'import' ? (
              <>
                <Field label="Aggregate CSV (up to 2,000 rows)">
                  <input type="file" name="file" accept=".csv,text/csv" required />
                </Field>
                <Field label="Source name">
                  <input
                    name="source_name"
                    required
                    maxLength={180}
                    placeholder="Reviewed cohort export — September"
                  />
                </Field>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => download('/templates/aggregates')}
                >
                  <Download size={14} />
                  Download the aggregate template
                </button>
              </>
            ) : (
              <div className="form-grid">
                <Field label="From (up to 90 days)">
                  <input type="date" name="date_from" required />
                </Field>
                <Field label="To">
                  <input type="date" name="date_to" required />
                </Field>
              </div>
            )}
            <Field
              label="Analysis cutoff (your local time)"
              hint="An assumed delay is not a verified ingestion watermark."
            >
              <input
                name="cutoff"
                type="datetime-local"
                required
                defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                  .toISOString()
                  .slice(0, 16)}
              />
            </Field>
            <h4>Source-owner checks</h4>
            {qualityFields.map(([key, label]) => (
              <label className="checkbox" key={key}>
                <input type="checkbox" name={key} />
                <span>{label}</span>
              </label>
            ))}
            <p className="muted">
              Unchecked items stay unverified and block definitive interpretation.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <span>Definition v{c?.version || '—'}</span>
              <Submit
                busy={busy}
                disabled={!c}
                label={modal === 'import' ? 'Import & review' : 'Queue refresh'}
              />
            </div>
          </form>
        </Dialog>
      )}
      {modal === 'disconnect' && (
        <Dialog title="Disconnect PostHog?" close={() => setModal('')}>
          <p>
            This deletes the local credential and cancels refreshes. Previously collected reports
            keep their source dates. Revoke your personal API key in PostHog after disconnecting.
          </p>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button className="button" onClick={() => setModal('')}>
              Keep connection
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api(`/connections/${data.connection!.id}`, 'DELETE')
                  notify('Disconnected. Revoke the personal key in PostHog settings.')
                })
              }
            >
              Disconnect
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'delete' && (
        <Dialog title="Delete this project?" close={() => setModal('')}>
          <p>
            Type <strong>{data.project.name}</strong> to delete this project and its private data.
            This action cannot be undone.
          </p>
          <form
            onSubmit={async (e) => {
              const v = formValues(e)
              if (v.confirm !== data.project.name) {
                setError('The project name does not match.')
                return
              }
              setBusy(true)
              try {
                await api(`/projects/${data.project.id}`, 'DELETE')
                setModal('')
                await onDeleted()
                notify('Project and application data deleted.')
              } catch (e) {
                setError((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            <Field label="Project name confirmation">
              <input name="confirm" required />
            </Field>
            {error && <p className="error">{error}</p>}
            <div className="form-actions">
              <button type="submit" className="button danger" disabled={busy}>
                Delete project permanently
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  )
}
function UsersIcon() {
  return <Database size={14} />
}
