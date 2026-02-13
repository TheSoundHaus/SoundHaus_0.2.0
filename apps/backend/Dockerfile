FROM python:3.11-slim

# Metadata labels
LABEL org.opencontainers.image.title="SoundHaus Backend"
LABEL org.opencontainers.image.description="FastAPI backend for SoundHaus"
LABEL org.opencontainers.image.version="0.2.0"

WORKDIR /app

# Install system dependencies
# Note: openssh-client for SSH operations, git for repo operations, curl for healthcheck
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        openssh-client \
        git \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy requirements FIRST for better layer caching
# This layer only rebuilds when requirements.txt changes
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/requirements.txt

# Copy application code AFTER dependencies
COPY . /app

# Create non-root user for security
# In production, NEVER run containers as root
RUN useradd -m -u 1000 -s /bin/bash appuser && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check for container orchestration
# Checks /health endpoint every 30 seconds
# Container marked unhealthy after 3 consecutive failures
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Environment defaults (can be overridden)
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ENVIRONMENT=production

# Default command
# Use 0.0.0.0 to accept connections from outside the container
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
