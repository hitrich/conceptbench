"""One durable queue. Leases fence stale workers from committing results."""

import uuid
import threading
from decimal import Decimal
from datetime import timedelta
from django.db import transaction, connection as db_connection, close_old_connections
from django.db.models import Q, F
from django.utils import timezone
from .models import (
    Job,
    PanelRun,
    Connection,
    MetricContract,
    Project,
    HumanDataset,
    AnalyticsSnapshot,
    Assessment,
    PanelResponse,
)
from .panel import ensure_active, StopRun, PanelError, execute_panel
from .posthog import ConnectorError, fetch_aggregates
from .services import save_snapshot

LEASE_SECONDS = 120


@transaction.atomic
def claim_job():
    now = timezone.now()
    candidates = Job.objects.filter(
        Q(status="queued") | Q(status="running", lease_until__lt=now)
    ).order_by("created_at")
    if db_connection.features.has_select_for_update_skip_locked:
        candidates = candidates.select_for_update(skip_locked=True)
    else:
        # ponytail: SQLite supports one development worker; use PostgreSQL for concurrent workers.
        candidates = candidates.select_for_update()
    job = candidates.first()
    if job is None:
        return None
    if job.cancel_requested or job.project.deleted_at:
        job.status = "cancelled"
        job.save(update_fields=["status"])
        return None
    if job.status == "running" and job.kind == "panel":
        run = PanelRun.objects.filter(job=job).first()
        if run:
            run.uncertain_cost += run.reserved
            run.reserved = Decimal(0)
            run.save(update_fields=["uncertain_cost", "reserved"])
            run.responses.filter(status="submitted").update(status="uncertain")
    if job.attempts >= 3:
        job.status = "failed"
        job.error = "The job exhausted three recoverable attempts. Inspect the failure and create a new explicit run."
        job.save(update_fields=["status", "error"])
        return None
    job.status = "running"
    job.attempts += 1
    job.lease_until = now + timedelta(seconds=LEASE_SECONDS)
    job.lease_token = uuid.uuid4()
    job.save(update_fields=["status", "attempts", "lease_until", "lease_token"])
    return job


def heartbeat(job, stop):
    close_old_connections()
    try:
        while not stop.wait(25):
            if not Job.objects.filter(
                id=job.id, lease_token=job.lease_token, status="running"
            ).update(lease_until=timezone.now() + timedelta(seconds=LEASE_SECONDS)):
                break
    finally:
        close_old_connections()


def execute_refresh(job):
    ensure_active(job)
    connection = Connection.objects.filter(
        id=job.payload["connection_id"], project_id=job.project_id
    ).first()
    if not connection:
        raise StopRun("The analytics provider has been disconnected.")
    if connection.contract_hash != job.payload["contract_hash"]:
        raise StopRun("The approved metric contract changed. Reconcile before refreshing.")
    rows = fetch_aggregates(connection, job.payload)
    with transaction.atomic():
        # Serialize publication with disconnect/deletion and verify permission after network work.
        Project.objects.select_for_update().get(id=job.project_id)
        ensure_active(job)
        if not Connection.objects.filter(
            id=connection.id,
            credential=connection.credential,
            contract_hash=job.payload["contract_hash"],
        ).exists():
            raise StopRun("The connection changed while the request was in flight.")
        contract = MetricContract.objects.get(
            id=job.payload["contract_id"], project_id=job.project_id
        )
        assessment = save_snapshot(
            job.actor,
            job.project,
            contract,
            {
                "rows": rows,
                "analysis_cutoff": job.payload["analysis_cutoff"],
                "latest_event_at": None,
                "quality": job.payload["quality"],
                "source_name": connection.endpoints["name"],
            },
            "posthog",
            {
                "name": connection.endpoints["name"],
                "endpoint_version": connection.endpoints["version"],
                "query_hash": connection.endpoints["query_hash"],
                "region": connection.region,
                "project_id": connection.external_project_id,
            },
        )
        Connection.objects.filter(id=connection.id).update(
            last_refresh=timezone.now(), status="connected", last_error=""
        )
    return {"assessment_id": str(assessment.id)}


def execute_job(job):
    stop = threading.Event()
    thread = threading.Thread(target=heartbeat, args=(job, stop), daemon=True)
    thread.start()
    status, error, result = "complete", "", {}
    try:
        ensure_active(job)
        result = execute_refresh(job) if job.kind == "posthog_refresh" else execute_panel(job)
    except StopRun as exc:
        current = Job.objects.filter(id=job.id).first()
        status = "cancelled" if current and current.cancel_requested else "partially_complete"
        error = str(exc)
    except (ConnectorError, PanelError) as exc:
        status, error = "failed", str(exc)
        if job.kind == "posthog_refresh":
            Connection.objects.filter(project_id=job.project_id).update(
                status="stale", last_error=error[:400]
            )
        elif PanelResponse.objects.filter(run__job=job, status="complete").exists():
            status = "partially_complete"
    except Exception:
        # Content, credentials, provider bodies, and imported text are never logged.
        status, error = (
            "failed",
            "The job could not finish. Review source configuration and retry with a new request.",
        )
    finally:
        stop.set()
        thread.join(timeout=2)
        Job.objects.filter(id=job.id, lease_token=job.lease_token, status="running").update(
            status=status,
            error=error[:500],
            result=result,
            progress=100 if status == "complete" else job_progress(job),
            lease_until=None,
        )


def job_progress(job):
    return Job.objects.filter(id=job.id).values_list("progress", flat=True).first() or 0


def purge_expired():
    now = timezone.now()
    for project in Project.objects.filter(deleted_at__isnull=True):
        raw_cutoff = now - timedelta(days=project.raw_retention_days)
        aggregate_cutoff = now - timedelta(days=project.aggregate_retention_days)
        HumanDataset.objects.filter(study__project=project, expired=False).filter(
            Q(expires_at__lte=now) | Q(created_at__lt=raw_cutoff)
        ).update(rows=[], expired=True)
        expired_ids = {
            str(d.id) for d in HumanDataset.objects.filter(study__project=project, expired=True)
        }
        old_dataset_ids = {
            str(i)
            for i in HumanDataset.objects.filter(
                study__project=project, created_at__lt=aggregate_cutoff
            ).values_list("id", flat=True)
        }
        old_snapshot_ids = {
            str(i)
            for i in AnalyticsSnapshot.objects.filter(
                project=project, collected_at__lt=aggregate_cutoff
            ).values_list("id", flat=True)
        }
        for dataset in HumanDataset.objects.filter(study__project=project, expired=True):
            if not dataset.metadata.get("raw_source_expired"):
                dataset.metadata["recruitment_source"] = (
                    "Raw recruitment notes expired under the retention policy."
                )
                dataset.metadata["raw_source_expired"] = True
                dataset.save(update_fields=["metadata"])
        for assessment in project.assessments.all():
            if old_dataset_ids.intersection(
                r["id"] for r in assessment.brief.get("research_evidence", [])
            ) or old_snapshot_ids.intersection(assessment.brief.get("assessment_snapshot_ids", [])):
                assessment.delete()
                continue
            modified = False
            for source in assessment.brief.get("research_evidence", []):
                if source["id"] in expired_ids and not source.get("raw_source_expired"):
                    source["recruitment_source"] = "Raw source expired under the retention policy."
                    source["raw_source_expired"] = True
                    modified = True
            if modified:
                assessment.save(update_fields=["brief"])
        old_runs = PanelRun.objects.filter(study__project=project, created_at__lt=raw_cutoff)
        Job.objects.filter(panel_run__in=old_runs, status__in=["queued", "running"]).update(
            cancel_requested=True
        )
        for run in old_runs:
            run.responses.update(content={})
            run.config = {
                key: value
                for key, value in run.config.items()
                if key not in ["audience", "question", "concepts"]
            }
            run.config["source_expired"] = True
            run.save(update_fields=["config"])
        HumanDataset.objects.filter(
            study__project=project, created_at__lt=aggregate_cutoff
        ).delete()
        PanelRun.objects.filter(study__project=project, created_at__lt=aggregate_cutoff).delete()
        # A newer analyst edit cannot extend an old snapshot's retention.
        Assessment.objects.filter(project=project).filter(
            Q(created_at__lt=aggregate_cutoff) | Q(snapshot__collected_at__lt=aggregate_cutoff)
        ).delete()
        AnalyticsSnapshot.objects.filter(
            project=project, collected_at__lt=aggregate_cutoff
        ).delete()
