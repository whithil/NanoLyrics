const { ipcRenderer } = require('electron');

let recordingEl = null;
let translations = {};
let appConfig = {};
let systemFonts = [];
let isFontDropdownOpen = false;

function t(keyPath, placeholders = {}) {
    const keys = keyPath.split('.');
    let result = translations;
    for (const key of keys) {
        if (!result || result[key] === undefined) return keyPath;
        result = result[key];
    }
    if (typeof result === 'string') {
        Object.keys(placeholders).forEach(p => {
            result = result.replace(new RegExp(`{${p}}`, 'g'), placeholders[p]);
        });
    }
    return result;
}

function formatHotkey(hk) {
    if (!hk) return '';
    const mod = t('common.modifier') || 'Ctrl';
    return hk.replace(/CommandOrControl/g, mod);
}

function applyConfig(config) {
    appConfig = config;
    
    // Designer Logic
    document.getElementById('fontFamily').value = config.fontFamily;
    document.getElementById('fontSize').value = config.fontSize;
    document.getElementById('letterSpacing').value = config.letterSpacing;
    document.getElementById('fontWeight').value = config.fontWeight;
    
    document.getElementById('activeColor').value = config.activeColor;
    document.getElementById('activeColorPicker').value = config.activeColor;
    document.getElementById('inactiveColor').value = config.inactiveColor;
    document.getElementById('inactiveColorPicker').value = config.inactiveColor;

    const boldBtn = document.getElementById('toggleBold');
    if (config.fontWeight >= 700) boldBtn.classList.add('active');
    else boldBtn.classList.remove('active');

    // Effects
    document.getElementById('outlineColor').value = config.outlineColor;
    document.getElementById('outlineColorPicker').value = config.outlineColor;
    document.getElementById('outlineSize').value = config.outlineSize;
    document.getElementById('shadowColor').value = config.shadowColor;
    document.getElementById('shadowColorPicker').value = config.shadowColor;
    document.getElementById('shadowBlur').value = config.shadowBlur;
    document.getElementById('shadowOffsetX').value = config.shadowOffsetX;
    document.getElementById('shadowOffsetY').value = config.shadowOffsetY;

    // Detect Shadow Preset
    const preset = detectShadowPreset(config);
    document.getElementById('shadowPreset').value = preset;

    // Widget Styling
    document.getElementById('boxedMode').checked = config.boxedMode;
    document.getElementById('boxColor').value = config.boxColor;
    document.getElementById('boxColorPicker').value = config.boxColor;
    document.getElementById('boxOpacity').value = config.boxOpacity;
    document.getElementById('widgetOpacity').value = config.widgetOpacity;
    document.getElementById('backgroundImage').value = config.backgroundImage;
    document.getElementById('borderImage').value = config.borderImage;

    // Hotkeys
    renderHotkeys();

    // Trigger Initial Preview
    updatePreview();

    // Request other data
    ipcRenderer.send('request-plugins');
}

function detectShadowPreset(c) {
    if (c.shadowBlur === 0 && c.shadowOffsetX === 0 && c.shadowOffsetY === 0) return 'none';
    if (c.shadowBlur === 4 && c.shadowOffsetX === 0 && c.shadowOffsetY === 2) return 'soft';
    if (c.shadowBlur === 0 && c.shadowOffsetX === 3 && c.shadowOffsetY === 3) return 'hard';
    if (c.shadowBlur === 15 && c.shadowOffsetX === 0 && c.shadowOffsetY === 0) return 'neon';
    return 'custom';
}

function applyShadowPreset(preset) {
    const blur = document.getElementById('shadowBlur');
    const ox = document.getElementById('shadowOffsetX');
    const oy = document.getElementById('shadowOffsetY');
    if (preset === 'none') { blur.value = 0; ox.value = 0; oy.value = 0; }
    else if (preset === 'soft') { blur.value = 4; ox.value = 0; oy.value = 2; }
    else if (preset === 'hard') { blur.value = 0; ox.value = 3; oy.value = 3; }
    else if (preset === 'neon') { blur.value = 15; ox.value = 0; oy.value = 0; }
    updatePreview();
}

function updatePreview() {
    const box = document.getElementById('live-preview-box');
    if (!box) return;
    const ff = document.getElementById('fontFamily').value;
    const fs = document.getElementById('fontSize').value;
    const fw = document.getElementById('fontWeight').value;
    const ls = document.getElementById('letterSpacing').value;
    const ac = document.getElementById('activeColor').value;
    const ic = document.getElementById('inactiveColor').value;
    const oc = document.getElementById('outlineColor').value;
    const os = document.getElementById('outlineSize').value;
    const sc = document.getElementById('shadowColor').value;
    const sb = document.getElementById('shadowBlur').value;
    const sx = document.getElementById('shadowOffsetX').value;
    const sy = document.getElementById('shadowOffsetY').value;
    const bm = document.getElementById('boxedMode').checked;
    const bc = document.getElementById('boxColor').value;
    const bo = document.getElementById('boxOpacity').value;
    const wo = document.getElementById('widgetOpacity').value;
    const bi = document.getElementById('backgroundImage').value;
    const bri = document.getElementById('borderImage').value;

    const root = document.getElementById('live-preview-container');
    root.style.opacity = wo;
    root.style.backgroundImage = bi ? `url("${bi.replace(/\\/g, '/')}")` : 'none';
    root.style.backgroundSize = 'cover';
    root.style.borderImage = bri || 'none';

    const outlineStyle = `calc(${os}px * -1) calc(${os}px * -1) 0 ${oc}, ${os}px calc(${os}px * -1) 0 ${oc}, calc(${os}px * -1) ${os}px 0 ${oc}, ${os}px ${os}px 0 ${oc}`;
    const shadowStyle = `${sx}px ${sy}px ${sb}px ${sc}`;

    box.querySelectorAll('.preview-line').forEach(el => {
        el.style.fontFamily = `"${ff}", sans-serif`;
        el.style.letterSpacing = ls + 'px';
        el.style.textShadow = `${outlineStyle}, ${shadowStyle}`;
        if (el.classList.contains('active')) {
            el.style.color = ac;
            el.style.fontSize = (fs * 1.2) + 'px';
            el.style.fontWeight = fw;
            el.style.backgroundColor = bm ? hexToRgba(bc, bo) : 'transparent';
            el.style.padding = bm ? '4px 12px' : '0';
            el.style.borderRadius = '4px';
        } else {
            el.style.color = ic;
            el.style.fontSize = fs + 'px';
            el.style.fontWeight = 400;
            el.style.backgroundColor = 'transparent';
            el.style.padding = '0';
        }
    });
}

function hexToRgba(hex, opacity) {
    let r = 0, g = 0, b = 0;
    if (hex.startsWith('#')) {
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16);
        } else if (hex.length === 7) {
            r = parseInt(hex[1] + hex[2], 16); g = parseInt(hex[3] + hex[4], 16); b = parseInt(hex[5] + hex[6], 16);
        }
    }
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Font Picker
const fontInput = document.getElementById('fontFamily');
const fontDropdown = document.getElementById('font-dropdown');
fontInput.onfocus = () => {
    if (systemFonts.length === 0) {
        ipcRenderer.send('request-system-fonts');
        fontDropdown.innerHTML = '<div class="font-option">Loading fonts...</div>';
    }
    fontDropdown.classList.remove('hidden');
};
fontInput.oninput = (e) => { filterFonts(e.target.value); updatePreview(); };
function filterFonts(query) {
    const filtered = systemFonts.filter(f => f.toLowerCase().includes(query.toLowerCase())).slice(0, 50);
    renderFontOptions(filtered);
}
function renderFontOptions(fonts) {
    fontDropdown.innerHTML = '';
    fonts.forEach(f => {
        const opt = document.createElement('div');
        opt.className = 'font-option';
        opt.innerText = f;
        opt.style.fontFamily = `"${f}", sans-serif`;
        opt.onclick = () => { fontInput.value = f; updatePreview(); fontDropdown.classList.add('hidden'); };
        fontDropdown.appendChild(opt);
    });
}
document.addEventListener('click', (e) => {
    if (!e.target.closest('.font-picker-container')) fontDropdown.classList.add('hidden');
    
    const link = e.target.closest('a');
    if (link && link.href && link.href.startsWith('http')) {
        e.preventDefault();
        ipcRenderer.send('open-external', link.href);
    }
});
ipcRenderer.on('apply-system-fonts', (e, fonts) => { systemFonts = fonts; renderFontOptions(fonts.slice(0, 50)); });

// Tabs Logic
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tab-btn, .tab-pane').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`pane-${btn.dataset.tab}`).classList.add('active');
    };
});

// Event Bindings
document.getElementById('toggleBold').onclick = (e) => {
    const btn = e.currentTarget; btn.classList.toggle('active');
    document.getElementById('fontWeight').value = btn.classList.contains('active') ? 700 : 400;
    updatePreview();
};
document.getElementById('shadowPreset').onchange = (e) => applyShadowPreset(e.target.value);
function bindColor(id) {
    const picker = document.getElementById(id + 'Picker');
    const text = document.getElementById(id);
    picker.oninput = e => { text.value = e.target.value; updatePreview(); };
    text.oninput = e => { picker.value = e.target.value; updatePreview(); };
}
bindColor('activeColor'); bindColor('inactiveColor'); bindColor('outlineColor'); bindColor('shadowColor'); bindColor('boxColor');
['fontSize', 'letterSpacing', 'outlineSize', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'boxedMode', 'boxOpacity', 'widgetOpacity', 'backgroundImage', 'borderImage'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.oninput = () => updatePreview(); if (el.type === 'checkbox') el.onchange = () => updatePreview(); }
});

function applyTranslations(data) {
    translations = data;
    const mod = t('common.modifier') || 'Ctrl';
    document.getElementById('settings-title').innerText = t('settings.title');
    document.getElementById('tab-visuals-label').innerText = t('settings.tab_visuals');
    document.getElementById('tab-hotkeys-label').innerText = t('settings.tab_hotkeys');
    document.getElementById('tab-plugins-label').innerText = t('settings.tab_plugins');
    document.getElementById('tab-advanced-label').innerText = t('settings.tab_advanced');
    document.getElementById('tab-about-label').innerText = t('settings.tab_about');
    document.getElementById('visual-designer-title').innerText = t('settings.visual_designer');
    document.getElementById('fontFamily').placeholder = t('settings.font_search');
    document.getElementById('active-color-label').innerText = t('settings.active');
    document.getElementById('inactive-color-label').innerText = t('settings.inactive');
    document.getElementById('shadow-none').innerText = t('settings.shadow_none');
    document.getElementById('shadow-soft').innerText = t('settings.shadow_soft');
    document.getElementById('shadow-hard').innerText = t('settings.shadow_hard');
    document.getElementById('shadow-neon').innerText = t('settings.shadow_neon');
    document.getElementById('box-label').innerText = t('settings.box');
    document.getElementById('hotkeys-title').innerText = t('settings.hotkeys');
    document.getElementById('hk-lock-label').innerText = t('settings.lock_unlock');
    document.getElementById('hk-adv-label').innerText = t('settings.advance_sync');
    document.getElementById('hk-rew-label').innerText = t('settings.rewind_sync');
    document.getElementById('hk-vis-label').innerText = t('settings.show_hide');
    document.getElementById('hk-puz-label').innerText = t('settings.open_title_parts');
    document.getElementById('hotkey-hint').innerText = t('settings.hotkey_hint', { modifier: mod });
    document.getElementById('plugins-title').innerText = t('settings.plugins_title');
    document.getElementById('plugins-hint').innerText = t('settings.plugins_hint');
    document.getElementById('plugins-how-it-works-title').innerText = t('settings.plugins_how_it_works_title');
    document.getElementById('plugins-how-it-works-desc').innerText = t('settings.plugins_how_it_works_desc');
    document.getElementById('language-title').innerText = t('settings.language');
    document.getElementById('language-auto').innerText = t('settings.language_auto');
    document.getElementById('cache-mgmt-title').innerText = t('settings.cache_mgmt');
    document.getElementById('lrc-cache-label').innerText = t('settings.synced_lyrics');
    document.getElementById('overrides-cache-label').innerText = t('settings.title_parts_overrides');
    document.getElementById('clearLrcBtn').innerText = t('settings.clear_lrc');
    document.getElementById('clearOverridesBtn').innerText = t('settings.clear_overrides');
    document.getElementById('cache-hint').innerText = t('settings.cache_hint');
    document.getElementById('about-title').innerText = t('about.title');
    document.getElementById('about-description').innerText = t('about.description');
    document.getElementById('about-disclaimer').innerText = t('about.disclaimer');
    document.getElementById('support-lrclib-title').innerText = t('settings.support_lrclib');
    document.getElementById('support-message').innerText = t('settings.support_message');
    document.getElementById('btn-visit-lrclib').innerText = t('settings.visit_lrclib');
    document.getElementById('saveBtn').innerText = t('settings.save_apply');
    renderHotkeys();
}

function renderHotkeys() {
    if (!appConfig.hotkeys) return;
    document.getElementById('hk_lock').value = formatHotkey(appConfig.hotkeys.toggleLock);
    document.getElementById('hk_adv').value = formatHotkey(appConfig.hotkeys.advanceSync);
    document.getElementById('hk_rew').value = formatHotkey(appConfig.hotkeys.rewindSync);
    document.getElementById('hk_vis').value = formatHotkey(appConfig.hotkeys.toggleWidget);
    document.getElementById('hk_puz').value = formatHotkey(appConfig.hotkeys.toggleTitleParts);
}

function renderPluginList(plugins) {
    const container = document.getElementById('plugin-list');
    container.innerHTML = '';
    plugins.forEach(p => {
        const item = document.createElement('div'); item.className = 'plugin-item';
        item.innerHTML = `
            <div class="plugin-header"><span class="plugin-name">${p.name}</span>
                <label class="switch"><input type="checkbox" class="plugin-toggle" data-id="${p.id}" ${p.enabled ? 'checked' : ''}><span class="slider"></span></label>
            </div><div class="plugin-desc">${p.description || ''}</div>
            ${p.instructions ? `<details><summary style="font-size:10px;color:#39FF14;cursor:pointer">${t('settings.plugin_instructions')}</summary><div class="plugin-instr">${p.instructions}</div></details>` : ''}
        `;
        container.appendChild(item);
    });
}

// Hotkey Recording Logic
document.querySelectorAll('.hotkey-input').forEach(el => {
    el.onclick = () => { if (recordingEl) recordingEl.classList.remove('recording'); recordingEl = el; el.classList.add('recording'); el.value = t('settings.recording'); };
});
window.addEventListener('keydown', (e) => {
    if (!recordingEl) return;
    e.preventDefault(); e.stopPropagation();
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    let parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    let key = e.key === ' ' ? 'Space' : (e.key.length === 1 ? e.key.toUpperCase() : e.key);
    const keyMap = { 'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right', 'Escape': 'Esc' };
    parts.push(keyMap[key] || key);
    recordingEl.value = parts.join('+'); recordingEl.classList.remove('recording'); recordingEl = null;
});

// Cache & File Dialog
function handleClear(type, btnId) {
    ipcRenderer.send('clear-cache', type);
    const btn = document.getElementById(btnId); const originalText = btn.innerText;
    btn.innerText = t('settings.cleared'); btn.style.backgroundColor = '#555';
    setTimeout(() => { btn.innerText = originalText; btn.style.backgroundColor = ''; }, 2000);
}
document.getElementById('clearLrcBtn').onclick = () => handleClear('lrc', 'clearLrcBtn');
document.getElementById('clearOverridesBtn').onclick = () => handleClear('overrides', 'clearOverridesBtn');
document.getElementById('btn-visit-lrclib').onclick = () => ipcRenderer.send('open-external', 'https://lrclib.net');
document.getElementById('btn-visit-github').onclick = () => ipcRenderer.send('open-external', 'https://github.com/whithil/NanoLyrics');

document.getElementById('btn-browse-bg').onclick = () => ipcRenderer.send('open-file-dialog');
ipcRenderer.on('selected-file', (e, path) => {
    document.getElementById('backgroundImage').value = path;
    updatePreview();
});

ipcRenderer.on('cache-info', (e, info) => {
    const label = t('settings.space_occupied');
    document.getElementById('lrcSizeLabel').innerText = label + info.lrcSize;
    document.getElementById('overridesSizeLabel').innerText = label + info.overridesSize;
});

// Save Logic
document.getElementById('saveBtn').onclick = () => {
    const disabledPlugins = Array.from(document.querySelectorAll('.plugin-toggle')).filter(cb => !cb.checked).map(cb => cb.getAttribute('data-id'));
    const config = {
        fontFamily: document.getElementById('fontFamily').value,
        fontWeight: parseInt(document.getElementById('fontWeight').value),
        fontSize: parseInt(document.getElementById('fontSize').value),
        letterSpacing: parseFloat(document.getElementById('letterSpacing').value),
        activeColor: document.getElementById('activeColor').value,
        inactiveColor: document.getElementById('inactiveColor').value,
        hotkeys: {
            toggleLock: revertHotkey(document.getElementById('hk_lock').value),
            advanceSync: revertHotkey(document.getElementById('hk_adv').value),
            rewindSync: revertHotkey(document.getElementById('hk_rew').value),
            toggleWidget: revertHotkey(document.getElementById('hk_vis').value),
            toggleTitleParts: revertHotkey(document.getElementById('hk_puz').value)
        },
        outlineColor: document.getElementById('outlineColor').value,
        outlineSize: parseFloat(document.getElementById('outlineSize').value),
        shadowColor: document.getElementById('shadowColor').value,
        shadowBlur: parseInt(document.getElementById('shadowBlur').value),
        shadowOffsetX: parseInt(document.getElementById('shadowOffsetX').value),
        shadowOffsetY: parseInt(document.getElementById('shadowOffsetY').value),
        boxedMode: document.getElementById('boxedMode').checked,
        boxColor: document.getElementById('boxColor').value,
        boxOpacity: parseFloat(document.getElementById('boxOpacity').value),
        widgetOpacity: parseFloat(document.getElementById('widgetOpacity').value),
        backgroundImage: document.getElementById('backgroundImage').value,
        borderImage: document.getElementById('borderImage').value,
        disabledPlugins: disabledPlugins
    };
    ipcRenderer.send('save-settings', config);
};
function revertHotkey(hk) {
    if (!hk) return '';
    const mod = t('common.modifier') || 'Ctrl';
    return hk.replace(new RegExp(mod, 'g'), 'CommandOrControl');
}

ipcRenderer.on('apply-config', (e, config) => applyConfig(config));
ipcRenderer.on('apply-translations', (e, data) => applyTranslations(data));
ipcRenderer.on('apply-plugins', (e, plugins) => renderPluginList(plugins));
ipcRenderer.send('request-settings-config');
ipcRenderer.send('request-cache-info');
