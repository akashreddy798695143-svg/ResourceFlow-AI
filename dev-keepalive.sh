#!/bin/bash
# Keep-alive wrapper: starts the Next.js dev server and pings it every 10s
# to prevent the sandbox idle-timeout from killing it.
cd /home/z/my-project

DEVLOG=/home/z/my-project/dev.log
KEEPALIVE_LOG=/home/z/my-project/keepalive.log

# Start dev server
nohup /home/z/my-project/node_modules/.bin/next dev -p 3000 --webpack < /dev/null > "$DEVLOG" 2>&1 &
disown
echo "[$(date '+%H:%M:%S')] dev server started" >> "$KEEPALIVE_LOG"

# Wait for ready
sleep 15

# Keep-alive loop: ping every 10s
while true; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/ 2>/dev/null)
  if [ "$HTTP" != "200" ]; then
    echo "[$(date '+%H:%M:%S')] dev server not responding (HTTP=$HTTP) — restarting..." >> "$KEEPALIVE_LOG"
    pkill -9 -f "node_modules/.bin/next" 2>/dev/null
    sleep 3
    nohup /home/z/my-project/node_modules/.bin/next dev -p 3000 --webpack < /dev/null > "$DEVLOG" 2>&1 &
    disown
    echo "[$(date '+%H:%M:%S')] dev server restarted" >> "$KEEPALIVE_LOG"
    sleep 20
  fi
  sleep 10
done
