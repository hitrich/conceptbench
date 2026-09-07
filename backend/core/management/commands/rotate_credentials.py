from django.core.management.base import BaseCommand
from django.db import transaction
from core.models import Connection
from core.posthog import cipher


class Command(BaseCommand):
    help = "Re-encrypt saved provider credentials with the first CREDENTIAL_KEYS key."

    @transaction.atomic
    def handle(self, *args, **options):
        ring = cipher()
        count = 0
        for connection in Connection.objects.select_for_update():
            connection.credential = ring.rotate(connection.credential.encode()).decode()
            connection.save(update_fields=["credential"])
            count += 1
        self.stdout.write(f"Rotated {count} saved credentials. No key material was logged.")
