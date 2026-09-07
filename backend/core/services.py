from datetime import timedelta
from uuid import UUID
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja.errors import HttpError
from .models import (
    Project,
    Membership,
    MetricContract,
    AnalyticsSnapshot,
    Assessment,
    AuditEntry,
    Job,
)
from .analysis import assess, digest


def project_for(user, project_id, write=False, owner=False, export=False):
    project = get_object_or_404(
        Project, id=project_id, deleted_at__isnull=True, workspace__memberships__user=user
    )
    membership = Membership.objects.get(workspace=project.workspace, user=user)
    if (
        (write and membership.role == "viewer")
        or (owner and membership.role != "owner")
        or (export and membership.role == "viewer" and not membership.can_export)
    ):
        raise HttpError(403, "Your workspace role does not permit this action.")
    return project


def audit(user, project, operation, resource):
    AuditEntry.objects.create(
        actor=user, project=project, operation=operation, resource_id=str(resource.id)
    )


@transaction.atomic
def create_contract(user, project, config):
    Project.objects.select_for_update().get(id=project.id)
    previous = project.contracts.order_by("-version").first()
    contract = MetricContract.objects.create(
        project=project,
        version=previous.version + 1 if previous else 1,
        config=config,
        content_hash=digest(config),
        approved_by=user,
    )
    project.__class__.objects.filter(id=project.id).update(is_demo=False)
    if hasattr(project, "connection"):
        project.connection.status = "needs_reconciliation"
        project.connection.save(update_fields=["status"])
    audit(user, project, "contract.approve", contract)
    return contract


@transaction.atomic
def save_snapshot(user, project, contract, data, source, metadata=None):
    Project.objects.select_for_update().get(id=project.id)
    rows = data["rows"]
    if any(0 < row["signups"] < 5 for row in rows):
        raise HttpError(
            422,
            "Combine cells with fewer than five users before importing. Privacy suppression is separate from statistical precision.",
        )
    if project.contracts.order_by("-version").first().id != contract.id:
        raise HttpError(
            409, "The metric definition changed. Reconcile and use the latest approved contract."
        )
    snapshot_id = __import__("uuid").uuid4()
    brief = assess(
        snapshot_id, rows, data["analysis_cutoff"], data["quality"], contract.config, source
    )
    snapshot = AnalyticsSnapshot.objects.create(
        id=snapshot_id,
        project=project,
        contract=contract,
        source=source,
        rows=rows,
        quality=data["quality"],
        source_metadata=metadata or {"name": data["source_name"]},
        content_hash=digest({"contract": contract.content_hash, **data}),
        analysis_cutoff=data["analysis_cutoff"],
        latest_event_at=data.get("latest_event_at"),
        collected_at=timezone.now(),
    )
    previous = project.assessments.order_by("-version").first()
    assessment = Assessment.objects.create(
        project=project,
        snapshot=snapshot,
        version=previous.version + 1 if previous else 1,
        brief=brief,
        owner_name=user.first_name or user.username,
        review_date=(timezone.now() + timedelta(days=14)).date(),
    )
    audit(user, project, "snapshot.import", snapshot)
    return assessment


@transaction.atomic
def enqueue(user, project, kind, payload, key):
    if not key or len(key) > 100:
        raise HttpError(400, "Supply an Idempotency-Key header (1–100 characters).")
    Project.objects.select_for_update().get(id=project.id)
    job, created = Job.objects.get_or_create(
        project=project,
        kind=kind,
        idempotency_key=key,
        defaults={"actor": user, "payload": payload},
    )
    if not created and job.payload != payload:
        raise HttpError(409, "This idempotency key was already used for a different request.")
    if created:
        audit(user, project, "job.queue", job)
    return job, created


def record(obj, fields):
    return {field: getattr(obj, field) for field in fields.split()}


def assessment_record(assessment):
    return {
        **record(
            assessment,
            "id version created_at owner_name review_date analyst_note brief snapshot_id",
        ),
        "contract_id": str(assessment.snapshot.contract_id) if assessment.snapshot else None,
    }
