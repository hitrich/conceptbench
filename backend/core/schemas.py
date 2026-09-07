from datetime import date, datetime
from typing import Literal
from uuid import UUID
from ninja import Schema
from pydantic import Field, ConfigDict, model_validator


class StrictSchema(Schema):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Credentials(StrictSchema):
    username: str = Field(min_length=3, max_length=100, pattern=r"^[a-zA-Z0-9_.@+-]+$")
    password: str = Field(min_length=1, max_length=200)


class ProjectIn(StrictSchema):
    name: str = Field(min_length=1, max_length=160)
    promise: str = Field(default="", max_length=2000)
    audience: str = Field(default="", max_length=2000)
    concern: str = Field(default="", max_length=2000)
    cadence: Literal["weekly"] = "weekly"


class MemberIn(StrictSchema):
    username: str = Field(min_length=3, max_length=100, pattern=r"^[a-zA-Z0-9_.@+-]+$")
    role: Literal["owner", "editor", "viewer"]
    can_export: bool = False


class ReviewWindow(StrictSchema):
    start: date
    end: date

    @model_validator(mode="after")
    def ordered(self):
        if self.end < self.start:
            raise ValueError("Review-window end precedes its start.")
        return self


class ContractIn(StrictSchema):
    unit: Literal["identified_user"] = "identified_user"
    entry_event: str = Field(min_length=1, max_length=120)
    value_event: str = Field(min_length=1, max_length=120)
    return_event: str = Field(min_length=1, max_length=120)
    activation_window_days: Literal[7] = 7
    return_window_days: tuple[Literal[21], Literal[28]] = (21, 28)
    time_basis: Literal["elapsed_utc_days"] = "elapsed_utc_days"
    cohort_entry: Literal["first_observed_eligible_signup"] = "first_observed_eligible_signup"
    segment_properties: list[str] = Field(min_length=1, max_length=3)
    segment_assignment: Literal["value_at_cohort_entry"] = "value_at_cohort_entry"
    exclude_internal_traffic: Literal[True] = True
    minimum_detectable_change_pp: float | None = Field(default=None, gt=0, le=100)
    viability_target: float | None = Field(default=None, gt=0, le=100)
    baseline_approved: bool = False
    review_windows: list[ReviewWindow] = Field(default_factory=list, max_length=6)
    confirmed: Literal[True]

    @model_validator(mode="after")
    def disjoint_windows(self):
        windows = sorted(self.review_windows, key=lambda w: w.start)
        if any(a.end >= b.start for a, b in zip(windows, windows[1:])):
            raise ValueError("Declared review windows must not overlap.")
        if any(not name.strip() or len(name) > 120 for name in self.segment_properties):
            raise ValueError("Segment property names must contain 1–120 characters.")
        return self


class AggregateRow(StrictSchema):
    period: Literal["earlier", "later"]
    cohort_start: date
    cohort_end: date
    segment: str = Field(min_length=1, max_length=150)
    signups: int = Field(ge=0, le=100000000, strict=True)
    activated: int = Field(ge=0, le=100000000, strict=True)
    retained: int = Field(ge=0, le=100000000, strict=True)
    retained_activated: int = Field(ge=0, le=100000000, strict=True)

    @model_validator(mode="after")
    def counts(self):
        if self.cohort_end < self.cohort_start:
            raise ValueError("Cohort end precedes cohort start.")
        if max(self.activated, self.retained) > self.signups or self.retained_activated > min(
            self.activated, self.retained
        ):
            raise ValueError("A numerator exceeds its denominator.")
        if self.retained_activated < self.activated + self.retained - self.signups:
            raise ValueError("Activated and retained counts have an impossible overlap.")
        return self


class QualityIn(StrictSchema):
    definitions_verified: bool = False
    identity_verified: bool = False
    completeness_verified: bool = False
    sampling_verified: bool = False
    tracking_issue: bool = False
    missing_events: list[str] = Field(default_factory=list, max_length=10)
    notes: str = Field(default="", max_length=2000)


class SnapshotIn(StrictSchema):
    contract_id: UUID
    rows: list[AggregateRow] = Field(min_length=1, max_length=2000)
    analysis_cutoff: datetime
    latest_event_at: datetime | None = None
    quality: QualityIn
    source_name: str = Field(min_length=1, max_length=180)

    @model_validator(mode="after")
    def timezones(self):
        if self.analysis_cutoff.tzinfo is None or (
            self.latest_event_at and self.latest_event_at.tzinfo is None
        ):
            raise ValueError("Timestamps must include a UTC offset.")
        return self


class BriefEdit(StrictSchema):
    owner_name: str = Field(max_length=100)
    review_date: date
    analyst_note: str = Field(default="", max_length=6000)


class ConceptIn(StrictSchema):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=10, max_length=3000)
    group: str = Field(min_length=1, max_length=120)
    split: Literal["development", "held_out"] = "development"


class StudyIn(StrictSchema):
    title: str = Field(min_length=1, max_length=160)
    audience: str = Field(min_length=5, max_length=2000)
    question: str = Field(min_length=5, max_length=1000)
    hypothesis: str = Field(default="", max_length=2000)
    concepts: list[ConceptIn] = Field(min_length=3, max_length=5)

    @model_validator(mode="after")
    def groups(self):
        groups = {}
        for concept in self.concepts:
            if concept.group in groups and groups[concept.group] != concept.split:
                raise ValueError("Related concepts must stay in the same evaluation split.")
            groups[concept.group] = concept.split
        if len({c.name.casefold() for c in self.concepts}) != len(self.concepts):
            raise ValueError("Concept names must be unique within the study.")
        return self


class ExperimentIn(StrictSchema):
    title: str = Field(min_length=1, max_length=180)
    hypothesis: str = Field(min_length=10, max_length=3000)
    population: str = Field(min_length=3, max_length=2000)
    assignment_unit: Literal["identified_user"] = "identified_user"
    design: Literal["randomized", "observational"] = "randomized"
    primary_metric: str = Field(min_length=3, max_length=180)
    minimum_effect: str = Field(default="", max_length=100)
    guardrails: str = Field(min_length=3, max_length=2000)
    stopping_rule: str = Field(min_length=3, max_length=2000)
    instrumentation_check: str = Field(default="", max_length=2000)
    owner_name: str = Field(min_length=1, max_length=100)
    review_date: date


class OutcomeIn(StrictSchema):
    decision: Literal["adopt", "iterate", "stop", "inconclusive"]
    result: str = Field(min_length=10, max_length=6000)
    evidence: str = Field(min_length=3, max_length=3000)
    limitations: str = Field(min_length=3, max_length=3000)


class PostHogIn(StrictSchema):
    region: Literal["us", "eu"]
    external_project_id: int = Field(gt=0)
    api_key: str = Field(min_length=20, max_length=500)
    endpoint_name: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    endpoint_version: int = Field(ge=1)
    contract_id: UUID


class RefreshIn(StrictSchema):
    date_from: date
    date_to: date
    analysis_cutoff: datetime
    quality: QualityIn

    @model_validator(mode="after")
    def range(self):
        if not 1 <= (self.date_to - self.date_from).days <= 90:
            raise ValueError("Select between 1 and 90 days.")
        if self.analysis_cutoff.tzinfo is None:
            raise ValueError("The analysis cutoff requires a UTC offset.")
        return self


class PanelIn(StrictSchema):
    budget: float = Field(gt=0, le=100)
    personas: int = Field(ge=1, le=10)
    consent: Literal[True]


class RetentionIn(StrictSchema):
    raw_retention_days: int = Field(ge=1, le=30)
    aggregate_retention_days: int = Field(ge=1, le=90)
    run_budget_limit: float = Field(ge=0, le=100)


class AssessmentIn(StrictSchema):
    snapshot_ids: list[UUID] = Field(min_length=1, max_length=6)
    human_dataset_ids: list[UUID] = Field(default_factory=list, max_length=5)
    experiment_ids: list[UUID] = Field(default_factory=list, max_length=10)
    research_relevance_confirmed: bool = False
    human_signal: Literal["none", "expectation_mismatch", "reliability_issue", "weak_value"] = (
        "none"
    )
    alternative_kind: Literal[
        "audience", "problem", "solution", "positioning", "business_model"
    ] = "solution"
    alternative_hypothesis: str = Field(default="", max_length=3000)
    analyst_note: str = Field(default="", max_length=6000)
