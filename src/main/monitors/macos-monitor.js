const { exec } = require('child_process');
const EventEmitter = require('events');

class MacOSMonitor extends EventEmitter {
    constructor() {
        super();
        this.interval = null;
    }

    init() {
        console.log('[MacOSMonitor] Initializing AppleScript Monitor...');
        this.interval = setInterval(() => this.poll(), 2000);
        this.poll();
        return true;
    }

    poll() {
        const script = `
            if application "Music" is running then
                tell application "Music"
                    if player state is playing then
                        set tTitle to name of current track
                        set tArtist to artist of current track
                        set tPos to player position
                        set tDur to duration of current track
                        return tTitle & "||" & tArtist & "||" & tPos & "||" & tDur & "||Playing"
                    end if
                end tell
            end if
            if application "Spotify" is running then
                tell application "Spotify"
                    if player state is playing then
                        set tTitle to name of current track
                        set tArtist to artist of current track
                        set tPos to player position
                        set tDur to (duration of current track) / 1000
                        return tTitle & "||" & tArtist & "||" & tPos & "||" & tDur & "||Playing"
                    end if
                end tell
            end if
            return "||||||||Paused"
        `;

        exec(`osascript -e '${script.replace(/\n/g, ' ')}'`, (err, stdout) => {
            if (err || !stdout.trim()) return;

            const parts = stdout.trim().split('||');
            if (parts.length < 5) return;

            const data = {
                title: parts[0],
                artist: parts[1],
                position: parseFloat(parts[2]),
                duration: parseFloat(parts[3]),
                status: parts[4]
            };

            this.emit('update', data);
        });
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
    }
}

module.exports = MacOSMonitor;
