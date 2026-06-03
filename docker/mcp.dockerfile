# MCP server needs Python 3.10+ (the backend image is 3.9); pin 3.12
FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (optimization for caching)
COPY mcp_server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the MCP server
COPY mcp_server/server.py .

# Streamable-HTTP endpoint (override the port with RESHIMIT_MCP_PORT)
EXPOSE 8000

# Bind all interfaces inside the container so the service is reachable;
# unbuffered output so the boot banner + token show up in `docker compose logs`
ENV RESHIMIT_MCP_HOST=0.0.0.0 \
    PYTHONUNBUFFERED=1

# Run as an unprivileged user (the server writes nothing to disk)
RUN useradd --create-home --uid 10001 app && chown -R app:app /app
USER app

# Command to run the MCP server
CMD ["python", "server.py"]
