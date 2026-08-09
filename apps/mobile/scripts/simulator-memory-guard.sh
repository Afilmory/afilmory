#!/usr/bin/env bash

set -euo pipefail

limit_gib=30
limit_mib=""
sample_interval=0.5
log_path="${TMPDIR:-/tmp}/afilmory-simulator-memory-guard.log"
watch_pid=""
max_samples=0

usage() {
  printf '%s\n' \
    'Usage: simulator-memory-guard.sh [options]' \
    '' \
    'Options:' \
    '  --limit-gib N       Terminate at N GiB physical footprint (default: 30).' \
    '  --limit-mib N       MiB override intended for focused guard testing.' \
    '  --interval SECONDS  Sampling interval (default: 0.5).' \
    '  --log PATH          Sampling log path.' \
    '  --pid PID           Watch one explicit PID instead of Simulator Afilmory apps.' \
    '  --max-samples N     Exit successfully after N samples; 0 means unlimited.' \
    '  --help              Show this help.'
}

require_positive_integer() {
  local label="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[1-9][0-9]*$ ]]; then
    printf 'Invalid %s: %s\n' "$label" "$value" >&2
    exit 64
  fi
}

while (($# > 0)); do
  case "$1" in
    --limit-gib)
      limit_gib="${2:-}"
      shift 2
      ;;
    --limit-mib)
      limit_mib="${2:-}"
      shift 2
      ;;
    --interval)
      sample_interval="${2:-}"
      shift 2
      ;;
    --log)
      log_path="${2:-}"
      shift 2
      ;;
    --pid)
      watch_pid="${2:-}"
      shift 2
      ;;
    --max-samples)
      max_samples="${2:-}"
      shift 2
      ;;
    --)
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

require_positive_integer '--limit-gib' "$limit_gib"
if [[ -n "$limit_mib" ]]; then
  require_positive_integer '--limit-mib' "$limit_mib"
fi
if [[ ! "$sample_interval" =~ ^([0-9]+([.][0-9]+)?|[.][0-9]+)$ ]] \
  || ! /usr/bin/awk -v value="$sample_interval" 'BEGIN { exit !(value > 0) }'; then
  printf 'Invalid --interval: %s\n' "$sample_interval" >&2
  exit 64
fi
if [[ -n "$watch_pid" ]]; then
  require_positive_integer '--pid' "$watch_pid"
fi
if [[ ! "$max_samples" =~ ^[0-9]+$ ]]; then
  printf 'Invalid --max-samples: %s\n' "$max_samples" >&2
  exit 64
fi

if [[ -n "$limit_mib" ]]; then
  limit_bytes=$((limit_mib * 1024 * 1024))
  limit_label="${limit_mib} MiB"
else
  limit_bytes=$((limit_gib * 1024 * 1024 * 1024))
  limit_label="${limit_gib} GiB"
fi

log_directory="$(/usr/bin/dirname "$log_path")"
/bin/mkdir -p "$log_directory"
/usr/bin/touch "$log_path"

timestamp() {
  /bin/date -u '+%Y-%m-%dT%H:%M:%SZ'
}

log_line() {
  printf '%s %s\n' "$(timestamp)" "$*" | /usr/bin/tee -a "$log_path"
}

find_target_pids() {
  if [[ -n "$watch_pid" ]]; then
    printf '%s\n' "$watch_pid"
    return
  fi

  /usr/bin/pgrep -f \
    'CoreSimulator/Devices/.*/data/Containers/Bundle/Application/.*/Afilmory[^/]*[.]app/Afilmory[^/]*$' \
    || true
}

physical_footprint_bytes() {
  local pid="$1"
  /usr/bin/footprint -p "$pid" --noCategories -f bytes 2>/dev/null \
    | /usr/bin/awk '$1 == "phys_footprint:" { print $2; exit }'
}

terminate_process() {
  local pid="$1"
  /bin/kill -TERM "$pid" 2>/dev/null || return

  for _ in {1..10}; do
    if ! /bin/kill -0 "$pid" 2>/dev/null; then
      return
    fi
    /bin/sleep 0.2
  done

  /bin/kill -KILL "$pid" 2>/dev/null || true
}

log_line "state=armed limit_bytes=${limit_bytes} limit='${limit_label}' interval_seconds=${sample_interval} log='${log_path}'"

sample_count=0
while true; do
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    /bin/kill -0 "$pid" 2>/dev/null || continue

    footprint_bytes="$(physical_footprint_bytes "$pid" || true)"
    [[ "$footprint_bytes" =~ ^[0-9]+$ ]] || continue

    rss_kib="$(/bin/ps -p "$pid" -o rss= 2>/dev/null | /usr/bin/awk '{ print $1; exit }' || true)"
    rss_kib="${rss_kib:-0}"
    footprint_gib="$(/usr/bin/awk -v bytes="$footprint_bytes" 'BEGIN { printf "%.3f", bytes / 1073741824 }')"
    log_line "state=sample pid=${pid} footprint_bytes=${footprint_bytes} footprint_gib=${footprint_gib} rss_kib=${rss_kib}"

    sample_count=$((sample_count + 1))
    if ((footprint_bytes >= limit_bytes)); then
      log_line "state=triggered pid=${pid} footprint_bytes=${footprint_bytes} limit_bytes=${limit_bytes} action=terminate"
      terminate_process "$pid"
      log_line "state=failed pid=${pid} reason=memory_limit_exceeded"
      exit 70
    fi

    if ((max_samples > 0 && sample_count >= max_samples)); then
      log_line "state=completed samples=${sample_count}"
      exit 0
    fi
  done < <(find_target_pids)

  /bin/sleep "$sample_interval"
done
