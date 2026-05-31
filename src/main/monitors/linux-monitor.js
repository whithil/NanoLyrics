const { exec } = require('child_process');
const EventEmitter = require('events');

class LinuxMonitor extends EventEmitter {
    constructor() {
        super();
        this.interval = null;
    }

    init() {
        console.log('[LinuxMonitor] Initializing MPRIS Monitor (playerctl)...');
        // Poll every 2 seconds
        this.interval = setInterval(() => this.poll(), 2000);
        this.poll();
        return true;
    }

    poll() {
        // Get metadata via playerctl
        const cmd = 'playerctl metadata --format "{{title}}||{{artist}}||{{position}}||{{mpris:length}}||{{status}}"';
        exec(cmd, (err, stdout) => {
            if (err || !stdout.trim()) return;

            const parts = stdout.trim().split('||');
            if (parts.length < 5) return;

            const data = {
                title: parts[0],
                artist: parts[1],
                position: parseFloat(parts[2]) / 1000000, // playerctl uses microseconds
                duration: parseFloat(parts[3]) / 1000000,
                status: parts[4] // Playing, Paused, etc.
            };

            this.emit('update', data);
        });
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
    }
}

module.exports = LinuxMonitor;
