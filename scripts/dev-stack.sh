#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime"
ADMIN_PORT="${ADMIN_PORT:-5183}"
API_PORT="${API_PORT:-3010}"
DATABASE_URL="${DATABASE_URL:-postgresql://xunjianbao:xunjianbao-local-dev@127.0.0.1:5432/xunjianbao?schema=public}"

mkdir -p "$RUNTIME_DIR"

screen_is_running() {
  local name="$1"
  local sessions
  sessions="$(screen -ls 2>&1 || true)"
  grep -Eq "[0-9]+\\.xunjianbao-${name}[[:space:]]" <<<"$sessions"
}

http_is_ready() {
  curl --silent --fail --max-time 2 "$1" >/dev/null 2>&1
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local log_file="$3"
  for _ in {1..40}; do
    if http_is_ready "$url"; then
      printf '%s\n' "$name 已就绪：$url"
      return 0
    fi
    sleep 0.25
  done
  printf '%s\n' "$name 启动失败，请查看：$log_file" >&2
  tail -n 30 "$log_file" >&2 || true
  return 1
}

start_screen() {
  local name="$1"
  local command="$2"
  local log_file="$RUNTIME_DIR/$name.log"
  local log_file_q

  if screen_is_running "$name"; then
    printf '%s\n' "$name 已在稳定后台运行"
    return 0
  fi

  printf -v log_file_q '%q' "$log_file"
  screen -dmS "xunjianbao-$name" /bin/zsh -lc "$command >> $log_file_q 2>&1"
  printf '%s\n' "$name 已在稳定后台启动"
}

start_stack() {
  local api_dir_q admin_dir_q worker_dir_q database_url_q
  cd "$ROOT_DIR"
  DATABASE_URL="$DATABASE_URL" corepack pnpm db:deploy
  printf -v api_dir_q '%q' "$ROOT_DIR/services/api"
  printf -v admin_dir_q '%q' "$ROOT_DIR/apps/admin-web"
  printf -v worker_dir_q '%q' "$ROOT_DIR/services/media-worker"
  printf -v database_url_q '%q' "$DATABASE_URL"

  if http_is_ready "http://127.0.0.1:$API_PORT/api/v1/health"; then
    printf '%s\n' "API 已就绪：http://127.0.0.1:$API_PORT/api/v1/health"
  else
    start_screen api "cd $api_dir_q && DATABASE_URL=$database_url_q API_PORT=$API_PORT exec ./node_modules/.bin/tsx src/main.ts"
    wait_for_http API "http://127.0.0.1:$API_PORT/api/v1/health" "$RUNTIME_DIR/api.log"
  fi

  if http_is_ready "http://127.0.0.1:$ADMIN_PORT/"; then
    printf '%s\n' "前端已就绪：http://127.0.0.1:$ADMIN_PORT/"
  else
    start_screen admin "cd $admin_dir_q && exec ./node_modules/.bin/vite --host 127.0.0.1 --port $ADMIN_PORT --strictPort"
    wait_for_http 前端 "http://127.0.0.1:$ADMIN_PORT/" "$RUNTIME_DIR/admin.log"
  fi

  if screen_is_running worker; then
    printf '%s\n' "媒体处理进程已在稳定后台运行"
  else
    start_screen worker "cd $worker_dir_q && DATABASE_URL=$database_url_q exec ./node_modules/.bin/tsx src/main.ts"
  fi

  printf '\n巡检宝地址：http://127.0.0.1:%s/\n' "$ADMIN_PORT"
}

stop_stack() {
  local name
  for name in admin worker api; do
    if screen_is_running "$name"; then
      screen -S "xunjianbao-$name" -X quit
      printf '%s\n' "$name 已停止"
    fi
  done
  stop_port_listener "$ADMIN_PORT" "前端"
  stop_port_listener "$API_PORT" "API"
  rm -f "$RUNTIME_DIR"/*.pid
}

stop_port_listener() {
  local port="$1"
  local label="$2"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    kill $pids 2>/dev/null || true
    printf '%s\n' "$label 残留端口进程已停止"
  fi
}

status_stack() {
  if http_is_ready "http://127.0.0.1:$ADMIN_PORT/"; then
    printf '%s\n' "前端：正常 http://127.0.0.1:$ADMIN_PORT/"
  else
    printf '%s\n' "前端：未运行"
  fi

  if http_is_ready "http://127.0.0.1:$API_PORT/api/v1/health"; then
    printf '%s\n' "API：正常 http://127.0.0.1:$API_PORT/api/v1/health"
  else
    printf '%s\n' "API：未运行"
  fi

  if screen_is_running worker; then
    printf '%s\n' "媒体处理：正常（稳定后台）"
  else
    printf '%s\n' "媒体处理：未运行"
  fi
}

case "${1:-start}" in
  start) start_stack ;;
  stop) stop_stack ;;
  status) status_stack ;;
  *) printf '用法：%s {start|stop|status}\n' "$0" >&2; exit 2 ;;
esac
