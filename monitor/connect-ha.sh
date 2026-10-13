#!/bin/bash
# Complete the Sigenergy (sigen) config flow in Home Assistant for a given host.
# Usage: ./connect-ha.sh <inverter-ip> [read_only true|false]
set -euo pipefail
HOST="${1:?usage: connect-ha.sh <inverter-ip> [read_only]}"
RO="${2:-true}"
cd "$(dirname "$0")/../../home-assistant"
set -a; . ./.env; set +a

step() { curl -s -m 30 -X POST -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" -d "$2" "$1"; }

echo "== reachability =="
nc -z -G 5 "$HOST" 502 && echo "  $HOST:502 open" || { echo "  $HOST:502 CLOSED - Modbus TCP not enabled yet"; exit 1; }

echo "== start flow =="
r=$(step "$HA_URL/api/config/config_entries/flow" "{\"handler\":\"sigen\",\"show_advanced_options\":true}")
fid=$(echo "$r" | python3 -c "import json,sys;print(json.load(sys.stdin)['flow_id'])")
echo "  flow_id=$fid"

echo "== submit plant_config =="
r=$(step "$HA_URL/api/config/config_entries/flow/$fid" \
  "{\"host\":\"$HOST\",\"port\":502,\"inverter_slave_ids\":1,\"read_only\":$RO,\"scan_interval\":5}")
echo "$r" | python3 -m json.tool
