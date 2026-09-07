FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN useradd --create-home app && mkdir -p /app/private && chown app:app /app/private
COPY --chown=app:app backend/ backend/
COPY --chown=app:app demo/ demo/
COPY --from=frontend --chown=app:app /build/frontend/dist/ frontend/dist/
RUN python backend/manage.py collectstatic --noinput
USER app
EXPOSE 8000
CMD ["gunicorn", "--chdir", "backend", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "60", "--access-logfile", "-"]
