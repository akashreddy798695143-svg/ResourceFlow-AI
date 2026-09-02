// Node.js watchdog: restarts the Next.js dev server if it dies.
// Uses child_process.spawn with detached:true so the dev server is fully
// isolated from this watchdog. This watchdog is kept tiny (no imports
// beyond node builtins) so it survives OOM events.
const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const PROJECT = '/home/z/my-project'
const DEVLOG = path.join(PROJECT, 'dev.log')
const WATCHLOG = path.join(PROJECT, 'watchdog.log')
const NEXT_BIN = path.join(PROJECT, 'node_modules/.bin/next')

function log(msg) {
  const line = `[${new Date().toLocaleTimeString('en-GB')}] ${msg}\n`
  fs.appendFileSync(WATCHLOG, line)
  process.stdout.write(line)
}

function isAlive() {
  try {
    const r = spawnSync('curl', ['-s', '-o', '/dev/null', '-m', '5', 'http://localhost:3000/'], { stdio: 'pipe' })
    return r.status === 0
  } catch {
    return false
  }
}

function killStale() {
  try {
    spawnSync('pkill', ['-9', '-f', 'node_modules/.bin/next'], { stdio: 'pipe' })
  } catch {}
}

function startDev() {
  const out = fs.openSync(DEVLOG, 'w')
  const err = fs.openSync(DEVLOG, 'a')
  const child = spawn(NEXT_BIN, ['dev', '-p', '3000', '--webpack'], {
    cwd: PROJECT,
    stdio: ['ignore', out, err],
    detached: true,  // fully detach — child survives even if this watchdog dies
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1536' },
  })
  child.unref()  // allow this process to exit independently of the child
  return child.pid
}

// Main loop
log('watchdog started')
while (true) {
  if (!isAlive()) {
    log('dev server down — restarting...')
    killStale()
    const pid = startDev()
    log(`dev server restarted (pid ${pid})`)
    // wait for ready (initial compile takes ~15-25s)
    const start = Date.now()
    while (Date.now() - start < 30000) {
      if (isAlive()) { log('dev server is ready'); break }
      sleep(2000)
    }
  }
  sleep(10000)
}

function sleep(ms) {
  spawnSync('sleep', [ms / 1000], { stdio: 'ignore' })
}
