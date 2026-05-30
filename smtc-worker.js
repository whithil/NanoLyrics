/**
 * NanoLyrics SMTC Background Monitor Worker (Windows Only)
 */

const { parentPort } = require('worker_threads');

console.log('[SMTC Worker] Thread iniciada com sucesso.');

try {
    const { SMTCMonitor } = require('@coooookies/windows-smtc-monitor');

    const monitor = new SMTCMonitor();

    const parsePlaybackStatus = (status) => {
        // Windows SMTC: 4 = Playing, 1 = Opened, 2 = Changing
        switch (status) {
            case 4: return 'Playing';
            case 1: return 'Opened'; // Media is loaded, but not necessarily playing
            case 2: return 'Changing'; // Media is transitioning
            case 3: return 'Paused';
        }
        return 'Paused';
    };

    let activeAppId = '';
    let currentMetadata = { title: '', artist: '', position: 0, duration: 0, status: 'Paused' };

    monitor.on('session-media-changed', (appId, mediaProps) => {
        console.log(`[SMTC Worker] session-media-changed: AppId=${appId}, Title=${mediaProps.title}, Artist=${mediaProps.artist}, ActiveAppId=${activeAppId}`);
        if (appId === activeAppId) { // If active app's media changes, update it
            updateMetadata(appId, mediaProps);
        } else {
            // If a non-active app's media changes AND it's currently playing, switch focus
            if (isAppPlaying(appId)) { // This will now strictly check for 'Playing'
                console.log(`[SMTC Worker] Switching focus to new playing app (media changed): ${appId}`);
                updateMetadata(appId, mediaProps);
            }
        }
    });

    monitor.on('session-timeline-changed', (appId, timelineProps) => {
        if (appId === activeAppId) {
            console.log(`[SMTC Worker] session-timeline-changed: AppId=${appId}, Position=${timelineProps.position}, Duration=${timelineProps.duration}`);
            currentMetadata.position = timelineProps.position || 0;
            currentMetadata.duration = timelineProps.duration || 0;
            sendUpdate();
        }
    });

    monitor.on('session-playback-changed', (appId, playbackInfo) => {
        console.log(`[SMTC Worker] session-playback-changed: AppId=${appId}, Status=${playbackInfo.playbackStatus} (${parsePlaybackStatus(playbackInfo.playbackStatus)}), ActiveAppId=${activeAppId}`);
        const status = parsePlaybackStatus(playbackInfo.playbackStatus);
        
        // Prioridade: Se qualquer app começar a tocar, focamos nela
        if (status === 'Playing' && appId !== activeAppId) {
            console.log(`[SMTC Worker] Switching focus to new playing app: ${appId}`);
            syncWithSession(appId);
        } else if (appId === activeAppId) {
            currentMetadata.status = status;
            sendUpdate();
        }
    });

    monitor.on('current-session-changed', (appId) => {
        console.log(`[SMTC Worker] current-session-changed: AppId=${appId}, ActiveAppId=${activeAppId}`);
        if (appId) {
            activeAppId = appId;
            const sessions = SMTCMonitor.getMediaSessions();
            const currentSession = sessions.find(s => s.sourceAppId === appId);
            if (currentSession) {
                currentMetadata.title = currentSession.media?.title || '';
                currentMetadata.artist = currentSession.media?.artist || '';
                currentMetadata.position = currentSession.timeline?.position || 0;
                currentMetadata.duration = currentSession.timeline?.duration || 0;
                currentMetadata.status = parsePlaybackStatus(currentSession.playback?.playbackStatus);
                sendUpdate();
            }
        }
    });

    monitor.on('session-removed', (appId) => {
        console.log(`[SMTC Worker] session-removed: AppId=${appId}, ActiveAppId=${activeAppId}`);
        if (appId === activeAppId) {
            const sessions = SMTCMonitor.getMediaSessions();
            if (sessions.length > 0) {
                const nextSession = sessions[0];
                activeAppId = nextSession.sourceAppId;
                currentMetadata.title = nextSession.media?.title || '';
                currentMetadata.artist = nextSession.media?.artist || '';
                currentMetadata.position = nextSession.timeline?.position || 0;
                currentMetadata.duration = nextSession.timeline?.duration || 0;
                currentMetadata.status = parsePlaybackStatus(nextSession.playback?.playbackStatus);
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

    const initialSessions = SMTCMonitor.getMediaSessions();
    console.log(`[SMTC Worker] Initial sessions found: ${initialSessions.length}`);
    if (initialSessions.length > 0) {
        const active = initialSessions[0];
        activeAppId = active.sourceAppId;
        currentMetadata.title = active.media?.title || '';
        currentMetadata.artist = active.media?.artist || '';
        currentMetadata.position = active.timeline?.position || 0;
        currentMetadata.duration = active.timeline?.duration || 0;
        currentMetadata.status = parsePlaybackStatus(active.playback?.playbackStatus);
        sendUpdate();
    }

    // Polling fallback: Encontra sessões "escondidas" ou presas (essencial para jogos)
    setInterval(() => {
        const sessions = SMTCMonitor.getMediaSessions();
        
        // 1. Prioridade: Se houver ALGO a tocar que não seja a app ativa, muda logo.
        const anyPlaying = sessions.find(s => s.playback?.playbackStatus === 4 && s.sourceAppId !== activeAppId);
        if (anyPlaying) {
            console.log(`[SMTC Worker] Polling detetou nova app a tocar: ${anyPlaying.sourceAppId}`);
            syncWithSession(anyPlaying.sourceAppId);
            return;
        }

        // 2. Fallback: Corrigir estado de pausa na app ativa
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
    console.error('[SMTC Worker] Erro fatal no monitor:', err);
    throw err;
}