import csv
import io
import json
import uuid
from datetime import timedelta
from pathlib import Path
from django.conf import settings
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.cache import cache
from django.db import transaction, IntegrityError
from django.http import HttpResponse
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_protect
from ninja import NinjaAPI, File, Form
from ninja.files import UploadedFile
from ninja.errors import HttpError, ValidationError
from ninja.security import django_auth
from . import schemas as S
from .models import Workspace, Membership, Project, MetricContract, AnalyticsSnapshot, Assessment, Study, Concept, HumanDataset, Experiment, Job, Connection, PanelRun
from .services import project_for, audit, create_contract, save_snapshot, enqueue, record, assessment_record
from .analysis import digest
from .demo import seed_demo
from .research import parse_human_csv, summarize_human

api = NinjaAPI(title='ConceptBench API', version='1.0.0', auth=django_auth, docs_url='/docs' if settings.DEBUG else None)


@api.exception_handler(HttpError)
def http_error(request, exc):
    return api.create_response(request, {'error': {'code': f'http_{exc.status_code}', 'message': str(exc), 'request_id': getattr(request, 'request_id', ''), 'recovery': 'Review the request and retry.'}}, status=exc.status_code)


@api.exception_handler(ValidationError)
def validation_error(request, exc):
    errors = [{'field': '.'.join(str(p) for p in e['loc']), 'message': e['msg']} for e in exc.errors]
    return api.create_response(request, {'error': {'code': 'validation_error', 'message': 'Check the highlighted fields.', 'details': errors, 'request_id': getattr(request, 'request_id', '')}}, status=422)


@api.exception_handler(ValueError)
def value_error(request, exc):
    return http_error(request, HttpError(422, str(exc)))


def throttle(request, action, limit=20):
    # ponytail: process-local limiter for single-node pilots; use shared cache before scaling workers.
    key = digest([action, request.META.get('REMOTE_ADDR', ''), timezone.now().strftime('%Y%m%d%H')])
    cache.add(key, 0, 3600)
    count = cache.incr(key)
    if count > limit:
        raise HttpError(429, 'Too many attempts. Try again in an hour.')


@api.get('/session', auth=None)
def session(request):
    return {'authenticated': request.user.is_authenticated, 'username': request.user.username if request.user.is_authenticated else None, 'csrf_token': get_token(request), 'demo_enabled': settings.ALLOW_DEMO, 'registration_enabled': settings.ALLOW_REGISTRATION, 'model_enabled': bool(settings.MODEL_API_KEY and settings.MODEL_NAME), 'version': '0.1.0'}


@api.post('/auth/demo', auth=None)
@csrf_protect
def demo_login(request):
    if not settings.ALLOW_DEMO:
        raise HttpError(403, 'Demo sessions are disabled on this installation.')
    if request.user.is_authenticated:
        return {'ok': True}
    throttle(request, 'demo', 20)
    with transaction.atomic():
        user = get_user_model().objects.create_user(username='demo-'+uuid.uuid4().hex, first_name='Alex')
        seed_demo(user)
    login(request, user)
    return {'ok': True, 'csrf_token': get_token(request)}


@api.post('/auth/login', auth=None)
@csrf_protect
def sign_in(request, data: S.Credentials):
    throttle(request, 'login')
    user = authenticate(request, username=data.username, password=data.password)
    if user is None:
        raise HttpError(401, 'The username or password is incorrect.')
    login(request, user)
    return {'ok': True, 'csrf_token': get_token(request)}


@api.post('/auth/register', auth=None)
@csrf_protect
def register(request, data: S.Credentials):
    if not settings.ALLOW_REGISTRATION:
        raise HttpError(403, 'Registration is disabled. Ask the installation owner for an account.')
    throttle(request, 'register', 10)
    user = get_user_model()(username=data.username)
    try:
        validate_password(data.password, user)
    except DjangoValidationError as exc:
        raise HttpError(422, ' '.join(exc.messages))
    try:
        with transaction.atomic():
            user.set_password(data.password)
            user.save()
            workspace = Workspace.objects.create(name=f'{user.username}’s workspace')
            Membership.objects.create(workspace=workspace, user=user, role='owner', can_export=True)
    except IntegrityError:
        raise HttpError(409, 'That username is already in use.')
    login(request, user)
    return {'ok': True, 'csrf_token': get_token(request)}


@api.post('/auth/logout')
def sign_out(request):
    logout(request)
    return {'ok': True}


def project_record(project):
    return record(project, 'id name promise audience concern cadence is_demo raw_retention_days aggregate_retention_days run_budget_limit workspace_id')


@api.get('/projects')
def projects(request):
    return [project_record(p) for p in Project.objects.filter(workspace__memberships__user=request.user, deleted_at__isnull=True).order_by('created_at')]


@api.post('/projects')
def create_project(request, data: S.ProjectIn):
    membership = Membership.objects.filter(user=request.user, role__in=['owner', 'editor']).first()
    if not membership:
        raise HttpError(403, 'An owner or editor membership is required.')
    project = Project.objects.create(workspace=membership.workspace, **data.model_dump())
    audit(request.user, project, 'project.create', project)
    return project_record(project)


def experiment_record(experiment):
    return record(experiment, 'id assessment_id title hypothesis population assignment_unit design primary_metric minimum_effect guardrails stopping_rule instrumentation_check owner_name review_date status outcome created_at')


def study_record(study):
    datasets = list(study.datasets.order_by('-created_at'))
    concepts = list(study.concepts.order_by('created_at'))
    latest = datasets[0] if datasets else None
    return {**record(study, 'id title audience question hypothesis version created_at'), 'concepts': [record(c, 'id name description version group split') for c in concepts], 'datasets': [{**record(d, 'id name summary metadata expired created_at expires_at'), 'response_count': sum(s['n'] for s in d.summary.values())} for d in datasets], 'human_summary': latest.summary if latest else {}, 'runs': [{**record(r, 'id config budget spent reserved uncertain_cost summary created_at'), 'job': record(r.job, 'id status progress error')} for r in study.runs.select_related('job').order_by('-created_at')]}


@api.get('/projects/{project_id}/overview')
def overview(request, project_id: uuid.UUID):
    project = project_for(request.user, project_id)
    membership = Membership.objects.get(workspace=project.workspace, user=request.user)
    latest = project.assessments.order_by('-version').first()
    contract = project.contracts.order_by('-version').first()
    connection = Connection.objects.filter(project=project).first()
    return {'project': project_record(project), 'role': membership.role, 'can_export': membership.role != 'viewer' or membership.can_export, 'assessment': assessment_record(latest) if latest else None, 'assessment_versions': [record(a, 'id version created_at') for a in project.assessments.order_by('-version')], 'contract': record(contract, 'id version config content_hash created_at') if contract else None, 'connection': record(connection, 'id region external_project_id endpoints status last_error last_refresh') if connection else None, 'studies': [study_record(s) for s in project.studies.order_by('created_at')], 'experiments': [experiment_record(e) for e in project.experiments.order_by('-created_at')], 'jobs': [record(j, 'id kind status progress error created_at') for j in project.jobs.order_by('-created_at')[:10]]}


@api.patch('/projects/{project_id}')
def edit_project(request, project_id: uuid.UUID, data: S.ProjectIn):
    project = project_for(request.user, project_id, write=True)
    for field, value in data.model_dump().items():
        setattr(project, field, value)
    project.save()
    audit(request.user, project, 'project.edit', project)
    return project_record(project)


@api.put('/projects/{project_id}/retention')
def retention(request, project_id: uuid.UUID, data: S.RetentionIn):
    project = project_for(request.user, project_id, owner=True)
    for field, value in data.model_dump().items():
        setattr(project, field, value)
    project.save()
    for dataset in HumanDataset.objects.filter(study__project=project):
        deadline = dataset.created_at + timedelta(days=project.raw_retention_days)
        if deadline < dataset.expires_at:
            dataset.expires_at = deadline
            dataset.save(update_fields=['expires_at'])
    audit(request.user, project, 'retention.edit', project)
    return project_record(project)


@api.post('/projects/{project_id}/metric-contracts')
def approve_contract(request, project_id: uuid.UUID, data: S.ContractIn):
    project = project_for(request.user, project_id, write=True)
    contract = create_contract(request.user, project, data.model_dump(mode='json'))
    return record(contract, 'id version config content_hash')


@api.post('/projects/{project_id}/analytics/import')
def import_aggregates(request, project_id: uuid.UUID, data: S.SnapshotIn):
    project = project_for(request.user, project_id, write=True)
    contract = get_object_or_404(MetricContract, id=data.contract_id, project=project)
    return assessment_record(save_snapshot(request.user, project, contract, data.model_dump(mode='json'), 'csv'))


@api.get('/snapshots/{snapshot_id}')
def snapshot_source(request, snapshot_id: uuid.UUID):
    snapshot = get_object_or_404(AnalyticsSnapshot, id=snapshot_id)
    project_for(request.user, snapshot.project_id)
    return {**record(snapshot, 'id source rows quality source_metadata content_hash analysis_cutoff latest_event_at collected_at'), 'contract': record(snapshot.contract, 'id version config content_hash'), 'exclusions': 'Internal traffic excluded; incomplete windows excluded separately for A7 and W4.', 'counting_unit': 'identified_user'}


@api.get('/assessments/{assessment_id}')
def get_assessment(request, assessment_id: uuid.UUID):
    assessment = get_object_or_404(Assessment, id=assessment_id)
    project_for(request.user, assessment.project_id)
    return assessment_record(assessment)


@api.post('/assessments/{assessment_id}/revisions')
@transaction.atomic
def revise_brief(request, assessment_id: uuid.UUID, data: S.BriefEdit):
    previous = get_object_or_404(Assessment, id=assessment_id)
    project = project_for(request.user, previous.project_id, write=True)
    Project.objects.select_for_update().get(id=project.id)
    version = project.assessments.order_by('-version').first().version+1
    revision = Assessment.objects.create(project=project, snapshot=previous.snapshot, version=version, brief=previous.brief, **data.model_dump())
    audit(request.user, project, 'brief.revise', revision)
    return assessment_record(revision)


@api.get('/assessments/{assessment_id}/export')
def export_brief(request, assessment_id: uuid.UUID, format: str = 'markdown'):
    assessment = get_object_or_404(Assessment, id=assessment_id)
    project = project_for(request.user, assessment.project_id, export=True)
    if format not in ['markdown', 'json']:
        raise HttpError(422, 'Choose markdown or json.')
    data = assessment_record(assessment)
    if format == 'json':
        from django.core.serializers.json import DjangoJSONEncoder
        content = json.dumps(data, indent=2, cls=DjangoJSONEncoder)
    else:
        b = assessment.brief
        lines = [f'# Decision Brief — {project.name}', f'\nVersion {assessment.version} · {assessment.created_at.isoformat()}', f'\nOwner: {assessment.owner_name} · Review: {assessment.review_date}', '\n**Fabricated demonstration data**' if b['synthetic'] else '\nPrivate evidence review', f'\n## {b["title"]}', b['summary'], '\n## Evidence']
        for e in b['evidence']:
            lines.append(f'\n- {e["label"]} [{e["id"]}]: {e["earlier"]["numerator"]}/{e["earlier"]["denominator"]} → {e["later"]["numerator"]}/{e["later"]["denominator"]}. Change {e["change"]["pp"]} pp; 95% CI {e["change"]["interval"]}.')
        for label, values in [('Contradictory evidence', b['contradictions']), ('Missing information', b['missing']), ('Limitations', b['limitations'])]:
            lines.extend([f'\n## {label}', *['- '+v for v in values]])
        lines.extend(['\n## What would change the recommendation', b['what_would_change'], '\n## Analyst notes', assessment.analyst_note or 'No analyst notes.', f'\nRule version: {b["rule_version"]}; snapshot: {assessment.snapshot_id}.'])
        content = '\n'.join(lines)
    audit(request.user, project, 'brief.export', assessment)
    response = HttpResponse(content, content_type='application/json' if format == 'json' else 'text/markdown; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="conceptbench-brief-v{assessment.version}.{ "json" if format == "json" else "md"}"'
    return response


@api.post('/projects/{project_id}/studies')
@transaction.atomic
def create_study(request, project_id: uuid.UUID, data: S.StudyIn):
    project = project_for(request.user, project_id, write=True)
    study = Study.objects.create(project=project, **data.model_dump(exclude={'concepts'}))
    for concept in data.concepts:
        Concept.objects.create(study=study, **concept.model_dump())
    audit(request.user, project, 'study.create', study)
    return study_record(study)


@api.post('/studies/{study_id}/human-data')
def import_human(request, study_id: uuid.UUID, file: UploadedFile = File(...), recruitment_source: str = Form(...), consent: bool = Form(...)):
    study = get_object_or_404(Study, id=study_id)
    project = project_for(request.user, study.project_id, write=True)
    if not consent or not 3 <= len(recruitment_source) <= 1000:
        raise HttpError(422, 'Confirm consent and describe how respondents were recruited.')
    if file.size > 5*1024*1024:
        raise HttpError(413, 'The CSV exceeds 5 MB.')
    rows, errors = parse_human_csv(file.read(), study.id, {str(c.id) for c in study.concepts.all()})
    if errors:
        return api.create_response(request, {'error': {'code': 'csv_rows_invalid', 'message': 'Correct the CSV rows and import again. No data was saved.', 'details': errors, 'request_id': request.request_id}}, status=422)
    dataset = HumanDataset.objects.create(study=study, name=Path(file.name).name[:180], rows=rows, summary=summarize_human(rows), metadata={'recruitment_source': recruitment_source, 'consent': True, 'synthetic': False, 'question_id': rows[0]['question_id'], 'repeated_respondents': len({r['respondent_id'] for r in rows}) < len(rows)}, content_hash=digest(rows), expires_at=timezone.now()+timedelta(days=project.raw_retention_days))
    audit(request.user, project, 'human.import', dataset)
    return study_record(study)


@api.get('/studies/{study_id}/human-template')
def human_template(request, study_id: uuid.UUID):
    study = get_object_or_404(Study, id=study_id)
    project_for(request.user, study.project_id, export=True)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['study_id', 'concept_version', 'respondent_id', 'question_id', 'rating', 'collected_at', 'comment', 'segment'])
    for concept in study.concepts.all():
        writer.writerow([str(study.id), str(concept.id), 'anonymous-001', 'intent', '', timezone.now().isoformat(), '', ''])
    response = HttpResponse(output.getvalue(), content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="conceptbench-human-template.csv"'
    return response


@api.delete('/datasets/{dataset_id}')
def delete_dataset(request, dataset_id: uuid.UUID):
    dataset = get_object_or_404(HumanDataset, id=dataset_id)
    project = project_for(request.user, dataset.study.project_id, owner=True)
    audit(request.user, project, 'human.delete', dataset)
    # Comparison summaries contain derivatives of the dataset and must be recomputed.
    dataset.study.runs.update(summary={})
    dataset.delete()
    return {'ok': True}


@api.post('/assessments/{assessment_id}/experiments')
def create_experiment(request, assessment_id: uuid.UUID, data: S.ExperimentIn):
    assessment = get_object_or_404(Assessment, id=assessment_id)
    project = project_for(request.user, assessment.project_id, write=True)
    experiment = Experiment.objects.create(project=project, assessment=assessment, **data.model_dump())
    audit(request.user, project, 'experiment.create', experiment)
    return experiment_record(experiment)


@api.put('/experiments/{experiment_id}')
def update_experiment(request, experiment_id: uuid.UUID, data: S.ExperimentIn):
    experiment = get_object_or_404(Experiment, id=experiment_id)
    project = project_for(request.user, experiment.project_id, write=True)
    if experiment.status == 'complete':
        raise HttpError(409, 'Completed experiment specifications are frozen.')
    for field, value in data.model_dump().items():
        setattr(experiment, field, value)
    experiment.save()
    audit(request.user, project, 'experiment.edit', experiment)
    return experiment_record(experiment)


@api.post('/experiments/{experiment_id}/start')
def start_experiment(request, experiment_id: uuid.UUID):
    experiment = get_object_or_404(Experiment, id=experiment_id)
    project = project_for(request.user, experiment.project_id, write=True)
    if experiment.status != 'planned':
        raise HttpError(409, 'Only a planned experiment can be started.')
    experiment.status = 'running'
    experiment.save(update_fields=['status'])
    audit(request.user, project, 'experiment.start', experiment)
    return experiment_record(experiment)


@api.post('/experiments/{experiment_id}/outcomes')
def record_outcome(request, experiment_id: uuid.UUID, data: S.OutcomeIn):
    experiment = get_object_or_404(Experiment, id=experiment_id)
    project = project_for(request.user, experiment.project_id, write=True)
    if experiment.status != 'running':
        raise HttpError(409, 'Start the experiment before recording its outcome.')
    experiment.outcome = {**data.model_dump(), 'recorded_at': timezone.now().isoformat(), 'recorded_by': request.user.username}
    experiment.status = 'complete'
    experiment.save(update_fields=['outcome', 'status'])
    audit(request.user, project, 'experiment.outcome', experiment)
    return experiment_record(experiment)


@api.get('/experiments/{experiment_id}/export')
def export_experiment(request, experiment_id: uuid.UUID):
    experiment = get_object_or_404(Experiment, id=experiment_id)
    project_for(request.user, experiment.project_id, export=True)
    from django.core.serializers.json import DjangoJSONEncoder
    response = HttpResponse(json.dumps(experiment_record(experiment), cls=DjangoJSONEncoder, indent=2), content_type='application/json')
    response['Content-Disposition'] = 'attachment; filename="conceptbench-experiment.json"'
    return response


@api.get('/jobs/{job_id}')
def get_job(request, job_id: uuid.UUID):
    job = get_object_or_404(Job, id=job_id)
    project_for(request.user, job.project_id)
    return record(job, 'id kind status attempts progress cancel_requested error result created_at')


@api.post('/jobs/{job_id}/cancel')
def cancel_job(request, job_id: uuid.UUID):
    job = get_object_or_404(Job, id=job_id)
    project = project_for(request.user, job.project_id, write=True)
    Job.objects.filter(id=job.id).update(cancel_requested=True)
    Job.objects.filter(id=job.id, status='queued').update(status='cancelled')
    audit(request.user, project, 'job.cancel', job)
    return {'ok': True}


@api.delete('/connections/{connection_id}')
@transaction.atomic
def disconnect(request, connection_id: uuid.UUID):
    connection = get_object_or_404(Connection, id=connection_id)
    project = project_for(request.user, connection.project_id, owner=True)
    project.jobs.filter(kind='posthog_refresh', status__in=['queued', 'running']).update(cancel_requested=True)
    audit(request.user, project, 'connection.disconnect', connection)
    connection.delete()
    return {'ok': True, 'message': 'Local credential deleted. Revoke the personal API key in PostHog settings.'}


@api.delete('/projects/{project_id}')
@transaction.atomic
def delete_project(request, project_id: uuid.UUID):
    project = project_for(request.user, project_id, owner=True)
    Project.objects.filter(id=project.id).update(deleted_at=timezone.now())
    Connection.objects.filter(project=project).delete()
    project.jobs.update(cancel_requested=True)
    project.delete()
    return {'ok': True, 'message': 'Project and derived application data deleted. Backups expire under the deployment retention policy.'}
