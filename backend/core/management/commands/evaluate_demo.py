import json
import numpy as np
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from core.analysis import calculate, RULE_VERSION
from core.panel import SSR_COMMIT
from core.research import ssr_distribution


class Command(BaseCommand):
    help = "Reproduce credential-free acquisition-mix and SSR numerical checks."

    def handle(self, *args, **options):
        fixture = json.loads((settings.BASE_DIR / "demo/acquisition-mix.json").read_text())
        analysis = calculate(fixture["rows"], fixture["analysis_cutoff"])
        rates = analysis["metrics"]["retention"]
        if (rates["earlier"]["rate"], rates["later"]["rate"], analysis["standardized_later"]) != (
            18.75,
            12,
            18.75,
        ):
            raise CommandError("The acquisition-mix golden values did not match.")
        vectors = json.loads((settings.BASE_DIR / "demo/ssr-numerical.json").read_text())
        result = ssr_distribution(vectors["responses"], vectors["anchors"])
        if not np.allclose(result, vectors["expected"], atol=1e-12):
            raise CommandError("The SSR algebraic fixture did not match.")
        self.stdout.write(
            json.dumps(
                {
                    "status": "passed",
                    "fabricated": True,
                    "rule_version": RULE_VERSION,
                    "retention": rates,
                    "fixed_earlier_mix": analysis["standardized_later"],
                    "ssr_commit": SSR_COMMIT,
                    "ssr_distributions": result,
                    "limitation": vectors["description"],
                },
                indent=2,
            )
        )
