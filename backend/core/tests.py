import copy
import json
from datetime import datetime, timezone
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.conf import settings
from .analysis import rate, difference, calculate, assess
from .demo import seed_demo, DEFAULT_CONTRACT
from .models import Membership, Assessment, AnalyticsSnapshot, HumanDataset
from .research import ssr_distribution, parse_human_csv
import numpy as np


class NumericalTests(TestCase):
    def setUp(self):
        self.fixture = json.loads((settings.BASE_DIR / "demo/acquisition-mix.json").read_text())

    def test_acquisition_mix_and_independent_interval(self):
        result = calculate(self.fixture["rows"], self.fixture["analysis_cutoff"])
        self.assertEqual(result["metrics"]["retention"]["earlier"]["rate"], 18.75)
        self.assertEqual(result["metrics"]["retention"]["later"]["rate"], 12)
        self.assertEqual(result["metrics"]["retention"]["change"]["pp"], -6.75)
        self.assertEqual(result["standardized_later"], 18.75)
        self.assertEqual([s["change"]["pp"] for s in result["segments"]], [0, 0])
        quality = dict.fromkeys(
            [
                "definitions_verified",
                "identity_verified",
                "sampling_verified",
                "completeness_verified",
            ],
            True,
        )
        brief = assess(
            "fixture",
            self.fixture["rows"],
            self.fixture["analysis_cutoff"],
            quality,
            DEFAULT_CONTRACT,
        )
        self.assertEqual(brief["state"], "test_segment_focus")
        quality["completeness_verified"] = False
        self.assertEqual(
            assess(
                "fixture",
                self.fixture["rows"],
                self.fixture["analysis_cutoff"],
                quality,
                DEFAULT_CONTRACT,
            )["state"],
            "insufficient_evidence",
        )
        # Fixed-mix totals can also hide offsetting changes within segments.
        quality["completeness_verified"] = True
        offsetting = copy.deepcopy(self.fixture["rows"])
        for row in offsetting:
            if row["period"] == "later":
                row["retained"] += 12 if row["segment"] == "Organic" else -48
                row["retained_activated"] = min(row["retained_activated"], row["retained"])
        self.assertAlmostEqual(
            calculate(offsetting, self.fixture["analysis_cutoff"])["standardized_later"], 18.75
        )
        self.assertNotEqual(
            assess(
                "offsetting", offsetting, self.fixture["analysis_cutoff"], quality, DEFAULT_CONTRACT
            )["state"],
            "test_segment_focus",
        )

    def test_wilson_golden_boundaries(self):
        self.assertIsNone(rate(0, 0)["rate"])
        with self.assertRaises(ValueError):
            rate(1, 0)
        self.assertAlmostEqual(rate(0, 10)["interval"][1], 27.7532799863, places=7)
        self.assertAlmostEqual(rate(10, 10)["interval"][0], 72.2467200137, places=7)
        self.assertAlmostEqual(rate(50, 100)["interval"][0], 40.383153, places=5)
        self.assertEqual(difference(rate(0, 0), rate(1, 10))["pp"], None)

    def test_maturity_excludes_whole_cohort_at_boundary(self):
        result = calculate(self.fixture["rows"], "2026-08-25T00:00:00+00:00")
        self.assertIsNone(result["metrics"]["retention"]["later"]["rate"])
        self.assertEqual(len(result["excluded"]), 2)
        complete = calculate(self.fixture["rows"], "2026-08-26T00:00:00+00:00")
        self.assertEqual(complete["metrics"]["retention"]["later"]["rate"], 12)

    def test_overlap_rejected(self):
        from .schemas import ContractIn

        with self.assertRaises(ValueError):
            ContractIn(
                **{
                    **DEFAULT_CONTRACT,
                    "review_windows": [
                        {"start": "2027-01-01", "end": "2027-01-07"},
                        {"start": "2027-01-07", "end": "2027-01-14"},
                    ],
                }
            )
        rows = self.fixture["rows"] + [self.fixture["rows"][0]]
        with self.assertRaises(ValueError):
            calculate(rows, self.fixture["analysis_cutoff"])

    def test_upstream_ssr_fixture_and_degeneracy(self):
        self.assertTrue(
            np.allclose(ssr_distribution([[1, 0, 0, 0, 0]], np.eye(5)), [[1, 0, 0, 0, 0]])
        )
        self.assertTrue(
            np.allclose(ssr_distribution([[1, 1, 0, 0, 0]], np.eye(5)), [[0.5, 0.5, 0, 0, 0]])
        )
        for response in [[[0, 0, 0, 0, 0]], [[1, 1, 1, 1, 1]], [[float("nan"), 1, 0, 0, 0]]]:
            with self.assertRaises(ValueError):
                ssr_distribution(response, np.eye(5))


class WorkflowTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("alice", password="Safe-word-for-tests-10")
        self.project = seed_demo(self.user)
        self.client.force_login(self.user)

    def test_demo_read_source_export_and_immutable_revision(self):
        overview = self.client.get(f"/api/v1/projects/{self.project.id}/overview").json()
        self.assertEqual(overview["assessment"]["brief"]["state"], "test_segment_focus")
        assessment = Assessment.objects.get(id=overview["assessment"]["id"])
        response = self.client.post(
            f"/api/v1/assessments/{assessment.id}/revisions",
            data=json.dumps(
                {
                    "owner_name": "Alice",
                    "review_date": "2026-10-01",
                    "analyst_note": "Review economics first.",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        assessment.refresh_from_db()
        self.assertEqual(assessment.analyst_note, "")
        self.assertEqual(response.json()["version"], 2)
        self.assertContains(
            self.client.get(f"/api/v1/assessments/{assessment.id}/export"), "225/1200"
        )
        self.assertEqual(
            self.client.get(f"/api/v1/snapshots/{assessment.snapshot_id}").status_code, 200
        )

    def test_workspace_isolation_and_viewer_permissions(self):
        other = get_user_model().objects.create_user("bob")
        self.client.force_login(other)
        assessment = self.project.assessments.first()
        for path in [
            f"projects/{self.project.id}/overview",
            f"assessments/{assessment.id}",
            f"assessments/{assessment.id}/export",
            f"snapshots/{assessment.snapshot_id}",
        ]:
            self.assertEqual(self.client.get("/api/v1/" + path).status_code, 404)
        Membership.objects.create(workspace=self.project.workspace, user=other, role="viewer")
        self.assertEqual(
            self.client.get(f"/api/v1/projects/{self.project.id}/overview").status_code, 200
        )
        self.assertEqual(
            self.client.get(f"/api/v1/assessments/{assessment.id}/export").status_code, 403
        )
        self.assertEqual(self.client.delete(f"/api/v1/projects/{self.project.id}").status_code, 403)

    def test_owner_manages_access_and_cannot_remove_the_last_owner(self):
        other = get_user_model().objects.create_user("teammate")
        path = f"/api/v1/projects/{self.project.id}/members"
        response = self.client.put(
            path,
            data=json.dumps({"username": "teammate", "role": "viewer"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.delete(f"{path}/{self.user.id}").status_code, 409)
        self.assertEqual(
            self.client.put(
                path,
                data=json.dumps({"username": "alice", "role": "viewer"}),
                content_type="application/json",
            ).status_code,
            409,
        )
        self.client.force_login(other)
        self.assertEqual(self.client.get(path).status_code, 403)
        self.assertEqual(
            self.client.put(
                path,
                data=json.dumps({"username": "teammate", "role": "owner"}),
                content_type="application/json",
            ).status_code,
            403,
        )
        self.client.force_login(self.user)
        self.assertEqual(self.client.delete(f"{path}/{other.id}").status_code, 200)
        self.client.force_login(other)
        self.assertEqual(
            self.client.get(f"/api/v1/projects/{self.project.id}/overview").status_code, 404
        )

    def test_running_experiment_cannot_be_rewritten_or_receive_two_outcomes(self):
        from .schemas import ExperimentIn

        experiment = self.project.experiments.first()
        spec = {key: getattr(experiment, key) for key in ExperimentIn.model_fields}
        path = f"/api/v1/experiments/{experiment.id}"
        self.assertEqual(
            self.client.put(
                path, data=json.dumps(spec, default=str), content_type="application/json"
            ).status_code,
            409,
        )
        outcome = {
            "decision": "inconclusive",
            "result": "The completed cohort is too small to distinguish the alternatives.",
            "evidence": "Reviewed source fixture",
            "limitations": "Limited precision.",
        }
        first = self.client.post(
            path + "/outcomes", data=json.dumps(outcome), content_type="application/json"
        )
        self.assertEqual(first.status_code, 200, first.content)
        second = self.client.post(
            path + "/outcomes",
            data=json.dumps({**outcome, "decision": "adopt"}),
            content_type="application/json",
        )
        self.assertEqual(second.status_code, 409)
        experiment.refresh_from_db()
        self.assertEqual(experiment.outcome["decision"], "inconclusive")

    def test_csrf_and_unavailable_credentials(self):
        client = Client(enforce_csrf_checks=True)
        self.assertEqual(client.post("/api/v1/auth/demo").status_code, 403)
        client.force_login(self.user)
        self.assertEqual(client.delete(f"/api/v1/projects/{self.project.id}").status_code, 403)

    def test_csv_rejects_wrong_study_and_duplicate_rows(self):
        study = self.project.studies.first()
        concept = study.concepts.first()
        header = "study_id,concept_version,respondent_id,question_id,rating,collected_at\n"
        row = f"{study.id},{concept.id},anon-1,intent,4,2026-09-01T00:00:00Z\n"
        rows, errors = parse_human_csv((header + row + row).encode(), study.id, {str(concept.id)})
        self.assertFalse(rows)
        self.assertEqual(errors[0]["row"], 3)
        rows, errors = parse_human_csv((header + row).encode(), "another-study", {str(concept.id)})
        self.assertTrue(errors)

    def test_project_deletion_cascades_private_data(self):
        self.assertTrue(HumanDataset.objects.filter(study__project=self.project).exists())
        self.assertEqual(self.client.delete(f"/api/v1/projects/{self.project.id}").status_code, 200)
        self.assertFalse(AnalyticsSnapshot.objects.exists())
        self.assertFalse(HumanDataset.objects.exists())

    def test_demo_login_with_real_csrf_session(self):
        client = Client(enforce_csrf_checks=True)
        token = client.get("/api/v1/session").json()["csrf_token"]
        response = client.post("/api/v1/auth/demo", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(client.get("/api/v1/session").json()["authenticated"])
        self.assertEqual(len(client.get("/api/v1/projects").json()), 1)
