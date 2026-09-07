"""Supported, bounded aggregate reads. Never call /query or follow redirects."""
import time
import random
from urllib.parse import urlparse
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
import httpx
from cryptography.fernet import Fernet, MultiFernet, InvalidToken
from django.conf import settings
from .analysis import digest
from .schemas import AggregateRow

HOSTS = {'us': 'https://us.posthog.com', 'eu': 'https://eu.posthog.com'}
COLUMNS = ['period', 'cohort_start', 'cohort_end', 'segment', 'signups', 'activated', 'retained', 'retained_activated']


class ConnectorError(Exception):
    pass


def cipher():
    if not settings.CREDENTIAL_KEYS:
        raise ConnectorError('Set CREDENTIAL_KEYS on the server before connecting a provider.')
    try:
        return MultiFernet([Fernet(key.strip().encode()) for key in settings.CREDENTIAL_KEYS.split(',')])
    except (ValueError, TypeError):
        raise ConnectorError('The server credential encryption configuration is invalid.')


def encrypt(key):
    return cipher().encrypt(key.encode()).decode()


def decrypt(encrypted):
    try:
        return cipher().decrypt(encrypted.encode()).decode()
    except InvalidToken:
        raise ConnectorError('The credential cannot be decrypted. Restore its deployment key or reconnect.')


def request(region, project_id, key, route='', method='GET', payload=None):
    if region not in HOSTS or not isinstance(project_id, int) or project_id < 1:
        raise ConnectorError('Choose a valid US/EU cloud region and project ID.')
    if route.startswith('/') or '..' in route or '://' in route:
        raise ConnectorError('Invalid provider resource path.')
    url = f'{HOSTS[region]}/api/projects/{project_id}/{route}'
    with httpx.Client(timeout=20, follow_redirects=False, trust_env=False) as client:
        for attempt in range(3):
            try:
                with client.stream(method, url, headers={'Authorization': 'Bearer '+key}, json=payload) as response:
                    if response.status_code == 429:
                        wait = 2**attempt + random.uniform(0, .5)
                        header = response.headers.get('Retry-After')
                        if header:
                            try:
                                wait = max(0, float(header))
                            except ValueError:
                                try:
                                    wait = max(0, (parsedate_to_datetime(header)-datetime.now(timezone.utc)).total_seconds())
                                except (ValueError, TypeError):
                                    pass
                        if attempt == 2 or wait > 20:
                            raise ConnectorError('PostHog is rate limiting requests. Retry after the provider cooldown.')
                        time.sleep(wait)
                        continue
                    if response.status_code in [401, 403]:
                        raise ConnectorError('PostHog denied access. Check the region, project, and read scopes, then reconnect.')
                    if response.status_code != 200:
                        raise ConnectorError(f'PostHog returned HTTP {response.status_code}. The last successful snapshot is preserved.')
                    content = bytearray()
                    for chunk in response.iter_bytes():
                        content.extend(chunk)
                        if len(content) > 4*1024*1024:
                            raise ConnectorError('PostHog exceeded the 4 MB response budget. Reduce the aggregate scope.')
                    import json
                    result = json.loads(content)
                    if not isinstance(result, dict):
                        raise ConnectorError('Unexpected PostHog response schema. Reconcile the endpoint.')
                    return result
            except (httpx.HTTPError, ValueError):
                raise ConnectorError('PostHog could not be read. Verify access and retry; the prior snapshot is unchanged.')
    raise ConnectorError('The PostHog request budget was exhausted.')


def verify(region, project_id, key, endpoint, version):
    if not key.startswith('phx_'):
        raise ConnectorError('Use a scoped personal API key beginning phx_. Event-capture tokens are not analytics credentials.')
    project = request(region, project_id, key)
    if project.get('id') != project_id:
        raise ConnectorError('The provider returned a different project identity. No credential was saved.')
    result = request(region, project_id, key, f'endpoints/{endpoint}/?version={version}')
    if result.get('name') != endpoint or result.get('is_active') is not True:
        raise ConnectorError('The selected endpoint is unavailable or inactive.')
    if not isinstance(result.get('query'), dict) or not result['query']:
        raise ConnectorError('The endpoint did not expose a query definition to fingerprint. Use a reviewed CSV until the definition can be reconciled.')
    return {'name': endpoint, 'version': version, 'query_hash': digest(result.get('query')), 'project_name': str(project.get('name',''))[:160]}


def catalog(connection):
    key = decrypt(connection.credential)
    result = {}
    for kind in ['event_definitions', 'property_definitions']:
        page = request(connection.region, connection.external_project_id, key, f'{kind}/?limit=100')
        result[kind] = [{'name': row['name'], 'type': row.get('property_type', '')} for row in page.get('results', [])[:100] if isinstance(row, dict) and isinstance(row.get('name'), str)]
        result[kind+'_has_more'] = bool(page.get('next'))
    return result


def fetch_aggregates(connection, payload):
    endpoint = connection.endpoints
    key = decrypt(connection.credential)
    current = request(connection.region, connection.external_project_id, key, f'endpoints/{endpoint["name"]}/?version={endpoint["version"]}')
    if current.get('is_active') is not True or digest(current.get('query')) != endpoint['query_hash']:
        raise ConnectorError('The pinned endpoint definition changed. Reconcile and reconnect before refreshing.')
    result = request(connection.region, connection.external_project_id, key, f'endpoints/{endpoint["name"]}/run/', 'POST', {'version': endpoint['version'], 'variables': {'date_from': payload['date_from'], 'date_to': payload['date_to']}, 'limit': 2000, 'refresh': 'force'})
    return parse_result(result, endpoint['version'])


def parse_result(result, version):
    if result.get('hasMore') is not False:
        raise ConnectorError('Truncated or unverified result completeness. Reduce the scope and reconcile the source.')
    if result.get('endpoint_version') != version:
        raise ConnectorError('The result used a different endpoint version.')
    columns, rows = result.get('columns'), result.get('results')
    if columns != COLUMNS or not isinstance(rows, list) or not 1 <= len(rows) <= 2000:
        raise ConnectorError('The endpoint schema changed or returned no rows. Reconcile against the connector contract.')
    parsed = []
    for row in rows:
        if not isinstance(row, list) or len(row) != len(COLUMNS):
            raise ConnectorError('Malformed aggregate row. No snapshot was saved.')
        try:
            parsed.append(AggregateRow(**dict(zip(COLUMNS, row))).model_dump(mode='json'))
        except ValueError:
            raise ConnectorError('Invalid aggregate counts or cohort dates. No snapshot was saved.')
    return parsed
