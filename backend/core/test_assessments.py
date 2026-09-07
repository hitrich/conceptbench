import copy
import json
from datetime import timedelta, datetime, timezone as dt_timezone
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import AnalyticsSnapshot, HumanDataset, Experiment, MetricContract, Assessment
from .demo import seed_demo
from .analysis import integrate_evidence, assess, digest
from .jobs import purge_expired


class IntegratedAssessmentTests(TestCase):
    def setUp(self):
        self.user=get_user_model().objects.create_user('research-owner')
        self.project=seed_demo(self.user)
        self.snapshot=self.project.snapshots.first()
        self.client.force_login(self.user)
        self.context={'research_relevance_confirmed':True,'human_signal':'weak_value','alternative_kind':'audience','alternative_hypothesis':'Serve a narrower audience with a recurring compliance task.'}

    def test_synthetic_enthusiasm_cannot_override_measured_mix(self):
        dataset=HumanDataset.objects.filter(study__project=self.project).first()
        result=integrate_evidence(self.project.assessments.first().brief,[self.snapshot],[dataset],[],self.context)
        self.assertEqual(result['state'],'test_segment_focus')
        self.assertFalse(result['pivot_eligibility']['eligible'])

    def test_unsupported_evidence_reference_is_rejected(self):
        response=self.client.post(f'/api/v1/projects/{self.project.id}/assessments',data=json.dumps({'snapshot_ids':[str(self.snapshot.id)],'human_dataset_ids':['00000000-0000-0000-0000-000000000000']}),content_type='application/json')
        self.assertEqual(response.status_code,404)
        self.assertEqual(self.project.assessments.count(),1)

    def test_integrated_revision_and_dataset_deletion_remove_derivatives(self):
        dataset=HumanDataset.objects.filter(study__project=self.project).first()
        response=self.client.post(f'/api/v1/projects/{self.project.id}/assessments',data=json.dumps({'snapshot_ids':[str(self.snapshot.id)],'human_dataset_ids':[str(dataset.id)]}),content_type='application/json')
        self.assertEqual(response.status_code,200,response.content)
        self.assertEqual(response.json()['version'],2)
        self.assertEqual(len(response.json()['brief']['research_evidence']),1)
        self.client.delete(f'/api/v1/datasets/{dataset.id}')
        self.assertEqual(self.project.assessments.count(),1)

    def test_pivot_requires_all_predeclared_independent_window_gates(self):
        contract=self.snapshot.contract
        config={**contract.config,'viability_target':30,'minimum_detectable_change_pp':5,'baseline_approved':True,'review_windows':[{'start':'2026-02-01','end':'2026-02-07'},{'start':'2026-04-01','end':'2026-04-07'}]}
        contract.config=config;contract.content_hash=digest(config);contract.save()
        MetricContract.objects.filter(id=contract.id).update(created_at=datetime(2025,12,1,tzinfo=dt_timezone.utc));contract.refresh_from_db()
        snapshots=[]
        for earlier,later in [('01','02'),('03','04')]:
            rows=[{'period':p,'cohort_start':f'2026-{m}-01','cohort_end':f'2026-{m}-07','segment':'Organic','signups':1000,'activated':500,'retained':50,'retained_activated':40} for p,m in [('earlier',earlier),('later',later)]]
            snapshots.append(AnalyticsSnapshot.objects.create(project=self.project,contract=contract,source='csv',rows=rows,quality=self.snapshot.quality,content_hash=digest(rows),analysis_cutoff=datetime(2026,6,1,tzinfo=dt_timezone.utc),collected_at=timezone.now()))
        dataset=HumanDataset.objects.filter(study__project=self.project).first();dataset.metadata['synthetic']=False;dataset.save()
        experiments=[]
        for i in range(2):
            experiments.append(Experiment.objects.create(project=self.project,title=f'Narrow intervention {i}',hypothesis='A focused reliability fix restores repeated value.',population='Eligible users',primary_metric='W4',guardrails='Tracking stable',stopping_rule='Predeclared mature window',owner_name='Reviewer',review_date=timezone.now().date(),status='complete',outcome={'decision':'stop','result':'The intervention failed to improve the declared metric.','evidence':'Reviewed source reference','limitations':'Specific population only.'}))
        base=assess(snapshots[-1].id,snapshots[-1].rows,snapshots[-1].analysis_cutoff,self.snapshot.quality,config)
        complete=integrate_evidence(base,snapshots,[dataset],experiments,self.context)
        self.assertEqual(complete['state'],'evaluate_pivot')
        contract.config['review_windows']=[];contract.save()
        self.assertNotEqual(integrate_evidence(base,snapshots,[dataset],experiments,self.context)['state'],'evaluate_pivot')
        self.assertNotEqual(integrate_evidence(base,snapshots,[dataset],experiments[:1],self.context)['state'],'evaluate_pivot')

    def test_expiration_purges_raw_research_and_does_not_extend_snapshot_life(self):
        dataset=HumanDataset.objects.filter(study__project=self.project).first()
        HumanDataset.objects.filter(id=dataset.id).update(expires_at=timezone.now()-timedelta(days=1))
        purge_expired();dataset.refresh_from_db();self.assertTrue(dataset.expired);self.assertEqual(dataset.rows,[])
        AnalyticsSnapshot.objects.filter(id=self.snapshot.id).update(collected_at=timezone.now()-timedelta(days=91))
        purge_expired();self.assertFalse(self.project.assessments.exists())
