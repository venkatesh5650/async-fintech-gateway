FROM ghcr.io/astral-sh/uv:python3.11-alpine

WORKDIR /app

# Copy dependencies file
COPY pyproject.toml .

# Install dependencies
RUN uv pip install --system -r pyproject.toml

# Copy application source code
COPY . .

# Expose application port
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]