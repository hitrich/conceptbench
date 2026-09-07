import json
from datetime import date, timedelta, datetime
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from .models import Workspace, Membership, Project, MetricContract, AnalyticsSnapshot, Assessment, Study, Concept, Experiment, HumanDataset
from .schemas import ContractIn
from .analysis import digest, assess

DEFAULT_CONTRACT = {'entry_event': 'account_created', 'value_event': 'first_report_completed', 'return_event': 'report_completed', 'segment_properties': ['initial_acquisition_source'], 'confirmed': True}


@transaction.atomic
def seed_demo(user):
    workspace = Workspace.objects.create(name='Acme workspace')
    Membership.objects.create(workspace=workspace, user=user, role='owner', can_export=True)
    project = Project.objects.create(workspace=workspace, name='Acme Analytics', promise='Turn scattered product data into a clear weekly report.', audience='Small SaaS teams with a weekly product review.', concern='Retention is falling. Are we solving the right problem?', is_demo=True)
    config = ContractIn(**DEFAULT_CONTRACT).model_dump(mode='json')
    contract = MetricContract.objects.create(project=project, version=1, config=config, content_hash=digest(config), approved_by=user)
    fixture = json.loads((settings.BASE_DIR / 'demo/acquisition-mix.json').read_text())
    quality = {'definitions_verified': True, 'identity_verified': True, 'completeness_verified': True, 'sampling_verified': True, 'tracking_issue': False, 'missing_events': [], 'notes': 'Fabricated and independently specified example; no customer data.'}
    snapshot = AnalyticsSnapshot.objects.create(project=project, contract=contract, source='demo', rows=fixture['rows'], quality=quality, content_hash=digest(fixture), analysis_cutoff=fixture['analysis_cutoff'], latest_event_at=fixture['latest_event_at'], collected_at=timezone.now(), source_metadata={'name': fixture['name'], 'file': 'demo/acquisition-mix.json', 'endpoint_version': 1})
    brief = assess(snapshot.id, snapshot.rows, snapshot.analysis_cutoff, quality, config, 'demo')
    assessment = Assessment.objects.create(project=project, snapshot=snapshot, version=1, brief=brief, owner_name='Alex Morgan', review_date=date.today()+timedelta(days=14))
    study_examples = [
        ('Find the right first promise', 'Which promise would make a weekly product review more useful?', [('The weekly decision brief', 'A focused weekly review that connects behavior and feedback to one owned next experiment.'), ('The product copilot', 'An assistant that explores analytics questions and suggests possible explanations for metric changes.'), ('The customer signal inbox', 'A shared inbox that groups consented feedback and connects it to product hypotheses.')]),
        ('Reduce time to first value', 'Which onboarding approach would best help your team get its first useful report?', [('Guided setup', 'A short guided setup to confirm events and generate a sourced first report.'), ('A working example', 'An interactive example that teaches cohort definitions before connecting real data.'), ('Analyst office hours', 'A scheduled session with a research analyst to reconcile tracking and define recurring value.')]),
        ('Explore an audience focus', 'Which research workflow best fits your team’s current decision process?', [('Founder review', 'A lightweight weekly decision brief for a founder deciding what to improve next.'), ('Product team review', 'A shared evidence review with ownership, contradictions, and an experiment history.'), ('Research operations', 'A concept study workspace for comparing human ratings with experimental synthetic methods.')]),
    ]
    for idx, (title, question, concepts) in enumerate(study_examples):
        study = Study.objects.create(project=project, title=title, audience=project.audience, question=question, hypothesis='A clearer audience-specific promise will reduce mismatched expectations.')
        created = [Concept.objects.create(study=study, name=n, description=d, group=f'example-{idx}-{i}') for i, (n, d) in enumerate(concepts)]
        if idx == 0:
            rows = []
            distributions = [[2, 3, 7, 13, 15], [5, 8, 13, 9, 5], [3, 7, 12, 11, 7]]
            for concept, counts in zip(created, distributions):
                respondent = 0
                for rating, count in enumerate(counts, 1):
                    for _ in range(count):
                        respondent += 1
                        rows.append({'concept_version': str(concept.id), 'respondent_id': f'demo-{respondent}', 'rating': rating, 'comment': '', 'collected_at': '2026-09-01T12:00:00Z', 'question_id': 'intent', 'study_id': str(study.id), 'segment': 'SaaS team'})
            from .research import summarize_human
            HumanDataset.objects.create(study=study, name='Illustrative human-rating format', rows=rows, summary=summarize_human(rows), metadata={'synthetic': True, 'recruitment_source': 'Fabricated examples; no real participants', 'consent': True, 'question_id': 'intent'}, content_hash=digest(rows), expires_at=timezone.now()+timedelta(days=30))
    Experiment.objects.create(project=project, assessment=assessment, title='Interview five recently activated teams', hypothesis='Recent paid signups expected an automated answer before they understood the report.', population='Recently activated paid users who consent to an interview', design='observational', primary_metric='Documented expectation mismatch', guardrails='No customer identities in the exported brief', stopping_rule='Review after five completed interviews; treat findings as qualitative', owner_name='Alex Morgan', review_date=date.today()+timedelta(days=7), status='running', instrumentation_check='Confirm consent and use a consistent interview guide')
    return project
