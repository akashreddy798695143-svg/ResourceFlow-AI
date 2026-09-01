#!/bin/bash
# Self-healing dev server launcher. Runs in its own session (setsid).
# The dev server is started in its OWN session too, so killing the dev server
# does not kill this watchdog, and vice versa.
cd /home/z/my-project

LOG=/home/z/my-project/watchdog.log
DEVLOG=/home/z/my-project/dev.log

while true; do
  if ! curl -s -o /dev/null --max-time 5 http://localhost:3000/ 2>/dev/null; then
    echo "[$(date '+%H:%M:%S')] dev server down — restarting..." >> "$LOG"
    # Kill only the dev server processes, not this watchdog
    pkill -9 -f "node_modules/.bin/next" 2>/dev/null
    sleep 3
    # Start dev server in its OWN session so it's independent of this watchdog
    setsid /home/z/my-project/node_modules/.bin/next dev -p 3000 --webpack < /dev/null > "$DEVLOG" 2>&1 &
    disown
    echo "[$(date '+%H:%M:%S')] dev server restarted" >> "$LOG"
    sleep 25
  fi
  sleep 10
done
