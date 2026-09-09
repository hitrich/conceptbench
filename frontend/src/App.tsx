import { useEffect, useState, useCallback } from 'react'
import {
  ArrowUpRight,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  ChartNoAxesCombined,
  FlaskConical,
  CircleDot,
  Database,
  BookOpen,
  Github,
  Download,
  X,
  Check,
  LogOut,
  Menu,
  Sparkles,
  Layers,
} from 'lucide-react'
import type { Overview, Project, Assessment, Session, Source } from './types'
import { api, setCsrf, download } from './api'
import { Dialog, Empty, Field, Loading, Submit, formValues, External } from './ui'
import Review, { SourceDrawer } from './Review'
import ConceptLab from './ConceptLab'
import Experiments, { ExperimentForm } from './Experiments'
import Settings from './Settings'

const nav = [
  { id: 'review', label: 'Review', icon: ChartNoAxesCombined },
  { id: 'lab', label: 'ConceptLab', icon: FlaskConical },
  { id: 'experiments', label: 'Experiments', icon: CircleDot },
  { id: 'data', label: 'Data & Settings', icon: Database },
]
const pageText: Record<string, [string, string]> = {
  review: ['Product review', 'See what the evidence says. Decide what to test next.'],
  lab: ['ConceptLab', 'Explore alternatives with a question worth asking.'],
  experiments: ['Experiments', 'From a considered decision to something you can learn.'],
  data: ['Data & Settings', 'The sources, definitions, and context behind your decisions.'],
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [projects, setProjects] = useState<Project[]>([]),
    [projectId, setProjectId] = useState(''),
    [data, setData] = useState<Overview | null>(null),
    [assessment, setAssessment] = useState<Assessment | null>(null)
  const [route, setRoute] = useState(
    nav.some((n) => n.id === location.hash.slice(1)) ? location.hash.slice(1) : 'review',
  )
  const [loading, setLoading] = useState(true),
    [fatal, setFatal] = useState(''),
    [toast, setToast] = useState(''),
    [modal, setModal] = useState(''),
    [source, setSource] = useState<Source | null>(null),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState(''),
    [search, setSearch] = useState(''),
    [mobileNav, setMobileNav] = useState(false)
  const query = search.trim().toLowerCase()
  const matchingPages = nav.filter((n) => n.label.toLowerCase().includes(query))
  const matchingProjects = projects.filter((p) => p.name.toLowerCase().includes(query))
  const notify = (s: string) => setToast(s)
  const loadProject = useCallback(async (id: string) => {
    const result = await api<Overview>(`/projects/${id}/overview`)
    setData(result)
    setAssessment(result.assessment)
    setProjectId(id)
  }, [])
  const loadProjects = useCallback(
    async (preferred?: string) => {
      const list = await api<Project[]>('/projects')
      setProjects(list)
      if (list.length) {
        await loadProject(list.find((p) => p.id === preferred)?.id || list[0].id)
      } else {
        setData(null)
        setProjectId('')
      }
    },
    [loadProject],
  )
  const reload = useCallback(async () => {
    await loadProjects(projectId)
  }, [loadProjects, projectId])
  const authenticate = async (demo = false) => {
    let current = await api<Session>('/session')
    setCsrf(current.csrf_token)
    if (!current.authenticated && demo && current.demo_enabled) {
      const login = await api<{ csrf_token: string }>('/auth/demo', 'POST')
      setCsrf(login.csrf_token)
      current = await api<Session>('/session')
    }
    setSession(current)
    setCsrf(current.csrf_token)
    if (current.authenticated) await loadProjects()
  }
  useEffect(() => {
    void authenticate(true)
      .catch((e) => setFatal((e as Error).message))
      .finally(() => setLoading(false))
  }, []) // initial, isolated demo session
  useEffect(() => {
    const change = () => {
      const value = location.hash.slice(1)
      if (nav.some((n) => n.id === value)) setRoute(value)
    }
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 5000)
    return () => clearTimeout(id)
  }, [toast])
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setModal('search')
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])
  const running = data?.jobs.some((j) => ['queued', 'running'].includes(j.status))
  useEffect(() => {
    if (!running) return
    const timer = setTimeout(() => {
      void reload().catch((e) => notify((e as Error).message))
    }, 5000)
    return () => clearTimeout(timer)
  }, [data, running, reload])
  const navigate = (id: string) => {
    setRoute(id)
    location.hash = id
    setMobileNav(false)
  }
  const open = (id: string) => {
    setFormError('')
    setModal(id)
  }
  const getSource = async () => {
    if (!assessment) return
    try {
      setSource(await api<Source>(`/snapshots/${assessment.snapshot_id}`))
    } catch (e) {
      notify((e as Error).message)
    }
  }
  if (loading) return <Loading />
  if (fatal)
    return (
      <div className="auth-screen">
        <div className="brand">
          <Logo />
          conceptbench
        </div>
        <Empty
          title="We couldn’t open the workspace."
          action={
            <button className="button primary" onClick={() => location.reload()}>
              Try again
            </button>
          }
        >
          {fatal}
        </Empty>
      </div>
    )
  if (!session?.authenticated)
    return (
      <Auth
        session={session}
        onSuccess={async () => {
          setLoading(true)
          try {
            await authenticate()
          } catch (e) {
            setFatal((e as Error).message)
          } finally {
            setLoading(false)
          }
        }}
        demo={async () => {
          setLoading(true)
          try {
            await authenticate(true)
          } catch (e) {
            setFatal((e as Error).message)
          } finally {
            setLoading(false)
          }
        }}
      />
    )
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {mobileNav && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
        <a href="#review" className="brand" onClick={() => navigate('review')}>
          <Logo />
          <span>
            conceptbench<span className="brand-period">.</span>
          </span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-letter">A</span>
          <span>
            {data?.project.is_demo ? 'Acme workspace' : 'Your workspace'}
            <small>Personal workspace</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <button className="search-button" onClick={() => open('search')}>
          <Search size={15} />
          <span>Quick find</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="sidebar-label">
          WORKSPACE{' '}
          <button
            className="icon-button"
            aria-label="Create project"
            onClick={() => open('project')}
          >
            <Plus size={13} />
          </button>
        </div>
        <label className="project-select">
          <span className="project-icon">
            <Layers size={15} />
          </span>
          <select
            aria-label="Current project"
            value={projectId}
            onChange={(e) => {
              void loadProject(e.target.value).catch((e) => notify(e.message))
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {!projects.length && <option>Create a project</option>}
          </select>
          <ChevronDown size={12} />
        </label>
        <nav className="main-nav" aria-label="Main navigation">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={route === id ? 'active' : ''}
              onClick={() => navigate(id)}
              aria-current={route === id ? 'page' : undefined}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === 'experiments' &&
                !!data?.experiments.filter((e) => e.status !== 'complete').length && (
                  <span className="nav-count">
                    {data.experiments.filter((e) => e.status !== 'complete').length}
                  </span>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="workspace-tip">
            <span className="tip-icon">
              <Sparkles size={16} />
            </span>
            <strong>Make the next move count.</strong>
            <p>A small, owned experiment beats a confident guess.</p>
            <button onClick={() => open('guide')}>
              Meet your workspace <ArrowUpRight size={13} />
            </button>
          </div>
          <button className="sidebar-bottom-link" onClick={() => open('guide')}>
            <BookOpen size={16} />
            Methodology & guide
            <ArrowUpRight size={12} />
          </button>
          <a
            className="sidebar-bottom-link"
            href="https://github.com/hitrich/conceptbench"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={16} />
            Open source
            <ArrowUpRight size={12} />
          </a>
          <div className="sidebar-version">
            <span className="alive-dot" />
            ConceptBench v0.1<span>MIT</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <span>{data?.project.name || 'New project'}</span>
            <ChevronRight size={13} />
            <strong>{nav.find((n) => n.id === route)?.label}</strong>
          </div>
          <div className="topbar-right">
            {data?.project.is_demo && (
              <span className="demo-project">
                <span />
                Demo project
              </span>
            )}
            <button
              className="icon-button top-help"
              aria-label="Open workspace guide"
              onClick={() => open('guide')}
            >
              <BookOpen size={16} />
            </button>
            <button
              className="avatar"
              aria-label="Account and session"
              onClick={() => open('account')}
            >
              {session.username.startsWith('demo-')
                ? 'AM'
                : session.username.slice(0, 2).toUpperCase()}
            </button>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="page-eyebrow">
                {route === 'review' ? 'EVIDENCE → DIRECTION' : 'THE PRODUCT WORKBENCH'}
              </div>
              <h1>{pageText[route][0]}</h1>
              <p>{pageText[route][1]}</p>
            </div>
            {route === 'review' && data && (
              <div className="page-actions">
                <button
                  className="button"
                  disabled={!assessment || !data.can_export}
                  onClick={() => open('export')}
                >
                  <Download size={15} />
                  Export brief
                </button>
                <button
                  className="button primary"
                  disabled={data.role === 'viewer'}
                  onClick={() => (assessment ? open('review') : navigate('data'))}
                >
                  <Plus size={15} />
                  New review
                </button>
              </div>
            )}
          </div>
          {!data ? (
            <Empty
              title="What are you working on?"
              action={
                <button className="button primary" onClick={() => open('project')}>
                  Create your first project <ArrowRight size={15} />
                </button>
              }
            >
              Start with the product promise, the audience, and the decision you need to make.
            </Empty>
          ) : (
            <div className="page-content" key={projectId}>
              {route === 'review' &&
                (assessment ? (
                  <Review
                    data={data}
                    assessment={assessment}
                    setAssessment={setAssessment}
                    createExperiment={() => open('experiment')}
                    editBrief={() => open('edit')}
                    source={() => void getSource()}
                    navigateData={() => navigate('data')}
                  />
                ) : (
                  <Empty
                    title="Your first brief starts with evidence."
                    action={
                      <button className="button primary" onClick={() => navigate('data')}>
                        Define your metrics & add data <ArrowRight size={15} />
                      </button>
                    }
                  >
                    Approve a metric definition, then import reviewed aggregates or connect PostHog.
                    You can also explore ConceptLab independently.
                  </Empty>
                ))}
              {route === 'lab' && (
                <ConceptLab data={data} session={session} reload={reload} notify={notify} />
              )}{' '}
              {route === 'experiments' && (
                <Experiments
                  data={data}
                  create={() => open('experiment')}
                  reload={reload}
                  notify={notify}
                />
              )}{' '}
              {route === 'data' && (
                <Settings
                  data={data}
                  reload={reload}
                  notify={notify}
                  onDeleted={() => loadProjects()}
                />
              )}
            </div>
          )}
          <footer className="app-footer">
            <span>Built for considered decisions.</span>
            <span>Observe. Question. Experiment.</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast('')}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {source && <SourceDrawer source={source} close={() => setSource(null)} />}
      {modal === 'review' && data && (
        <Dialog title="Bring the evidence into one review" close={() => setModal('')} wide>
          <p>
            Select the saved sources for this version. Human feedback and intervention outcomes can
            add context; they cannot override a measurement problem or a measured mix explanation.
          </p>
          <button
            className="button"
            onClick={() => {
              setModal('')
              navigate('data')
            }}
          >
            Add a new data snapshot <Plus size={14} />
          </button>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              setBusy(true)
              setFormError('')
              try {
                await api(`/projects/${data.project.id}/assessments`, 'POST', {
                  snapshot_ids: fd.getAll('snapshots'),
                  human_dataset_ids: fd.getAll('datasets'),
                  experiment_ids: fd.getAll('experiments'),
                  research_relevance_confirmed: fd.get('relevance') === 'on',
                  human_signal: fd.get('human_signal'),
                  alternative_kind: fd.get('alternative_kind'),
                  alternative_hypothesis: fd.get('alternative_hypothesis'),
                  analyst_note: fd.get('analyst_note'),
                })
                await reload()
                setModal('')
                notify('A new integrated review is ready. Prior versions are preserved.')
              } catch (e) {
                setFormError((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            <h4>Behavioral snapshots · select at least one</h4>
            {data.snapshot_versions.map((s) => (
              <label className="checkbox" key={s.id}>
                <input
                  name="snapshots"
                  type="checkbox"
                  value={s.id}
                  defaultChecked={s.id === assessment?.snapshot_id}
                />
                <span>
                  {s.source === 'demo' ? 'Fabricated demo' : s.source} · cutoff{' '}
                  {new Date(s.analysis_cutoff).toLocaleDateString()}
                  <small className="evidence-id">{s.id}</small>
                </span>
              </label>
            ))}
            <h4>Human research</h4>
            {data.studies.flatMap((study) =>
              study.datasets.map((d) => (
                <label className="checkbox" key={d.id}>
                  <input type="checkbox" name="datasets" value={d.id} />
                  <span>
                    {d.name}
                    <small className="evidence-id">
                      {d.metadata.synthetic
                        ? 'Illustrative data · no real respondents'
                        : d.metadata.recruitment_source}
                    </small>
                  </span>
                </label>
              )),
            )}
            <Field label="What does the reviewed human research suggest?">
              <select name="human_signal">
                <option value="none">No reviewed interpretation yet</option>
                <option value="expectation_mismatch">
                  Expectations do not match the product promise
                </option>
                <option value="reliability_issue">
                  A specific reliability or delivery problem
                </option>
                <option value="weak_value">Persistent weak value for this audience</option>
              </select>
            </Field>
            <label className="checkbox">
              <input name="relevance" type="checkbox" />
              <span>
                I reviewed the recruitment, question, and concept stimuli and confirm this research
                is relevant to the decision.
              </span>
            </label>
            <h4>Reviewed interventions</h4>
            {data.experiments.filter((e) => e.status === 'complete').length ? (
              data.experiments
                .filter((e) => e.status === 'complete')
                .map((e) => (
                  <label className="checkbox" key={e.id}>
                    <input type="checkbox" name="experiments" value={e.id} />
                    <span>
                      {e.title} · {e.outcome?.decision}
                    </span>
                  </label>
                ))
            ) : (
              <p className="muted">
                No completed interventions. Record an outcome in Experiments first.
              </p>
            )}
            <details>
              <summary>Describe a specific alternative hypothesis</summary>
              <Field label="Kind of alternative">
                <select name="alternative_kind">
                  <option value="solution">Solution</option>
                  <option value="audience">Audience</option>
                  <option value="problem">Problem</option>
                  <option value="positioning">Positioning</option>
                  <option value="business_model">Business model</option>
                </select>
              </Field>
              <Field label="Alternative hypothesis">
                <textarea
                  name="alternative_hypothesis"
                  rows={3}
                  maxLength={3000}
                  placeholder="Which alternative would you test, with whom, and why?"
                />
              </Field>
            </details>
            <Field label="Analyst notes">
              <textarea name="analyst_note" rows={3} maxLength={6000} />
            </Field>
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            <div className="form-actions">
              <span>No synthetic rating can trigger a pivot recommendation.</span>
              <Submit busy={busy} label="Calculate new review" />
            </div>
          </form>
        </Dialog>
      )}
      {modal === 'experiment' && data && (
        <ExperimentForm
          data={data}
          assessment={assessment}
          close={() => setModal('')}
          reload={reload}
          notify={notify}
        />
      )}
      {modal === 'edit' && assessment && (
        <Dialog title="Review ownership & analyst notes" close={() => setModal('')}>
          <p>
            Saving creates a new version. Calculated facts and evidence references remain tied to
            the original snapshot.
          </p>
          <form
            onSubmit={async (e) => {
              const v = formValues(e)
              setBusy(true)
              setFormError('')
              try {
                await api(`/assessments/${assessment.id}/revisions`, 'POST', v)
                await reload()
                setModal('')
                notify('New Decision Brief version saved.')
              } catch (e) {
                setFormError((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            <div className="form-grid">
              <Field label="Review owner">
                <input
                  name="owner_name"
                  maxLength={100}
                  defaultValue={assessment.owner_name}
                  required
                />
              </Field>
              <Field label="Next review">
                <input
                  name="review_date"
                  type="date"
                  required
                  defaultValue={assessment.review_date}
                />
              </Field>
            </div>
            <Field
              label="Analyst notes"
              hint="Notes are labeled analyst edits and never replace computed evidence."
            >
              <textarea
                name="analyst_note"
                rows={6}
                maxLength={6000}
                defaultValue={assessment.analyst_note}
              />
            </Field>
            {formError && <p className="error">{formError}</p>}
            <div className="form-actions">
              <Submit busy={busy} label="Save new version" />
            </div>
          </form>
        </Dialog>
      )}
      {modal === 'export' && assessment && (
        <Dialog title="Take your Decision Brief with you" close={() => setModal('')}>
          <p>
            Exports include metric counts, source IDs, intervals, analyst notes, and the limits of
            the recommendation.
          </p>
          <div className="export-options">
            <button
              onClick={() => {
                download(`/assessments/${assessment.id}/export?format=markdown`)
                setModal('')
              }}
            >
              <span className="file-icon">M↓</span>
              <span>
                <strong>Markdown brief</strong>
                <small>Readable in your docs, notes, and repository.</small>
              </span>
              <Download size={17} />
            </button>
            <button
              onClick={() => {
                download(`/assessments/${assessment.id}/export?format=json`)
                setModal('')
              }}
            >
              <span className="file-icon">{'{}'}</span>
              <span>
                <strong>Structured JSON</strong>
                <small>Complete calculated evidence and metadata.</small>
              </span>
              <Download size={17} />
            </button>
          </div>
          <div className="notice">
            <Layers size={16} />
            Private export · version {assessment.version}
            {assessment.brief.synthetic ? ' · fabricated demonstration' : ''}
          </div>
        </Dialog>
      )}
      {modal === 'project' && (
        <Dialog title="A workspace for your next decision" close={() => setModal('')}>
          <form
            onSubmit={async (e) => {
              const v = formValues(e)
              setBusy(true)
              setFormError('')
              try {
                const p = await api<Project>('/projects', 'POST', { ...v, cadence: 'weekly' })
                await loadProjects(p.id)
                setModal('')
                navigate('data')
                notify('Project created. Confirm your metric definition to begin.')
              } catch (e) {
                setFormError((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            <Field label="Project name">
              <input name="name" required maxLength={160} placeholder="Your product" />
            </Field>
            <Field label="Product promise">
              <textarea
                name="promise"
                rows={2}
                maxLength={2000}
                placeholder="What useful thing does your product help someone do?"
              />
            </Field>
            <Field label="Intended audience">
              <textarea
                name="audience"
                rows={2}
                maxLength={2000}
                placeholder="Who needs this, and in what situation?"
              />
            </Field>
            <Field label="Current concern">
              <textarea
                name="concern"
                rows={2}
                maxLength={2000}
                placeholder="What decision are you facing?"
              />
            </Field>
            {formError && <p className="error">{formError}</p>}
            <div className="form-actions">
              <span>Weekly recurring use · identified users</span>
              <Submit busy={busy} label="Create project" />
            </div>
          </form>
        </Dialog>
      )}
      {modal === 'guide' && (
        <Dialog title="A more considered product review" close={() => setModal('')} drawer>
          <div className="guide-logo">
            <Logo />
            conceptbench.
          </div>
          <p>
            Start with the decision you need to make. Inspect the evidence, name a competing
            explanation, and choose the smallest useful experiment.
          </p>
          <ol className="guide-steps">
            <li>
              <strong>Define delivered value.</strong>
              <p>
                Confirm signup, activation, and recurring-value events. The pilot counts identified
                users over elapsed UTC days.
              </p>
            </li>
            <li>
              <strong>Read the evidence.</strong>
              <p>
                Every finding links to a frozen source, numerator, denominator, definition, and
                date. Immature windows and missing data cannot become zeros.
              </p>
            </li>
            <li>
              <strong>Explore alternatives.</strong>
              <p>
                ConceptLab supports human CSV feedback independently of analytics. Synthetic ratings
                remain experimental until evaluated against held-out human research.
              </p>
            </li>
            <li>
              <strong>Own the next experiment.</strong>
              <p>
                Choose a metric, guardrails, stopping rule, owner, and review date. Record what
                happened to complete the learning loop.
              </p>
            </li>
          </ol>
          <h4>Statistical notes</h4>
          <p>
            Rates use 95% Wilson intervals. Independent cohort differences use a Newcombe interval.
            Neither addresses missing tracking or selection bias. Fixed-mix standardization is
            descriptive, not causal.
          </p>
          <h4>Open methodology</h4>
          <div className="guide-links">
            <External href="https://github.com/hitrich/conceptbench">Source code & setup</External>
            <External href="https://posthog.com/docs/endpoints">PostHog Endpoints</External>
            <External href="https://github.com/pymc-labs/semantic-similarity-rating">
              Upstream SSR implementation
            </External>
          </div>
          <p className="muted">
            ConceptBench is MIT licensed. SSR is experimental in this domain. No pilot study or
            pivot-forecasting accuracy is claimed.
          </p>
        </Dialog>
      )}
      {modal === 'search' && (
        <Dialog title="Quick find" close={() => setModal('')}>
          <div className="command-search">
            <Search size={17} />
            <input
              autoFocus
              aria-label="Find a page or project"
              placeholder="Find a page or project…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>ESC</kbd>
          </div>
          <div className="command-results">
            {matchingPages.length === 0 && matchingProjects.length === 0 && (
              <p className="search-empty" role="status">
                No pages or projects match “{search}”. Try a shorter name.
              </p>
            )}
            {matchingPages.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => {
                  navigate(id)
                  setModal('')
                  setSearch('')
                }}
              >
                <Icon size={18} />
                {label}
                <ArrowRight size={14} />
              </button>
            ))}
            {matchingProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  void loadProject(p.id).catch((e) => notify(e.message))
                  setModal('')
                  setSearch('')
                }}
              >
                <Layers size={18} />
                {p.name}
                <span>Project</span>
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {modal === 'account' && (
        <Dialog title="Your workspace session" close={() => setModal('')}>
          <div className="owner-row">
            <span className="avatar">
              {session.username.startsWith('demo-') ? 'AM' : session.username.slice(0, 2)}
            </span>
            <span>
              <strong>
                {session.username.startsWith('demo-') ? 'Private demo session' : session.username}
              </strong>
              <small>
                {session.username.startsWith('demo-')
                  ? 'This demo belongs only to this browser session.'
                  : 'Authenticated with a secure server session.'}
              </small>
            </span>
          </div>
          <p>
            Your changes are stored in this installation’s database. Demo sessions are for
            fabricated data; create an account for real research.
          </p>
          <button
            className="button"
            onClick={async () => {
              try {
                await api('/auth/logout', 'POST')
                const s = await api<Session>('/session')
                setSession(s)
                setCsrf(s.csrf_token)
                setData(null)
                setProjects([])
                setModal('')
              } catch (e) {
                notify((e as Error).message)
              }
            }}
          >
            <LogOut size={15} />
            Sign out
          </button>
        </Dialog>
      )}
    </div>
  )
}
function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      <svg width="27" height="29" viewBox="0 0 27 29">
        <path d="m3 8 10.5-6L24 8v13l-10.5 6L3 21Z" />
        <path d="m3 8 10.5 6L24 8M13.5 14v13M8 5l11 6v13" />
      </svg>
    </span>
  )
}
function Auth({
  session,
  onSuccess,
  demo,
}: {
  session: Session | null
  onSuccess: () => Promise<void>
  demo: () => Promise<void>
}) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <div className="auth-screen">
      <div className="brand">
        <Logo />
        conceptbench.
      </div>
      <div className="auth-panel">
        <span className="eyebrow">YOUR PRODUCT WORKBENCH</span>
        <h1>
          Make room for
          <br />a better next decision.
        </h1>
        <p>
          Behavior, feedback, and alternatives.
          <br />
          One evidence-backed place to decide.
        </p>
        <form
          onSubmit={async (e) => {
            const v = formValues(e)
            setBusy(true)
            setError('')
            try {
              const r = await api<{ csrf_token: string }>(
                register ? '/auth/register' : '/auth/login',
                'POST',
                v,
              )
              setCsrf(r.csrf_token)
              await onSuccess()
            } catch (e) {
              setError((e as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          <Field label="Username">
            <input name="username" autoComplete="username" minLength={3} maxLength={100} required />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              required
              maxLength={200}
            />
          </Field>
          {error && <p className="error">{error}</p>}
          <Submit busy={busy} label={register ? 'Create account' : 'Sign in'} />
        </form>
        <div className="auth-options">
          {session?.registration_enabled && (
            <button className="quiet" onClick={() => setRegister(!register)}>
              {register ? 'Already have an account? Sign in' : 'New here? Create an account'}
              <ArrowRight size={14} />
            </button>
          )}
          {session?.demo_enabled && (
            <button className="button" onClick={() => void demo()}>
              Explore the demo <ArrowUpRight size={15} />
            </button>
          )}
        </div>
      </div>
      <span className="auth-footer">Open source. Evidence first. MIT licensed.</span>
    </div>
  )
}
