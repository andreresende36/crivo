# =============================================================================
# Crivo — Dockerfile (uv workspace)
# Python 3.11 + Playwright (Chromium headless)
# Build: docker build -t crivo .
# =============================================================================

FROM python:3.11-slim-bookworm

LABEL maintainer="Crivo <[EMAIL_ADDRESS]>"
LABEL description="Sistema automatizado de busca de ofertas — Crivo"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers \
    TZ=America/Sao_Paulo \
    UV_SYSTEM_PYTHON=1 \
    PATH="/app/.venv/bin:$PATH"

# Dependências de sistema para Playwright/Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget curl gnupg ca-certificates tzdata \
    fonts-liberation fonts-noto-color-emoji \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libdbus-1-3 libexpat1 libxcb1 libxkbcommon0 libx11-6 libxcomposite1 \
    libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Instala uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copia workspace manifests para aproveitar cache de layers
COPY pyproject.toml uv.lock* ./
COPY packages/py-types/pyproject.toml ./packages/py-types/
COPY packages/backend/pyproject.toml ./packages/backend/

# Instala dependências (sem código fonte — layer cacheável)
RUN uv sync --frozen --no-install-workspace && \
    uv run playwright install chromium

# Copia código fonte
COPY packages/py-types/ ./packages/py-types/
COPY packages/backend/ ./packages/backend/
COPY prompts/ ./prompts/
COPY data/ml_categories.json ./

# Instala os pacotes do workspace em modo editável
RUN uv sync --frozen

# Cria diretórios e usuário não-root
RUN mkdir -p /app/data /app/logs && \
    useradd --create-home --shell /bin/bash crivo && \
    chown -R crivo:crivo /app
USER crivo

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "from crivo.config import settings; print('ok')" || exit 1

CMD ["crivo-api"]
