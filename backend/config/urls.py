from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.urls import path, re_path
from core.api import api


def index(request):
    file = settings.BASE_DIR / 'frontend/dist/index.html'
    if not file.exists():
        return HttpResponse('ConceptBench API is running. Start the Vite client on port 5173, or run npm run build in frontend.', content_type='text/plain')
    return HttpResponse(file.read_text(), content_type='text/html')


def health(request):
    return JsonResponse({'status': 'ok', 'app': 'conceptbench'})

urlpatterns = [path('healthz', health), path('api/v1/', api.urls), re_path(r'^(?!api/|assets/).*$', index)]
