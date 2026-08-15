const EventEmitter = require('events');

class MediaMonitor extends EventEmitter {
    constructor() {
        super();
        this.monitor = null;
        this.lastTrackTitle = '';
        this.lastTrackArtist = '';
        this.lastTrackDuration = 0;
        this.simulatedTime = 0;
        this.lastSimulationTick = Date.now();
        this.lastOSPosition = -1;
        this.isPlayingTrack = false;
        this.terminalInterval = null;
    }

    init() {
        const platform = process.platform;
        if (platform === 'win32') {
            const WindowsMonitor = require('./monitors/windows-monitor');
            this.monitor = new WindowsMonitor();
        } else if (platform === 'linux') {
            const LinuxMonitor = require('./monitors/linux-monitor');
            this.monitor = new LinuxMonitor();
        } else if (platform === 'darwin') {
            const MacOSMonitor = require('./monitors/macos-monitor');
            this.monitor = new MacOSMonitor();
        }

        if (this.monitor) {
            this.monitor.on('update', (data) => this.handleMediaUpdate(data));
            if (this.monitor.init()) {
                this.startTerminalRefresher();
                return true;
            }
        }
        
        console.error(`[MediaMonitor] No monitor available for platform: ${platform}`);
        return false;
    }

    handleMediaUpdate(data) {
        const { title: rawTitle, artist: rawArtist, position, duration, status } = data;
        
        let title = rawTitle || '';
        let artist = rawArtist || '';
        const isPlaying = (status === 'Playing' || status === 'playing');
        const now = Date.now();

        // If artist is 'YouTube Music' or 'YouTube', treat as empty so we can extract real artist
        if (artist.toLowerCase() === 'youtube music' || artist.toLowerCase() === 'youtube') {
            artist = '';
        }

        // Clean YouTube Music prefix/suffix before splitting 'Artist - Title'
        title = title
            .replace(/^\s*YouTube Music\s*[-–—|]\s*/gi, '')
            .replace(/\s*[-–—|]\s*YouTube Music\s*$/gi, '')
            .replace(/\s*\|\s*YouTube Music/gi, '')
            .trim();

        // Fallback: extract artist from "Artist - Title"
        if (!artist && title.includes(' - ')) {
            const parts = title.split(' - ');
            artist = parts[0].trim();
            title = parts.slice(1).join(' - ').trim();
        }

        const isNewTrack = (title !== this.lastTrackTitle || artist !== this.lastTrackArtist);

        if (isNewTrack) {
            this.lastTrackTitle = title;
            this.lastTrackArtist = artist;
            this.lastTrackDuration = duration || 0;
            this.simulatedTime = position || 0;
            this.lastOSPosition = position;
            this.isPlayingTrack = isPlaying;
            this.lastSimulationTick = now;

            this.emit('track-change', {
                title,
                artist,
                duration: this.lastTrackDuration,
                position: this.simulatedTime,
                isPlaying,
                status
            });
        } else {
            if (duration && duration > 0) this.lastTrackDuration = duration;
            if (position !== this.lastOSPosition && position !== undefined && position !== null) {
                this.lastOSPosition = position;
                const timeDiff = Math.abs(this.simulatedTime - position);
                if (timeDiff > 1.5 || !isPlaying) {
                    this.simulatedTime = position;
                } else if (timeDiff > 0.1) {
                    this.simulatedTime = (this.simulatedTime + position) / 2;
                }
            }

            if (isPlaying) {
                this.simulatedTime += (now - this.lastSimulationTick) / 1000;
            }
            this.isPlayingTrack = isPlaying;
            this.lastSimulationTick = now;

            this.emit('position-update', {
                title,
                artist,
                duration: this.lastTrackDuration,
                position: this.simulatedTime,
                isPlaying,
                status
            });
        }
    }

    startTerminalRefresher() {
        if (this.terminalInterval) clearInterval(this.terminalInterval);
        this.terminalInterval = setInterval(() => {
            if (this.isPlayingTrack) {
                const now = Date.now();
                this.simulatedTime += (now - this.lastSimulationTick) / 1000;
                this.lastSimulationTick = now;
            } else {
                this.lastSimulationTick = Date.now();
            }
            this.drawTerminalStatus();
        }, 500);
    }

    drawTerminalStatus() {
        if (!this.lastTrackTitle) {
            process.stdout.write('\r\x1b[33m[IDLE]\x1b[0m Awaiting playback...\x1b[K');
            return;
        }
        const trackInfo = `${this.lastTrackArtist ? this.lastTrackArtist + ' - ' : ''}${this.lastTrackTitle}`;
        const timeline = `${this.formatTime(this.simulatedTime)} / ${this.formatTime(this.lastTrackDuration)}`;
        process.stdout.write(`\r\x1b[K${trackInfo} (${timeline})`);
    }

    formatTime(secs) {
        if (isNaN(secs) || secs < 0) return '--:--';
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    stop() {
        if (this.terminalInterval) clearInterval(this.terminalInterval);
        if (this.monitor) this.monitor.stop();
    }
}

module.exports = new MediaMonitor();
