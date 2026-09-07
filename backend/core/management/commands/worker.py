import time
from django.core.management.base import BaseCommand
from django.db import close_old_connections
from core.jobs import claim_job, execute_job, purge_expired


class Command(BaseCommand):
    help = "Run the durable ConceptBench queue and retention cleanup."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Process at most one job and exit.")

    def handle(self, *args, **options):
        last_cleanup = 0
        while True:
            close_old_connections()
            if time.monotonic() - last_cleanup > 60:
                purge_expired()
                last_cleanup = time.monotonic()
            job = claim_job()
            if job:
                self.stdout.write(
                    f"job={job.id} project={job.project_id} stage={job.kind} attempt={job.attempts}"
                )
                execute_job(job)
            if options["once"]:
                return
            if not job:
                time.sleep(2)
