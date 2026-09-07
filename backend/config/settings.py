import os
from pathlib import Path
from urllib.parse import urlparse, unquote

BASE_DIR = Path(__file__).resolve().parents[2]
DEBUG = os.getenv('DEBUG', '1') == '1'
SECRET_KEY = os.getenv('SECRET_KEY', 'development-only-conceptbench-key-not-for-deployment')
if not DEBUG and SECRET_KEY.startswith('development-only'):
    raise RuntimeError('Set a unique SECRET_KEY before deploying.')
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1,testserver').split(',')
CSRF_TRUSTED_ORIGINS = os.getenv('CSRF_TRUSTED_ORIGINS', 'http://127.0.0.1:5173,http://localhost:5173').split(',')
INSTALLED_APPS = ['django.contrib.auth', 'django.contrib.contenttypes', 'django.contrib.sessions', 'django.contrib.staticfiles', 'core']
MIDDLEWARE = ['django.middleware.security.SecurityMiddleware', 'whitenoise.middleware.WhiteNoiseMiddleware', 'django.contrib.sessions.middleware.SessionMiddleware', 'django.middleware.common.CommonMiddleware', 'django.middleware.csrf.CsrfViewMiddleware', 'django.contrib.auth.middleware.AuthenticationMiddleware', 'core.middleware.RequestContext']
ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': BASE_DIR / 'private' / 'conceptbench.sqlite3', 'OPTIONS': {'timeout': 20}}}
if os.getenv('DATABASE_URL'):
    db = urlparse(os.environ['DATABASE_URL'])
    DATABASES = {'default': {'ENGINE': 'django.db.backends.postgresql', 'NAME': db.path.lstrip('/'), 'USER': unquote(db.username or ''), 'PASSWORD': unquote(db.password or ''), 'HOST': db.hostname, 'PORT': db.port or 5432, 'CONN_MAX_AGE': 60}}
else:
    (BASE_DIR / 'private').mkdir(mode=0o700, exist_ok=True)
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
USE_TZ = True
TIME_ZONE = 'UTC'
STATIC_URL = '/assets/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [BASE_DIR / 'frontend/dist/assets'] if (BASE_DIR / 'frontend/dist/assets').exists() else []
STORAGES = {'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'}, 'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage'}}
DATA_UPLOAD_MAX_MEMORY_SIZE = 6 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'same-origin'
SECURE_SSL_REDIRECT = os.getenv('SECURE_SSL_REDIRECT', '0' if DEBUG else '1') == '1'
SECURE_HSTS_SECONDS = 0 if DEBUG else 31536000
X_FRAME_OPTIONS = 'DENY'
ALLOW_DEMO = os.getenv('ALLOW_DEMO', '1' if DEBUG else '0') == '1'
ALLOW_REGISTRATION = os.getenv('ALLOW_REGISTRATION', '1' if DEBUG else '0') == '1'
CREDENTIAL_KEYS = os.getenv('CREDENTIAL_KEYS', '')
MODEL_API_KEY = os.getenv('MODEL_API_KEY', '')
MODEL_NAME = os.getenv('MODEL_NAME', '')
EMBEDDING_MODEL = os.getenv('EMBEDDING_MODEL', 'text-embedding-3-small')
MODEL_INPUT_USD_PER_MILLION = os.getenv('MODEL_INPUT_USD_PER_MILLION', '')
MODEL_OUTPUT_USD_PER_MILLION = os.getenv('MODEL_OUTPUT_USD_PER_MILLION', '')
EMBEDDING_USD_PER_MILLION = os.getenv('EMBEDDING_USD_PER_MILLION', '')
AUTH_PASSWORD_VALIDATORS = [{'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'}, {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'}, {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'}, {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'}]
