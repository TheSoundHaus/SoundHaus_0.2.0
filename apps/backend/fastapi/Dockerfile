FROM python:3.11-slim

# Set working directory to match the fastapi module location
WORKDIR /app/fastapi

# Copy requirements file
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the fastapi app code
COPY . .

# Command will be overridden by docker-compose
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
