import uuid
from django.conf import settings
from django.db import models


class Record(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True


class Workspace(Record):
    name = models.CharField(max_length=160)


class Membership(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    role = models.CharField(
        max_length=10, choices=[("owner", "Owner"), ("editor", "Editor"), ("viewer", "Viewer")]
    )
    can_export = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["workspace", "user"], name="unique_membership")
        ]


class Project(Record):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="projects")
    name = models.CharField(max_length=160)
    promise = models.TextField(blank=True)
    audience = models.TextField(blank=True)
    concern = models.TextField(blank=True)
    cadence = models.CharField(max_length=30, default="weekly")
    is_demo = models.BooleanField(default=False)
    raw_retention_days = models.PositiveIntegerField(default=30)
    aggregate_retention_days = models.PositiveIntegerField(default=90)
    run_budget_limit = models.DecimalField(max_digits=8, decimal_places=2, default=5)
    deleted_at = models.DateTimeField(null=True)


class MetricContract(Record):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="contracts")
    version = models.PositiveIntegerField()
    config = models.JSONField()
    content_hash = models.CharField(max_length=64)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["project", "version"], name="unique_contract_version")
        ]


class Connection(Record):
    project = models.OneToOneField(Project, on_delete=models.CASCADE, related_name="connection")
    region = models.CharField(max_length=2)
    external_project_id = models.PositiveIntegerField()
    credential = models.TextField()
    endpoints = models.JSONField(default=dict)
    contract_hash = models.CharField(max_length=64)
    status = models.CharField(max_length=20, default="connected")
    last_error = models.CharField(max_length=400, blank=True)
    last_refresh = models.DateTimeField(null=True)
    daily_refresh = models.BooleanField(default=False)


class AnalyticsSnapshot(Record):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="snapshots")
    contract = models.ForeignKey(MetricContract, on_delete=models.CASCADE)
    source = models.CharField(max_length=20)
    rows = models.JSONField()
    quality = models.JSONField(default=dict)
    source_metadata = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)
    analysis_cutoff = models.DateTimeField()
    latest_event_at = models.DateTimeField(null=True)
    collected_at = models.DateTimeField()


class Study(Record):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="studies")
    title = models.CharField(max_length=160)
    audience = models.TextField()
    question = models.TextField()
    hypothesis = models.TextField(blank=True)
    version = models.PositiveIntegerField(default=1)


class Concept(Record):
    study = models.ForeignKey(Study, on_delete=models.CASCADE, related_name="concepts")
    name = models.CharField(max_length=120)
    description = models.TextField()
    version = models.PositiveIntegerField(default=1)
    group = models.CharField(max_length=120)
    split = models.CharField(max_length=20, default="development")


class HumanDataset(Record):
    study = models.ForeignKey(Study, on_delete=models.CASCADE, related_name="datasets")
    name = models.CharField(max_length=180)
    rows = models.JSONField(default=list)
    summary = models.JSONField(default=dict)
    metadata = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    expired = models.BooleanField(default=False)


class Assessment(Record):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="assessments")
    snapshot = models.ForeignKey(AnalyticsSnapshot, on_delete=models.SET_NULL, null=True)
    version = models.PositiveIntegerField()
    brief = models.JSONField()
    owner_name = models.CharField(max_length=100, blank=True)
    review_date = models.DateField(null=True)
    analyst_note = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["project", "version"], name="unique_assessment_version")
        ]


class Experiment(Record):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="experiments")
    assessment = models.ForeignKey(Assessment, on_delete=models.SET_NULL, null=True)
    title = models.CharField(max_length=180)
    hypothesis = models.TextField()
    population = models.TextField()
    assignment_unit = models.CharField(max_length=80, default="identified_user")
    design = models.CharField(max_length=30, default="randomized")
    primary_metric = models.CharField(max_length=180)
    minimum_effect = models.CharField(max_length=100, blank=True)
    guardrails = models.TextField()
    stopping_rule = models.TextField()
    instrumentation_check = models.TextField(blank=True)
    owner_name = models.CharField(max_length=100)
    review_date = models.DateField()
    status = models.CharField(max_length=20, default="planned")
    outcome = models.JSONField(null=True)


class Job(Record):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="jobs")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    kind = models.CharField(max_length=30)
    payload = models.JSONField(default=dict)
    status = models.CharField(max_length=24, default="queued")
    idempotency_key = models.CharField(max_length=100)
    attempts = models.PositiveIntegerField(default=0)
    progress = models.PositiveIntegerField(default=0)
    cancel_requested = models.BooleanField(default=False)
    lease_until = models.DateTimeField(null=True)
    lease_token = models.UUIDField(null=True)
    error = models.CharField(max_length=500, blank=True)
    result = models.JSONField(default=dict)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["project", "kind", "idempotency_key"], name="unique_job_request"
            )
        ]
        indexes = [models.Index(fields=["status", "lease_until"])]


class PanelRun(Record):
    study = models.ForeignKey(Study, on_delete=models.CASCADE, related_name="runs")
    job = models.OneToOneField(Job, on_delete=models.CASCADE, related_name="panel_run")
    config = models.JSONField()
    budget = models.DecimalField(max_digits=8, decimal_places=4)
    spent = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    reserved = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    uncertain_cost = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    summary = models.JSONField(default=dict)


class PanelResponse(Record):
    run = models.ForeignKey(PanelRun, on_delete=models.CASCADE, related_name="responses")
    concept = models.ForeignKey(Concept, on_delete=models.CASCADE)
    persona = models.PositiveIntegerField()
    draw = models.PositiveIntegerField(default=0)
    method = models.CharField(max_length=30)
    status = models.CharField(max_length=20, default="pending")
    content = models.JSONField(default=dict)
    usage = models.JSONField(default=dict)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["run", "concept", "persona", "draw", "method"], name="unique_panel_response"
            )
        ]


class AuditEntry(Record):
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    operation = models.CharField(max_length=60)
    resource_id = models.CharField(max_length=80)
