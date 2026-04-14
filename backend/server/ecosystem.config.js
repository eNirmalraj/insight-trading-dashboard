/**
 * PM2 ecosystem configuration for the Insight Signal Engine worker.
 *
 * Cross-platform approach: PM2 invokes `node` directly with ts-node registered
 * as a require hook. This avoids the Windows EINVAL issue where PM2 can't
 * spawn npm.cmd or ts-node.cmd.
 *
 * Usage:
 *   cd backend/server
 *   pm2 start ecosystem.config.js        # start
 *   pm2 logs signal-engine               # tail logs
 *   pm2 logs signal-engine --lines 100   # view last 100 log lines
 *   pm2 restart signal-engine            # restart (picks up code changes)
 *   pm2 stop signal-engine               # stop
 *   pm2 delete signal-engine             # remove from PM2
 *   pm2 save                             # persist process list across reboots
 *
 * After `pm2 save` + `pm2 startup`, the worker stays alive across terminal
 * closes, crashes, and (with PM2's startup script) server reboots.
 */
module.exports = {
    apps: [
        {
            name: 'signal-engine',
            script: 'src/worker.ts',
            cwd: __dirname,
            // Run via Node with ts-node registered in-process (no .cmd spawning)
            interpreter: 'node',
            interpreter_args: '-r ts-node/register/transpile-only',
            // Restart strategy
            autorestart: true,
            max_restarts: 20,          // give up if it crashes 20 times in a row
            min_uptime: '30s',         // consider stable after 30s uptime
            restart_delay: 5000,       // wait 5s between restart attempts
            max_memory_restart: '1G',  // restart if worker exceeds 1GB
            // Environment
            env: {
                NODE_ENV: 'production',
                TS_NODE_TRANSPILE_ONLY: 'true',
            },
            // Log rotation
            out_file: './logs/signal-engine.out.log',
            error_file: './logs/signal-engine.err.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            watch: false,
        },
    ],
};
