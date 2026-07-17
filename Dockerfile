FROM ghcr.io/astral-sh/uv:python3.11-alpine

WORKDIR /app

# Leverage layered Docker cache compilation optimization 
COPY pyproject.toml .

# Sync dependencies straight into the base global environment
RUN uv pip install --system -r pyproject.toml

# Copy all python files into the container
COPY . .

# Expose the production networking port
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]