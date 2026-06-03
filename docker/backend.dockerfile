# Use Python 3.9 slim as base image
FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Copy requirements first (optimization for caching)
COPY backend/requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/app.py .

# Expose port 4434
EXPOSE 4434

# Run as an unprivileged user. Default UID 1000 matches the host-mounted
# backend/data volume; override with --build-arg APP_UID if your host differs.
ARG APP_UID=1000
RUN useradd --create-home --uid "$APP_UID" app && chown -R app:app /app
USER app

# Command to run Flask
CMD ["python", "app.py"]