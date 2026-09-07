import json
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
import httpx
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import Job, PanelRun, PanelResponse, Membership, Connection
from .demo import seed_demo
from .services import enqueue
from .jobs import claim_job, execute_job
from .panel import freeze_config, ensure_active, StopRun, provider_config, PanelError
from .posthog import parse_result, ConnectorError, COLUMNS, verify

PROVIDER = dict(MODEL_API_KEY='fake-test-key',MODEL_NAME='test-model',MODEL_INPUT_USD_PER_MILLION='1',MODEL_OUTPUT_USD_PER_MILLION='2',EMBEDDING_USD_PER_MILLION='1')


@override_settings(**PROVIDER)
class JobTests(TestCase):
    def setUp(self):
        self.user=get_user_model().objects.create_user('worker-owner')
        self.project=seed_demo(self.user)
        self.study=self.project.studies.first()
        self.calls=[]

    def panel(self,budget=1):
        job,_=enqueue(self.user,self.project,'panel',{'study_id':str(self.study.id)},'panel-test')
        return PanelRun.objects.create(study=self.study,job=job,config=freeze_config(self.study,1),budget=budget)

    def provider(self,request):
        body=json.loads(request.content)
        self.calls.append(body)
        if request.url.path.endswith('/embeddings'):
            if len(body['input'])==10:
                vectors=[[int(i%5==j) for j in range(5)] for i in range(10)]
            else:
                vectors=[[0,0,0,0,1]]
            return httpx.Response(200,json={'data':[{'index':i,'embedding':v} for i,v in enumerate(vectors)],'usage':{'prompt_tokens':2,'total_tokens':2}})
        prop=body['response_format']['json_schema']['schema']['required'][0]
        value={'reaction':'This could help me prepare my weekly review.'} if prop=='reaction' else {'rating':4}
        return httpx.Response(200,json={'choices':[{'message':{'content':json.dumps(value)}}],'usage':{'prompt_tokens':2,'completion_tokens':2}})

    def test_complete_run_uses_upstream_ssr_and_preserves_frozen_versions(self):
        run=self.panel()
        real_client=httpx.Client
        with patch('core.panel.httpx.Client',side_effect=lambda **kwargs:real_client(transport=httpx.MockTransport(self.provider))):
            job=claim_job();execute_job(job)
        run.refresh_from_db();job.refresh_from_db()
        self.assertEqual(job.status,'complete',job.error)
        self.assertEqual(len(self.calls),13)
        self.assertEqual(run.responses.count(),13)
        self.assertTrue(run.summary['balanced_complete'])
        self.assertEqual(run.reserved,0)
        self.assertEqual(run.uncertain_cost,0)
        self.assertGreater(run.spent,0)
        self.assertLess(run.spent,run.budget)
        for summary in run.summary['concepts'].values():
            self.assertEqual(summary['ssr'],[0,0,0,0,1])
        frozen=run.config['stimulus_hash']
        self.study.title='Changed title';self.study.save()
        run.refresh_from_db();self.assertEqual(run.config['stimulus_hash'],frozen)

    def test_budget_gate_prevents_dispatch(self):
        run=self.panel(budget=Decimal('.000001'))
        with patch('core.panel.httpx.Client') as client:
            job=claim_job();execute_job(job)
        client.assert_not_called()
        job.refresh_from_db();run.refresh_from_db()
        self.assertEqual(job.status,'partially_complete')
        self.assertEqual(run.spent,0)
        self.assertEqual(run.reserved,0)

    def test_crash_recovery_fences_old_worker_and_marks_submitted_cost_uncertain(self):
        run=self.panel();old=claim_job()
        PanelResponse.objects.create(run=run,concept=self.study.concepts.first(),persona=1,method='reaction',status='submitted')
        run.reserved=Decimal('.1');run.save()
        Job.objects.filter(id=old.id).update(lease_until=timezone.now()-timedelta(seconds=1))
        new=claim_job()
        self.assertNotEqual(new.lease_token,old.lease_token)
        with self.assertRaises(StopRun):ensure_active(old)
        run.refresh_from_db()
        self.assertEqual(run.reserved,0)
        self.assertEqual(run.uncertain_cost,Decimal('.1'))
        self.assertEqual(run.responses.get().status,'uncertain')

    def test_cancel_after_one_call_prevents_further_dispatch(self):
        run=self.panel();real_client=httpx.Client
        def cancel(request):
            Job.objects.filter(id=run.job_id).update(cancel_requested=True)
            return self.provider(request)
        with patch('core.panel.httpx.Client',side_effect=lambda **kwargs:real_client(transport=httpx.MockTransport(cancel))):
            job=claim_job();execute_job(job)
        self.assertEqual(len(self.calls),1)
        job.refresh_from_db();self.assertEqual(job.status,'cancelled')

    def test_revoked_membership_blocks_background_work(self):
        self.panel();job=claim_job()
        Membership.objects.filter(user=self.user).update(role='viewer')
        with patch('core.panel.httpx.Client') as client:execute_job(job)
        client.assert_not_called()
        job.refresh_from_db();self.assertIn('permission',job.error)

    def test_idempotent_queue_is_one_job(self):
        a,_=enqueue(self.user,self.project,'posthog_refresh',{'scope':'one'},'key')
        b,created=enqueue(self.user,self.project,'posthog_refresh',{'scope':'one'},'key')
        self.assertEqual(a.id,b.id);self.assertFalse(created)


class ConnectorTests(TestCase):
    def result(self):
        return {'columns':COLUMNS,'results':[['earlier','2026-01-01','2026-01-07','Organic',100,50,30,25]],'hasMore':False,'endpoint_version':1}

    def test_version_schema_truncation_and_empty_results_are_not_zeroes(self):
        self.assertEqual(parse_result(self.result(),1)[0]['retained'],30)
        for change in [{'hasMore':True},{'hasMore':None},{'endpoint_version':2},{'results':[]},{'columns':['unexpected']}]:
            with self.assertRaises(ConnectorError):parse_result({**self.result(),**change},1)

    def test_capture_key_and_wrong_region_never_reach_network(self):
        with patch('core.posthog.httpx.Client') as client:
            with self.assertRaises(ConnectorError):verify('us',1,'phc_public_capture_key','test',1)
            with self.assertRaises(ConnectorError):verify('private',1,'phx_private_key','test',1)
        client.assert_not_called()

    def test_connection_requires_a_fingerprintable_definition(self):
        with patch('core.posthog.request', side_effect=[{'id':1}, {'name':'test','is_active':True,'query':None}]):
            with self.assertRaisesMessage(ConnectorError, 'fingerprint'):
                verify('us',1,'phx_test_key','test',1)

    def test_provider_timeout_preserves_last_successful_snapshot(self):
        user=get_user_model().objects.create_user('refresh-owner');project=seed_demo(user)
        contract=project.contracts.first()
        conn=Connection.objects.create(project=project,region='us',external_project_id=1,credential='fake-encrypted',endpoints={'name':'test','version':1},contract_hash=contract.content_hash)
        job,_=enqueue(user,project,'posthog_refresh',{'connection_id':str(conn.id),'contract_hash':contract.content_hash,'contract_id':str(contract.id)},'timeout')
        with patch('core.jobs.fetch_aggregates',side_effect=ConnectorError('Provider timeout.')):
            execute_job(claim_job())
        self.assertEqual(project.snapshots.count(),1)
        self.assertEqual(project.assessments.count(),1)
        conn.refresh_from_db();self.assertEqual(conn.status,'stale')
