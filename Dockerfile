# GreenChain API image.
#
# Python 3.12 because the codebase uses syntax newer than the 3.10 that ships
# with macOS; the test suite and CI run on the same version so an image cannot
# pass locally and fail on deploy for a language-version reason.
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first so application edits do not invalidate the install layer.
COPY requirements.txt ./
RUN python -m pip install --upgrade pip && python -m pip install -r requirements.txt

COPY alembic.ini ./
COPY backend ./backend

# Evidence is written here. Mount a volume over it in any real deployment:
# anything left inside the container is lost on the next deploy.
RUN mkdir -p /app/var/storage && \
    useradd --create-home --uid 10001 greenchain && \
    chown -R greenchain:greenchain /app/var
USER greenchain

EXPOSE 8000

# The readiness probe is the deployment smoke test; see docs in backend/app/api/health.py.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health/ready', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
