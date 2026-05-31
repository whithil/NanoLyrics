const { ipcRenderer } = require('electron');

let words = [];
let translations = {};

function t(keyPath) {
    const keys = keyPath.split('.');
    let result = translations;
    for (const key of keys) {
        if (!result || result[key] === undefined) return keyPath;
        result = result[key];
    }
    return result;
}

ipcRenderer.on('load-puzzle', (e, { title, artist }) => {
    const fullString = `${artist} ${title}`.replace(/\s+/g, ' ').trim();
    words = fullString.split(' ');
    const container = document.getElementById('chips');
    container.innerHTML = '';
    
    words.forEach((w, i) => {
        const div = document.createElement('div');
        div.className = 'chip active'; // All active by default
        div.innerText = w;
        div.onclick = () => div.classList.toggle('active');
        container.appendChild(div);
    });
});

function applyTranslations(data) {
    translations = data;
    document.getElementById('puzzle-title').innerText = '🧩 ' + t('puzzle.title');
    document.getElementById('btn-cancel').innerText = t('puzzle.cancel');
    document.getElementById('btn-search').innerText = t('puzzle.search');
}

function submitPuzzle() {
    const activeChips = Array.from(document.querySelectorAll('.chip.active')).map(el => el.innerText);
    const query = activeChips.join(' ');
    ipcRenderer.send('puzzle-search', query);
}

document.getElementById('btn-cancel').onclick = () => ipcRenderer.send('close-puzzle');
document.getElementById('btn-search').onclick = () => submitPuzzle();

// Listen for translations
ipcRenderer.on('apply-translations', (e, data) => {
    applyTranslations(data);
});

// Request initial translations
ipcRenderer.send('request-puzzle-translations');
