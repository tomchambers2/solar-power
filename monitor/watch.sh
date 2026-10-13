#!/bin/bash
# The SigenStor is identified: MAC F8:5B:1B:0E:45:D4, confirmed against the
# Sigen app's own WLAN page. So this no longer sweeps the LAN looking for it -
# it just tracks that one MAC and waits for Modbus TCP (502) to open.
#
# Local Modbus TCP is off by default and needs the installer's login:
#   Sigen app > System > Devices > SigenStor > Operation > Parameter Settings
#   > Modbus Settings > Local Modbus TCP > enable > SAVE
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
MAC="F8:5B:1B:0E:45:D4"
IP_FILE="$DIR/inverter-ip.txt"
LOG="$DIR/events.log"
NTFY="${NTFY_URL:-https://ntfy.sh/tomchambers-phone-hgzsxwk9kah}"
ip=$(cat "$IP_FILE" 2>/dev/null || echo "192.168.68.76")
touch "$LOG"

push() { curl -s -m 15 -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "$NTFY" >/dev/null 2>&1; }
say()  { echo "$*"; echo "$(date '+%F %T') $*" >> "$LOG"; }

# Where is $MAC right now? Cheap check on the last-known IP; only sweep if it moved.
locate() {
  ping -c 1 -W 800 "$ip" >/dev/null 2>&1
  if arp -an 2>/dev/null | grep -qi "($ip)"' at '"$(echo "$MAC" | tr 'A-Z' 'a-z' | sed 's/0\([0-9a-f]\):/\1:/g')"; then return 0; fi
  # fall back to a full sweep and re-derive the IP from the MAC
  local found
  found=$("$DIR/sweep.sh" 192.168.68.0/24 2>/dev/null | awk -F'\t' -v m="$MAC" '$2==m{print $1}' | head -1)
  if [ -n "$found" ] && [ "$found" != "$ip" ]; then
    say "INVERTER-IP-CHANGED $ip -> $found"
    ip="$found"; echo "$ip" > "$IP_FILE"
  fi
  [ -n "$found" ]
}

announced=0
missing=0
while true; do
  if locate; then
    missing=0
    if nc -z -G 3 -w 3 "$ip" 502 >/dev/null 2>&1; then
      if [ "$announced" -eq 0 ]; then
        announced=1
        say "MODBUS-502-OPEN $ip $MAC"
        push "Solar: Modbus TCP is open" "high" "sun_with_face,white_check_mark" \
             "SigenStor at $ip is accepting Modbus. Connecting Home Assistant now."
      fi
    else
      announced=0
    fi
  else
    missing=$((missing+1))
    [ "$missing" -eq 20 ] && say "INVERTER-UNREACHABLE $MAC not seen for ~10 min"
  fi
  sleep 30
done
