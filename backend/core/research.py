"""Private research validation and reproducible scoring without model calls."""

import csv
import io
from collections import defaultdict
from datetime import datetime
import numpy as np
from scipy.stats import wasserstein_distance, spearmanr
from .vendor.ssr import compute

REQUIRED_HUMAN = {
    "study_id",
    "concept_version",
    "respondent_id",
    "question_id",
    "rating",
    "collected_at",
}


def parse_human_csv(content, study_id, concept_ids):
    if len(content) > 5 * 1024 * 1024:
        raise ValueError("The CSV exceeds 5 MB.")
    try:
        reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    except UnicodeDecodeError as exc:
        raise ValueError("Save the CSV as UTF-8.") from exc
    if not reader.fieldnames or not REQUIRED_HUMAN.issubset(reader.fieldnames):
        raise ValueError("Required CSV columns: " + ", ".join(sorted(REQUIRED_HUMAN)))
    rows, errors, seen, questions = [], [], set(), set()
    for line, row in enumerate(reader, 2):
        if line > 10001:
            raise ValueError("The CSV exceeds 10,000 rows.")
        try:
            if None in row or any(row.get(k) is None for k in REQUIRED_HUMAN):
                raise ValueError("Column count does not match the header.")
            if row["study_id"] != str(study_id) or row["concept_version"] not in concept_ids:
                raise ValueError("Study or concept version does not belong to this study.")
            if row["rating"] not in ["1", "2", "3", "4", "5"]:
                raise ValueError("Rating must be an integer from 1 to 5.")
            if (
                not row["respondent_id"].strip()
                or len(row["respondent_id"]) > 120
                or "@" in row["respondent_id"]
            ):
                raise ValueError("Use an anonymous respondent ID (no email address).")
            if not row["question_id"].strip() or len(row["question_id"]) > 100:
                raise ValueError("Question ID is required and must be under 100 characters.")
            collected = datetime.fromisoformat(row["collected_at"].replace("Z", "+00:00"))
            if collected.tzinfo is None:
                raise ValueError("Collection time must include a UTC offset.")
            key = (row["concept_version"], row["respondent_id"], row["question_id"])
            if key in seen:
                raise ValueError("Duplicate respondent/concept/question response.")
            seen.add(key)
            questions.add(row["question_id"])
            if len(questions) > 1:
                raise ValueError("Import one matching question per dataset.")
            rows.append(
                {
                    **{k: row[k].strip() for k in REQUIRED_HUMAN},
                    "rating": int(row["rating"]),
                    "comment": row.get("comment", "")[:2000],
                    "segment": row.get("segment", "")[:100],
                }
            )
        except (ValueError, TypeError) as exc:
            errors.append({"row": line, "message": str(exc)})
        if len(errors) >= 30:
            break
    if errors:
        return [], errors
    if not rows:
        raise ValueError("The CSV has no responses.")
    return rows, []


def summarize_human(rows):
    grouped = defaultdict(list)
    for row in rows:
        grouped[row["concept_version"]].append(row["rating"])
    return {
        cid: {
            "n": len(ratings),
            "mean": sum(ratings) / len(ratings),
            "counts": [ratings.count(i) for i in range(1, 6)],
            "distribution": [ratings.count(i) / len(ratings) for i in range(1, 6)],
        }
        for cid, ratings in grouped.items()
    }


def ssr_distribution(responses, anchors, temperature=1.0, epsilon=0.0):
    responses, anchors = np.asarray(responses, dtype=float), np.asarray(anchors, dtype=float)
    if (
        responses.ndim != 2
        or anchors.ndim != 2
        or anchors.shape[0] != 5
        or responses.shape[1] != anchors.shape[1]
        or not len(responses)
    ):
        raise ValueError("Expected response embeddings (n, d) and five anchor embeddings (5, d).")
    if (
        not np.isfinite(responses).all()
        or not np.isfinite(anchors).all()
        or np.any(np.linalg.norm(responses, axis=1) == 0)
        or np.any(np.linalg.norm(anchors, axis=1) == 0)
    ):
        raise ValueError("Embeddings must be finite, nonzero vectors.")
    if not np.isfinite(temperature) or temperature <= 0 or not np.isfinite(epsilon) or epsilon < 0:
        raise ValueError("Invalid SSR temperature or smoothing.")
    similarities = compute.cosine_similarity_matrix(responses, anchors.T)
    if np.any(np.ptp(similarities, axis=1) < 1e-12):
        raise ValueError("Degenerate anchor similarities cannot support a rating.")
    pmfs = compute.scale_pmfs(compute.similarities_to_pmf(similarities, epsilon), temperature)
    if not np.isfinite(pmfs).all() or (pmfs < -1e-10).any() or not np.allclose(pmfs.sum(axis=1), 1):
        raise ValueError("SSR returned an invalid probability distribution.")
    return pmfs.tolist()


def compare_distributions(synthetic, human):
    ids = sorted(set(synthetic) & set(human))
    distances = {
        cid: float(
            wasserstein_distance(
                [1, 2, 3, 4, 5], [1, 2, 3, 4, 5], synthetic[cid], human[cid]["distribution"]
            )
        )
        for cid in ids
    }
    means = [sum((i + 1) * v for i, v in enumerate(synthetic[cid])) for cid in ids]
    human_means = [human[cid]["mean"] for cid in ids]
    tied = len(ids) < 5 or len(set(round(v, 1) for v in human_means)) < len(ids)
    ordering = (
        None if tied or len(set(means)) < 2 else float(spearmanr(means, human_means).statistic)
    )
    return {
        "wasserstein_distance": distances,
        "ordering_agreement": ordering,
        "ordering_status": "inconclusive" if ordering is None else "descriptive_only",
        "concepts": len(ids),
        "validation": "experimental",
        "limitation": "No domain validation or purchase prediction; held-out labels must never tune anchors.",
    }
