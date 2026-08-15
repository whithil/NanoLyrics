const { spawn, exec } = require('child_process');
const EventEmitter = require('events');

class LinuxMonitor extends EventEmitter {
    constructor() {
        super();
        this.followProcess = null;
        this.pollInterval = null;
        this.lastEmittedData = null;
    }

    init() {
        console.log('[LinuxMonitor] Initializing MPRIS Monitor...');

        // Check if playerctl is available
        exec('which playerctl', (err) => {
            if (err) {
                console.error('[LinuxMonitor] playerctl not found. Install it via your package manager.');
                console.error('[LinuxMonitor] e.g., sudo apt install playerctl');
                return;
            }
            // Try event-driven mode first, fall back to polling
            this.startFollowMode();
        });

        return true;
    }

    startFollowMode() {
        const format = '{{title}}||{{artist}}||{{position}}||{{mpris:length}}||{{status}}';

        // playerctl --follow emits a line on every metadata/status change
        this.followProcess = spawn('playerctl', [
            'metadata', '--follow', '--format', format
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let buffer = '';
        this.followProcess.stdout.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line in buffer
            for (const line of lines) {
                if (line.trim()) this.parseLine(line.trim());
            }
        });

        this.followProcess.stderr.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg) console.warn('[LinuxMonitor]', msg);
        });

        this.followProcess.on('error', (err) => {
            console.warn('[LinuxMonitor] Follow mode failed, falling back to polling:', err.message);
            this.startPollingFallback();
        });

        this.followProcess.on('exit', (code) => {
            if (code !== null && code !== 0) {
                console.warn(`[LinuxMonitor] Follow process exited with code ${code}, falling back to polling`);
                this.startPollingFallback();
            }
        });

        // Also start a position poller (playerctl --follow doesn't emit
        // on position-only changes, only metadata/status changes)
        this.pollInterval = setInterval(() => this.pollPosition(), 1000);
    }

    startPollingFallback() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        console.log('[LinuxMonitor] Using polling fallback (1s interval)');
        this.pollInterval = setInterval(() => this.poll(), 1000);
        this.poll();
    }

    poll() {
        const cmd = 'playerctl metadata --format "{{title}}||{{artist}}||{{position}}||{{mpris:length}}||{{status}}"';
        exec(cmd, (err, stdout) => {
            if (err || !stdout.trim()) return;
            this.parseLine(stdout.trim());
        });
    }

    pollPosition() {
        // Lightweight position-only poll for smooth lyrics sync
        const cmd = 'playerctl metadata --format "{{title}}||{{artist}}||{{position}}||{{mpris:length}}||{{status}}"';
        exec(cmd, (err, stdout) => {
            if (err || !stdout.trim()) return;
            this.parseLine(stdout.trim());
        });
    }

    parseLine(line) {
        const parts = line.split('||');
        if (parts.length < 5) return;

        const data = {
            title: parts[0],
            artist: parts[1],
            position: parseFloat(parts[2]) / 1000000, // microseconds → seconds
            duration: parseFloat(parts[3]) / 1000000,
            status: parts[4]
        };

        // Avoid emitting duplicate unchanged data
        const key = `${data.title}|${data.artist}|${data.status}`;
        const posChanged = !this.lastEmittedData ||
            Math.abs(data.position - this.lastEmittedData.position) > 0.5 ||
            key !== `${this.lastEmittedData.title}|${this.lastEmittedData.artist}|${this.lastEmittedData.status}`;

        if (posChanged) {
            this.lastEmittedData = { ...data };
            this.emit('update', data);
        }
    }

    stop() {
        if (this.followProcess) {
            this.followProcess.kill();
            this.followProcess = null;
        }
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
}

module.exports = LinuxMonitor;
