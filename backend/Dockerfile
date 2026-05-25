FROM python:3.10-slim

WORKDIR /app

# Install system utilities (like curl) for container healthchecks
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Set PYTHONPATH so FastAPI can resolve "backend.*" modules correctly
ENV PYTHONPATH=/app

EXPOSE 9092

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "9092"]
