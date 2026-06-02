/**
 * NanoLyrics SMTC Background Monitor Worker (Windows Only)
 * Encapsulates Windows System Media Transport Controls monitoring.
 */

const { parentPort } = require('worker_threads');

try {
    const { SMTCMonitor } = require('@coooookies/windows-smtc-monitor');
    const monitor = new SMTCMonitor();

    /**
     * Maps Windows SMTC playback status codes to human-readable strings.
     * @param {number} status - SMTC status code
     * @returns {string} - Status string
     */
    const parsePlaybackStatus = (status) => {
        // Windows SMTC: 4 = Playing, 1 = Opened, 2 = Changing, 3 = Paused
        switch (status) {
            case 4: return 'Playing';
            case 1: return 'Opened'; // Media is loaded but not necessarily playing
            case 2: return 'Changing'; // Media is transitioning
            case 3: return 'Paused';
        }
        return 'Paused';
    };

    let activeAppId = '';
    let currentMetadata = { title: '', artist: '', position: 0, duration: 0, status: 'Paused' };

    monitor.on('session-media-changed', (appId, mediaProps) => {
        if (appId === activeAppId) {
            updateMetadata(appId, mediaProps);
        } else if (isAppPlaying(appId)) {
            // Switch focus to the new app if it's currently playing
            updateMetadata(appId, mediaProps);
        }
    });

    monitor.on('session-timeline-changed', (appId, timelineProps) => {
        if (appId === activeAppId) {
            currentMetadata.position = timelineProps.position || 0;
            currentMetadata.duration = timelineProps.duration || 0;
            sendUpdate();
        }
    });

    monitor.on('session-playback-changed', (appId, playbackInfo) => {
        const status = parsePlaybackStatus(playbackInfo.playbackStatus);
        
        // Priority: If any app starts playing, focus on it
        if (status === 'Playing' && appId !== activeAppId) {
            syncWithSession(appId);
        } else if (appId === activeAppId) {
            currentMetadata.status = status;
            sendUpdate();
        }
    });

    monitor.on('current-session-changed', (appId) => {
        if (appId) {
            syncWithSession(appId);
        }
    });

    monitor.on('session-removed', (appId) => {
        if (appId === activeAppId) {
            const sessions = SMTCMonitor.getMediaSessions();
            if (sessions.length > 0) {
                syncWithSession(sessions[0].sourceAppId);
            } else {
                activeAppId = '';
                currentMetadata = { title: '', artist: '', position: 0, duration: 0, status: 'Paused' };
            }
            sendUpdate();
        }
    });

    function isAppPlaying(appId) {
        const sessions = SMTCMonitor.getMediaSessions();
        const session = sessions.find(s => s.sourceAppId === appId);
        // Only consider 'Playing' for automatic switching to ensure active playback (SMTC status 4)
        return session && session.playback?.playbackStatus === 4;
    }

    function updateMetadata(appId, mediaProps) {
        activeAppId = appId;
        currentMetadata.title = mediaProps.title || '';
        currentMetadata.artist = mediaProps.artist || '';
        sendUpdate();
    }

    function syncWithSession(appId) {
        const sessions = SMTCMonitor.getMediaSessions();
        const session = sessions.find(s => s.sourceAppId === appId);
        if (session) {
            activeAppId = appId;
            currentMetadata.title = session.media?.title || '';
            currentMetadata.artist = session.media?.artist || '';
            currentMetadata.position = session.timeline?.position || 0;
            currentMetadata.duration = session.timeline?.duration || 0;
            currentMetadata.status = parsePlaybackStatus(session.playback?.playbackStatus);
            sendUpdate();
        }
    }

    function sendUpdate() {
        parentPort.postMessage({
            type: 'media-change',
            data: currentMetadata
        });
    }

    // Initial session sync
    const initialSessions = SMTCMonitor.getMediaSessions();
    if (initialSessions.length > 0) {
        syncWithSession(initialSessions[0].sourceAppId);
    }

    // Polling fallback: Finds "hidden" or stuck sessions (essential for games)
    setInterval(() => {
        const sessions = SMTCMonitor.getMediaSessions();
        
        // 1. Priority: If something else starts playing, switch focus immediately
        const anyPlaying = sessions.find(s => s.playback?.playbackStatus === 4 && s.sourceAppId !== activeAppId);
        if (anyPlaying) {
            syncWithSession(anyPlaying.sourceAppId);
            return;
        }

        // 2. Fallback: Correct pause state for the active app
        if (activeAppId) {
            const session = sessions.find(s => s.sourceAppId === activeAppId);
            if (session && session.playback && currentMetadata.status === 'Paused') {
                const actualStatus = parsePlaybackStatus(session.playback.playbackStatus);
                if (actualStatus === 'Playing') {
                    currentMetadata.status = 'Playing';
                    if (session.timeline) {
                        currentMetadata.position = session.timeline.position || 0;
                        currentMetadata.duration = session.timeline.duration || 0;
                    }
                    sendUpdate();
                }
            }
        }
    }, 2000);

} catch (err) {
    console.error('[SMTC Worker] Fatal error in monitor:', err);
    throw err;
}
