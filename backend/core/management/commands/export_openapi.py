import json
from django.core.management.base import BaseCommand
from core.api import api


class Command(BaseCommand):
    help = "Export the checked API contract without running a server."

    def handle(self, *args, **options):
        self.stdout.write(
            json.dumps(api.get_openapi_schema(path_prefix="/api/v1"), indent=2, sort_keys=True)
        )
