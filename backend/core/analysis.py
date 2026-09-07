"""Deterministic arithmetic. No generated text or strategic confidence scores."""
import hashlib
import json
from datetime import date, datetime, time, timedelta, timezone
from math import sqrt
from collections import defaultdict

RULE_VERSION = '2026-09-07.3'


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), default=str).encode()).hexdigest()


def rate(k, n):
    if not 0 <= k <= n:
        raise ValueError('Invalid binomial counts')
    if n == 0:
        return {'numerator': k, 'denominator': n, 'rate': None, 'interval': None}
    p, z = k / n, 1.959963984540054
    center = (p + z*z/(2*n)) / (1 + z*z/n)
    margin = z * sqrt(p*(1-p)/n + z*z/(4*n*n)) / (1+z*z/n)
    return {'numerator': k, 'denominator': n, 'rate': 100*p, 'interval': [100*max(0, center-margin), 100*min(1, center+margin)]}


def difference(earlier, later):
    """Newcombe independent-proportion interval using Wilson limits, in pp."""
    if earlier['rate'] is None or later['rate'] is None:
        return {'pp': None, 'interval': None}
    a, b = earlier['rate'], later['rate']
    al, au = earlier['interval']
    bl, bu = later['interval']
    return {'pp': b-a, 'interval': [b-a-sqrt((b-bl)**2+(au-a)**2), b-a+sqrt((bu-b)**2+(a-al)**2)]}


def calculate(rows, cutoff):
    if isinstance(cutoff, str):
        cutoff = datetime.fromisoformat(cutoff.replace('Z', '+00:00'))
    totals = {p: {m: [0, 0] for m in ['activation', 'retention', 'conditional']} for p in ['earlier', 'later']}
    segments = defaultdict(lambda: {p: [0, 0] for p in ['earlier', 'later']})
    cohorts, excluded, seen = [], [], []
    period_ranges = defaultdict(list)
    for row in rows:
        start = date.fromisoformat(str(row['cohort_start']))
        end = date.fromisoformat(str(row['cohort_end']))
        for old_start, old_end, segment in seen:
            if segment == row['segment'] and max(old_start, start) <= min(old_end, end):
                raise ValueError('Cohorts overlap within a segment; unique users cannot be reconciled.')
        seen.append((start, end, row['segment']))
        period_ranges[row['period']].append((start, end))
        # Inclusive cohort_end: the latest possible signup is at the next UTC midnight.
        end_of_cohort = datetime.combine(end+timedelta(days=1), time.min, tzinfo=timezone.utc)
        a7 = end_of_cohort + timedelta(days=7) <= cutoff
        w4 = end_of_cohort + timedelta(days=28) <= cutoff
        period, n = row['period'], row['signups']
        if a7:
            totals[period]['activation'][0] += row['activated']
            totals[period]['activation'][1] += n
        if w4:
            for metric, k, denominator in [('retention', row['retained'], n), ('conditional', row['retained_activated'], row['activated'])]:
                totals[period][metric][0] += k
                totals[period][metric][1] += denominator
            segments[row['segment']][period][0] += row['retained']
            segments[row['segment']][period][1] += n
        else:
            excluded.append({'cohort_start': str(start), 'cohort_end': str(end), 'segment': row['segment'], 'eligible_on': (end_of_cohort+timedelta(days=28)).isoformat(), 'signups': n})
        cohorts.append({**row, 'a7_mature': a7, 'w4_mature': w4, 'activation': rate(row['activated'], n) if a7 else None, 'retention': rate(row['retained'], n) if w4 else None})
    if period_ranges['earlier'] and period_ranges['later'] and max(e for _, e in period_ranges['earlier']) >= min(s for s, _ in period_ranges['later']):
        raise ValueError('Earlier and later review periods must be disjoint and ordered.')
    metrics = {}
    for metric in ['activation', 'retention', 'conditional']:
        a, b = (rate(*totals[p][metric]) for p in ['earlier', 'later'])
        metrics[metric] = {'earlier': a, 'later': b, 'change': difference(a, b)}
    segment_results = [{'segment': s, **{p: rate(*v[p]) for p in ['earlier', 'later']}, 'change': difference(rate(*v['earlier']), rate(*v['later']))} for s, v in sorted(segments.items())]
    reference_n = totals['earlier']['retention'][1]
    standardized = None
    if reference_n and segment_results and all(s['earlier']['denominator'] and s['later']['denominator'] for s in segment_results):
        standardized = sum(s['earlier']['denominator']/reference_n * s['later']['rate'] for s in segment_results)
    return {'metrics': metrics, 'segments': segment_results, 'cohorts': cohorts, 'excluded': excluded, 'standardized_later': standardized, 'mature_cohorts': len({(r['cohort_start'], r['cohort_end']) for r in cohorts if r['w4_mature']}), 'periods': {p: {'start': str(min(s for s, _ in v)), 'end': str(max(e for _, e in v))} for p, v in period_ranges.items()}}


def assess(snapshot_id, rows, cutoff, quality, contract, source='csv'):
    result = calculate(rows, cutoff)
    retention = result['metrics']['retention']
    change = retention['change']['pp']
    standardized = result['standardized_later']
    all_verified = all(quality.get(k) for k in ['definitions_verified', 'identity_verified', 'completeness_verified', 'sampling_verified'])
    state = 'insufficient_evidence'
    title = 'Resolve the evidence gaps before choosing a direction.'
    summary = 'Confirm the metric definition, unique-user identity, sampling, and data completeness; collect two completed review periods.'
    contradictions = ['Analytics alone cannot establish demand for an alternative product.', 'Synthetic reactions are hypotheses to investigate, not observed customer behavior.']
    missing = []
    for key, label in [('definitions_verified', 'Confirmed event definitions'), ('identity_verified', 'Reconciled user identity'), ('completeness_verified', 'Verified source completeness'), ('sampling_verified', 'Confirmed sampling coverage')]:
        if not quality.get(key):
            missing.append(label)
    if quality.get('tracking_issue') or not quality.get('identity_verified') or quality.get('missing_events'):
        state, title = 'fix_measurement', 'Check the measurement before interpreting the change.'
        summary = 'Tracking or identity problems can explain the signal. Repair the event mapping and reconcile a new snapshot.'
    elif all_verified and change is not None:
        if standardized is not None and abs(change) > 0.1 and all(abs(s['change']['pp']) < 1e-9 for s in result['segments']):
            state = 'test_segment_focus'
            title = 'Investigate acquisition quality before product direction.'
            summary = 'The aggregate retention decline is explained by the measured acquisition mix. Within-source return rates are unchanged. Review the paid audience and test a more focused acquisition approach.' if change < 0 else 'The aggregate increase is explained by the measured acquisition mix. Validate the audience before attributing this change to the product.'
            contradictions = ['The mix explains the arithmetic, but does not explain why acquisition changed.', 'We do not have acquisition costs or transaction data to compare segment economics.']
        else:
            target, effect = contract.get('viability_target'), contract.get('minimum_detectable_change_pp')
            if target and effect and contract.get('baseline_approved'):
                interval = retention['change']['interval']
                if retention['later']['interval'][0] >= target and interval[0] > -effect:
                    state, title = 'continue_and_measure', 'Continue the current hypothesis and review on schedule.'
                    summary = 'The measured retention clears your declared target at the current precision. Preserve the review window and check the result again.'
                elif result['metrics']['activation']['change']['pp'] is not None and result['metrics']['activation']['change']['pp'] <= -effect:
                    state, title = 'investigate_friction', 'Investigate the path to first value.'
                    summary = 'Activation fell beyond your declared useful-effect threshold. Test onboarding or reliability and investigate selection effects in retained users.'
                else:
                    summary = 'The current precision or competing explanations do not support a definitive interpretation. Review the interval against your declared target and useful effect.'
            else:
                missing.append('An approved baseline, viability target, and minimum useful effect')
    if change is None:
        missing.append('Both earlier and later cohorts with complete 28-day windows')
    evidence = []
    for key, label in [('retention', 'W4 value retention'), ('activation', 'A7 activation'), ('conditional', 'W4 among A7-activated users')]:
        evidence.append({'id': f'{snapshot_id}:{key}', 'type': 'computed', 'label': label, 'snapshot_id': str(snapshot_id), **result['metrics'][key]})
    return {'rule_version': RULE_VERSION, 'state': state, 'title': title, 'summary': summary, 'analysis': result, 'evidence': evidence, 'contradictions': contradictions, 'missing': missing, 'what_would_change': 'A reconciled change within the same acquisition sources, relevant human research, or the reviewed outcome of a narrower intervention.', 'next_experiment': 'Test a focused paid audience' if state == 'test_segment_focus' else 'Resolve the highest-priority evidence gap', 'dimensions': {'measurement': 'Verified demo fixture' if source == 'demo' else ('Owner-confirmed' if all_verified else 'Needs verification'), 'effect_uncertainty': '95% Wilson / Newcombe intervals', 'synthetic_validity': 'Not validated for this audience', 'competing_explanations': 'Acquisition economics and recruitment bias unresolved'}, 'limitations': ['Intervals assume independent signup cohorts; they do not account for missing tracking, selection bias, or seasonality.', 'Conditional retention is descriptive and does not show that activation causes retention.', 'No revenue, willingness-to-pay, or pivot-probability conclusion is supported.'], 'synthetic': source == 'demo'}


def integrate_evidence(brief, snapshots, datasets, experiments, context):
    """Add reviewed human/context evidence without letting it override mix or measurement."""
    brief = json.loads(json.dumps(brief))
    brief['rule_version'] = RULE_VERSION
    brief['research_evidence'] = [{'id': str(d.id), 'type': 'reported' if not d.metadata.get('synthetic') else 'demonstration', 'name': d.name, 'recruitment_source': d.metadata.get('recruitment_source',''), 'response_count': sum(v['n'] for v in d.summary.values()), 'collected_at': d.created_at.isoformat()} for d in datasets]
    brief['intervention_evidence'] = [{'id':str(e.id),'title':e.title,'outcome':e.outcome} for e in experiments]
    brief['context'] = context
    brief['assessment_snapshot_ids'] = [str(s.id) for s in snapshots]
    real_human = any(not d.metadata.get('synthetic') and not d.expired for d in datasets) and context['research_relevance_confirmed']
    protected = brief['state'] in ['fix_measurement', 'test_segment_focus']
    measurement = all(all(s.quality.get(k) for k in ['definitions_verified','identity_verified','completeness_verified','sampling_verified']) and not s.quality.get('tracking_issue') and not s.quality.get('missing_events') for s in snapshots)
    if real_human and measurement and not protected:
        if context['human_signal'] == 'expectation_mismatch':
            brief.update(state='test_positioning',title='Test whether the product promise sets the right expectations.',summary='Relevant human research reports an expectation mismatch. Test a specific explanation or promise with the intended audience and inspect behavior after exposure.')
        elif context['human_signal'] == 'reliability_issue':
            brief.update(state='investigate_friction',title='Investigate reliability before reconsidering the product.',summary='Reviewed human evidence points to a reliability problem. Test a focused repair, verify the instrumentation, and review complete value-delivery windows.')
    pivot_gaps = []
    latest = snapshots[-1]
    config = latest.contract.config
    target, effect = config.get('viability_target'), config.get('minimum_detectable_change_pp')
    declared = config.get('review_windows', [])
    windows = []
    persistent = bool(target and effect and config.get('baseline_approved') and len(snapshots)>=2)
    for snapshot in snapshots:
        analysis = calculate(snapshot.rows,snapshot.analysis_cutoff)
        window = analysis['periods'].get('later')
        measured = analysis['metrics']['retention']['later']
        if not window or measured['interval'] is None or not target or not effect or measured['interval'][1] >= target-effect or analysis['excluded']:
            persistent = False
        if window:
            windows.append(window)
            if window not in declared or snapshot.contract.created_at > datetime.combine(date.fromisoformat(window['start']), time.min, tzinfo=timezone.utc):
                persistent = False
        if snapshot.contract.content_hash != latest.contract.content_hash:
            persistent = False
    windows.sort(key=lambda w:w['start'])
    if any(a['end'] >= b['start'] for a,b in zip(windows,windows[1:])):
        persistent = False
    failed = [e for e in experiments if e.status=='complete' and e.outcome and e.outcome.get('decision')=='stop']
    if not measurement:pivot_gaps.append('Usable, reconciled measurement in every review window')
    if not persistent:pivot_gaps.append('Multiple disjoint, predeclared mature windows with precise shortfalls against an approved target')
    if not real_human or context['human_signal']!='weak_value':pivot_gaps.append('Relevant real human evidence corroborating weak value realization')
    if len(failed)<2:pivot_gaps.append('At least two reviewed, unsuccessful narrower interventions')
    if len(context['alternative_hypothesis'])<10:pivot_gaps.append('A specific alternative problem, audience, or solution hypothesis')
    brief['pivot_eligibility'] = {'eligible':not pivot_gaps and not protected, 'missing':pivot_gaps}
    if not pivot_gaps and not protected:
        brief.update(state='evaluate_pivot',title='Evaluate a specific alternative hypothesis.',summary='The predeclared review windows show persistent weak value realization, corroborated by relevant human research and unsuccessful narrower interventions. Compare the proposed alternative in a bounded real-world test; this is not an instruction to pivot.')
    return brief
