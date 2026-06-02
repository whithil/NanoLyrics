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

ipcRenderer.on('load-title-parts', (e, { title, artist }) => {
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
    document.getElementById('intro-title').innerText = t('title_parts.intro_title');
    document.getElementById('intro-desc').innerText = t('title_parts.intro_desc');
    document.getElementById('how-to-title').innerText = t('title_parts.how_to_title');
    document.getElementById('how-to-desc').innerText = t('title_parts.how_to_desc');
    document.getElementById('btn-cancel').innerText = t('title_parts.cancel');
    document.getElementById('btn-search').innerText = t('title_parts.search');
}

function submitTitleParts() {
    const activeChips = Array.from(document.querySelectorAll('.chip.active')).map(el => el.innerText);
    const query = activeChips.join(' ');
    ipcRenderer.send('title-parts-search', query);
}

document.getElementById('btn-cancel').onclick = () => ipcRenderer.send('close-title-parts');
document.getElementById('btn-search').onclick = () => submitTitleParts();

// Listen for translations
ipcRenderer.on('apply-translations', (e, data) => {
    applyTranslations(data);
});

// Request initial translations
ipcRenderer.send('request-title-parts-translations');
