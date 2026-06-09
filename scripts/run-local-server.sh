#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.app.yml"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

log() {
  printf '[focus-todo] %s\n' "$*"
}

fail() {
  printf '[focus-todo] ERROR: %s\n' "$*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Command '$1' is not installed."
}

start_docker_service() {
  if docker info >/dev/null 2>&1; then
    return
  fi

  log "Docker is not available yet; trying to start the Docker service."

  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl start docker || true
  else
    sudo service docker start || true
  fi

  sleep 2
  docker info >/dev/null 2>&1 || fail "Docker daemon is not reachable. Add your user to the docker group or run this script with Docker access."
}

detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    fail "Docker Compose is not installed. Install Docker Compose v2, then run this script again."
  fi
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-60}"

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  return 1
}

need_command docker
need_command curl
start_docker_service
detect_compose

cd "$ROOT_DIR"

log "Building backend Docker image and frontend image, then starting PostgreSQL, backend, and frontend."
FRONTEND_PORT="$FRONTEND_PORT" "${COMPOSE[@]}" -f "$COMPOSE_FILE" up -d --build

log "Waiting for frontend on http://localhost:${FRONTEND_PORT}."
if wait_for_http "http://localhost:${FRONTEND_PORT}" 90; then
  log "Ready: http://localhost:${FRONTEND_PORT}"
  log "For ngrok, run in another terminal: ngrok http ${FRONTEND_PORT}"
else
  "${COMPOSE[@]}" -f "$COMPOSE_FILE" ps
  fail "Frontend did not become ready. Check logs with: ${COMPOSE[*]} -f $COMPOSE_FILE logs -f"
fi
