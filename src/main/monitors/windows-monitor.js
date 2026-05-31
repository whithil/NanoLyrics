const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

class WindowsMonitor extends EventEmitter {
    constructor() {
        super();
        this.smtcWorker = null;
    }

    init() {
        try {
            const workerPath = path.join(__dirname, '../smtc-worker.js');
            if (!fs.existsSync(workerPath)) {
                console.error('[WindowsMonitor] smtc-worker.js not found at', workerPath);
                return false;
            }

            console.log('[WindowsMonitor] Initializing SMTC Background Worker...');
            this.smtcWorker = new Worker(workerPath);

            this.smtcWorker.on('message', (message) => {
                if (message && message.type === 'media-change') {
                    this.emit('update', message.data);
                }
            });

            this.smtcWorker.on('error', (err) => console.error('[WindowsMonitor] SMTC Worker error:', err));
            this.smtcWorker.on('exit', (code) => console.warn(`[WindowsMonitor] SMTC Worker exited with code ${code}`));

            return true;
        } catch (err) {
            console.error('[WindowsMonitor] Failed to init SMTC Worker:', err);
            return false;
        }
    }

    stop() {
        if (this.smtcWorker) this.smtcWorker.terminate();
    }
}

module.exports = WindowsMonitor;
