import {createBackdrop} from './backdrop.js';
import {MODES, makeListing} from './clock.js';
import {THEMES, activeTheme, visibleFields, seasonalBackground, effectColorCss} from './settings.js';

export function backgroundImageUrl(path) {
    if (!path) return '';
    // Wallpaper Engine can escape the drive separator before sending a file property.
    const normalized = path.replace(/\\/g, '/').replace(/^(file:\/\/\/)?([a-z])%3a(?=\/)/i, '$1$2:');
    // An existing file URL may already contain percent-encoded filename characters.
    if (/^file:\/\//i.test(normalized)) {
        const url = new URL(normalized.replace(/#/g, '%23'));
        return `url(${JSON.stringify(url.href)})`;
    }
    const localPath = encodeURI(normalized).replace(/#/g, '%23');
    const url = normalized.startsWith('//') ? `file:${localPath}` : `file:///${localPath}`;
    return `url(${JSON.stringify(url)})`;
}

function applyTheme(document, theme) {
    const link = document.getElementById('clock-theme');
    const href = theme === 'main' ? null : THEMES[theme];
    if (link.getAttribute('href') === href) return;
    if (href) link.setAttribute('href', href);
    else link.removeAttribute('href');
}

export function applyAppearance(document, settings, hour = new Date().getHours(), backgroundPath = settings.customimage) {
    const {style} = document.body;
    style.fontSize = `${settings.ui_font_size}px`;
    style.fontFamily = settings.ui_customize_theme_enable && settings.ui_font_family !== 'inherit'
        ? settings.ui_font_family : '';
    style.justifyContent = settings.ui_customize_position_enable ? settings.ui_position_x : 'center';
    style.alignItems = settings.ui_customize_position_enable ? settings.ui_position_y : 'center';
    applyTheme(document, activeTheme(settings, hour));
    const panel = document.getElementById('workspace');
    panel.classList.toggle('no-panel-background', !settings.ui_ide_panel_background);
    panel.classList.toggle('transparent-text-bg-container', settings.ui_semi_transparent_bg);
    const image = backgroundImageUrl(backgroundPath);
    style.backgroundImage = image;
    panel.classList.toggle('photo-panel', Boolean(image));
    panel.style.setProperty('--photo-panel-opacity', `${100 - settings.ui_photo_panel_transparency}%`);
}

function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
}

export function createClockView(document, host = document.defaultView, actions = {}) {
    const get = id => document.getElementById(id);
    const root = get('object_clock'), panel = get('workspace'), mount = get('clock-mount');
    const header = get('editor-head'), status = get('status-bar'), output = get('console-output');
    const tip = get('watch-tip');
    const backdrop = createBackdrop(get('backdrop'), host);
    const desktop = createEditorControls(document, host, actions);
    let rows = [], mode, structure, typingEnabled, watchEnabled, hovered;
    let lastUnix, lastHourStart, buildStart, lastTheme, lastAudio = 0;
    let pointerX = 0, pointerY = 0;
    let suspended = false;
    let needsFit = true;

    function fit() {
        if (suspended || !host || !panel.offsetWidth || !panel.offsetHeight) return;
        const gap = 2 * parseFloat(host.getComputedStyle(document.body).paddingLeft);
        const scale = Math.min(1, (host.innerWidth - gap) / panel.offsetWidth, (host.innerHeight - gap) / panel.offsetHeight);
        if (scale <= 0) return;
        mount.style.width = `${panel.offsetWidth * scale}px`;
        mount.style.height = `${panel.offsetHeight * scale}px`;
        panel.style.transform = `scale(${scale})`;
        tip.style.setProperty('--editor-fit', scale);
        get('editor-menu').style.setProperty('--editor-fit', scale);
        mount.classList.toggle('fitted', true);
        desktop.place();
        if (hovered) showWatch();
        needsFit = false;
    }
    const observer = host?.ResizeObserver ? new host.ResizeObserver(fit) : null;
    observer?.observe(panel);
    host?.addEventListener('resize', fit);

    function hideWatch() {
        hovered = undefined;
        tip.hidden = true;
    }
    function showWatch() {
        const watch = hovered?.clockWatch;
        const diagnostic = hovered?.clockDiagnostic;
        if (!hovered || (!diagnostic && !(watchEnabled && watch))) return hideWatch();
        const info = watchEnabled && watch ? `${hovered.textContent}  ·  ${watch.type}\nsizeof  ${watch.bytes} B\naddr    ${watch.address}` : '';
        setText(tip, [diagnostic, info].filter(Boolean).join('\n'));
        tip.hidden = false;
        const offset = parseFloat(host.getComputedStyle(tip).fontSize);
        const margin = offset / 2;
        tip.style.left = `${Math.max(margin, Math.min(pointerX + offset, host.innerWidth - tip.offsetWidth - margin))}px`;
        tip.style.top = `${Math.max(margin, Math.min(pointerY + offset, host.innerHeight - tip.offsetHeight - margin))}px`;
    }
    function pointer(event) {
        if (suspended) return;
        pointerX = event.clientX;
        pointerY = event.clientY;
        backdrop.point(pointerX, pointerY);
        desktop.move(event);
        if ((watchEnabled && event.target.clockWatch) || event.target.clockDiagnostic) {
            hovered = event.target;
            showWatch();
        } else if (hovered) hideWatch();
    }
    document.addEventListener('pointermove', pointer);
    document.addEventListener('pointerout', leave);
    function leave(event) {
        if (!event.relatedTarget || event.target === hovered) hideWatch();
    }
    get('clock-theme').addEventListener('load', backdrop.paletteChanged);

    function makeRow(line, index, animate) {
        const node = document.createElement('div');
        node.className = 'code-row';
        node.style.setProperty('--indent', line.indent);
        node.setAttribute('data-ln', String(index + 1).padStart(2, '0'));
        const source = document.createElement('span');
        source.className = animate ? 'source typing' : 'source';
        source.style.animationDelay = `${index * 85}ms`;
        if (line.key) source.id = line.key;
        node.append(source);
        return {node, source, parts: []};
    }

    function paintLine(entry, line, highlight, tick, diagnostic) {
        if (entry.parts.length !== line.tokens.length) {
            entry.parts = line.tokens.map(() => document.createElement('span'));
            entry.source.replaceChildren(...entry.parts);
        }
        let length = 0;
        line.tokens.forEach((part, i) => {
            const el = entry.parts[i];
            const changed = el.textContent !== part.text;
            if (changed && tick && highlight && part.isValue && el.textContent) {
                el.flash = el.flash === 'flash-a' ? 'flash-b' : 'flash-a';
            } else if (!highlight) el.flash = '';
            el.clockDiagnostic = part.watch ? diagnostic?.message : undefined;
            const className = [part.kind, el.flash, el.clockDiagnostic && diagnostic.kind].filter(Boolean).join(' ');
            if (el.className !== className) el.className = className;
            setText(el, part.text);
            el.clockWatch = part.watch;
            if (part.watch) el.setAttribute('data-watch', '');
            else el.removeAttribute('data-watch');
            if (line.key && part.isValue) el.id = line.key + '_value';
            length += part.text.length;
        });
        return length;
    }

    function update(clock, settings) {
        desktop.sync(settings);
        if (settings.ui_audio && Date.now() - lastAudio > 1200) setText(get('audio-meter'), '▁▁▁▁▁▁▁▁');
        const nextMode = settings.ui_syntax_mode;
        const fields = visibleFields(settings);
        const lines = makeListing(clock, settings, fields);
        const layout = [nextMode, fields.map(f => f.name).join(','), settings.ui_dynamic_comments, settings.ui_progress !== 'off'].join('|');
        const replay = desktop.replay;
        const animate = replay || (settings.ui_typewriter && (nextMode !== mode || !typingEnabled));
        const rebuild = layout !== structure || animate;
        if (rebuild) {
            hideWatch();
            rows = lines.map((line, i) => makeRow(line, i, animate));
            root.replaceChildren(...rows.map(r => r.node));
            desktop.replay = false;
        }
        let lastLength;
        const tick = !rebuild && lastUnix !== undefined && clock.unix !== lastUnix;
        lines.forEach((line, i) => {
            if (!settings.ui_typewriter && typingEnabled && !replay) rows[i].source.className = 'source';
            const diagnostic = settings.ui_warnings && diagnosticFor(line.key, clock, settings.ui_sus_mode);
            lastLength = paintLine(rows[i], line, settings.ui_highlight, tick, diagnostic);
        });

        const [file, dialect] = MODES[nextMode];
        const hour = settings.ui_use_12h_format ? clock.hour % 12 || 12 : clock.hour;
        const time = [hour, clock.minute, clock.second].map(n => String(n).padStart(2, '0')).join(':') +
            (settings.ui_use_12h_format ? ' ' + clock.period : '');
        const hourStart = clock.unix - clock.minute * 60 - clock.second;
        const hourChanged = hourStart !== lastHourStart && clock.unix > lastUnix && clock.unix - lastUnix < 60;
        if (!settings.ui_status_bar || clock.unix < lastUnix) buildStart = undefined;
        else if (hourChanged) buildStart = clock.unix;
        const age = clock.unix - buildStart;
        const framed = settings.ui_ide_frame && !desktop.minimal && !desktop.collapsed;
        header.hidden = !framed;
        root.hidden = desktop.collapsed;
        status.hidden = !desktop.collapsed && !settings.ui_status_bar;
        const message = desktop.message();
        output.hidden = desktop.collapsed || (!settings.ui_console && !message);
        panel.classList.toggle('framed', framed);
        panel.classList.toggle('collapsed', desktop.collapsed);
        root.classList.toggle('cursor', settings.ui_cursor);
        root.classList.toggle('watch', settings.ui_watch);
        if (framed) {
            setText(get('filename'), file);
            setText(get('file-icon'), dialect === 'C#' ? 'C#' : {asm: 'ASM', glsl: 'GL', c: 'C'}[nextMode] || 'C++');
        }
        if (!status.hidden) {
            const build = get('build-state');
            setText(build, age < 1 ? 'Compiling…' : age < 3 ? 'Build succeeded' : 'NORMAL');
            build.classList.toggle('building', age < 1);
            setText(get('dialect'), dialect);
            setText(get('position'), desktop.collapsed ? time : `Ln ${lines.length}, Col ${1 + lastLength + lines.at(-1).indent * 4}`);
        }
        if (!output.hidden) {
            setText(get('stdout'), message || `› ${time}  ·  tick OK`);
        }
        watchEnabled = settings.ui_watch;
        if (hovered) showWatch();
        const theme = activeTheme(settings, clock.hour);
        if (theme !== lastTheme) {
            applyTheme(document, theme);
            backdrop.paletteChanged();
        }
        const scene = desktop.matrixBoost() ? 'matrix' : seasonalBackground(settings.ui_background, clock.monthIndex);
        const customColor = settings.ui_custom_effect_color ? effectColorCss(settings.ui_effect_color) : '';
        backdrop.configure(scene, settings.ui_rain_alphabet, settings.ui_font_size, customColor);
        lastTheme = theme;
        mode = nextMode;
        structure = layout;
        typingEnabled = settings.ui_typewriter;
        lastUnix = clock.unix;
        lastHourStart = hourStart;
        if (needsFit || !observer) fit();
    }
    return {
        update,
        fit,
        draw(timestamp, now, fps) {
            desktop.tilt(timestamp);
            backdrop.draw(timestamp, now, fps, desktop.matrixBoost() ? 4 : 1);
        },
        audio(meter) {
            lastAudio = Date.now();
            setText(get('audio-meter'), meter);
        },
        setPaused(paused) {
            suspended = paused;
            desktop.pause(paused);
            needsFit = true;
            lastUnix = lastHourStart = buildStart = undefined;
            document.body.classList.toggle('paused', paused);
            backdrop.resetFrame();
            hideWatch();
        },
        stop() {
            desktop.stop();
            observer?.disconnect();
            host?.removeEventListener('resize', fit);
            document.removeEventListener('pointermove', pointer);
            document.removeEventListener('pointerout', leave);
            get('clock-theme').removeEventListener('load', backdrop.paletteChanged);
            hideWatch();
        }
    };
}

function diagnosticFor(field, clock, sus) {
    if (!field) return;
    if (sus && field === 'second') return {kind: 'error', message: 'CLK002 · Expected a second, received SUS.'};
    if (field === 'hour' && clock.hour < 5) return {kind: 'warning', message: 'CLK001 · Night build. Consider a sleep cycle.'};
    if (field === 'second' && clock.second === 0) return {kind: 'warning', message: 'CLK003 · Minute boundary. Cached values expired.'};
}

function createEditorControls(document, host, actions) {
    const get = id => document.getElementById(id);
    const mount = get('clock-mount'), header = get('editor-head'), menu = get('editor-menu');
    const tabs = get('file-tabs'), palette = get('pick-theme'), commands = get('open-commands');
    const state = {collapsed: false, minimal: false, replay: false};
    const positionKey = 'cpp-object-clock:window-position';
    let settings, tabSignature, position, drag, menuKind, egg, expires = 0, prefix = '';
    let paused = false, pauseTime, previousFrame, pitch = 0, yaw = 0, targetPitch = 0, targetYaw = 0;
    const eggs = ['segfault', 'vim', 'matrix'];
    const listeners = [];
    function listen(target, event, callback) {
        target.addEventListener(event, callback);
        listeners.push(() => target.removeEventListener(event, callback));
    }
    function commandButton(label, action, value) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.value = value;
        button.setAttribute('data-action', action);
        return button;
    }
    function refresh() { actions.refresh?.(); }
    function endDrag(save) {
        if (!drag) return;
        const {id, original} = drag;
        drag = undefined;
        if (header.hasPointerCapture?.(id)) header.releasePointerCapture(id);
        if (!save) position = original;
        else if (position) persist();
        mount.classList.toggle('dragging', false);
        place();
    }
    function persist() {
        try { host.localStorage.setItem(positionKey, JSON.stringify(position)); } catch { /* Storage is optional. */ }
    }
    function readPosition() {
        try {
            const p = JSON.parse(host.localStorage.getItem(positionKey));
            if (p && [p.x, p.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) return p;
        } catch { /* A renderer may start with storage unavailable. */ }
    }
    function place() {
        const floating = Boolean(settings?.ui_draggable && position);
        mount.classList.toggle('floating', floating);
        mount.style.left = floating ? `${position.x * Math.max(0, host.innerWidth - mount.offsetWidth)}px` : '';
        mount.style.top = floating ? `${position.y * Math.max(0, host.innerHeight - mount.offsetHeight)}px` : '';
        if (menuKind) placeMenu();
    }
    function placeMenu() {
        const anchor = (menuKind === 'palette' ? palette : commands).getBoundingClientRect();
        const room = host.innerHeight - anchor.bottom;
        menu.style.left = `${Math.max(0, Math.min(anchor.left, host.innerWidth - menu.offsetWidth))}px`;
        menu.style.top = `${room >= menu.offsetHeight ? anchor.bottom : Math.max(0, anchor.top - menu.offsetHeight)}px`;
    }
    function closeMenu() {
        menu.hidden = true;
        menuKind = undefined;
        palette.setAttribute('aria-expanded', 'false');
        commands.setAttribute('aria-expanded', 'false');
    }
    function openMenu(kind) {
        if (menuKind === kind) return closeMenu();
        closeMenu();
        menuKind = kind;
        const isPalette = kind === 'palette';
        const keys = isPalette ? Object.keys(THEMES) : eggs;
        menu.replaceChildren(...keys.map(key => {
            const label = isPalette ? key.replaceAll('_', ' ').replace(/\b\w/g, ch => ch.toUpperCase()) : key;
            const button = commandButton(label, isPalette ? 'theme' : 'egg', key);
            if (isPalette) button.setAttribute('aria-pressed', String(key === activeTheme(settings, new Date().getHours())));
            return button;
        }));
        (isPalette ? palette : commands).setAttribute('aria-expanded', 'true');
        menu.hidden = false;
        placeMenu();
    }
    function triggerEgg(word) {
        egg = word;
        expires = Date.now() + 6000;
        prefix = '';
        closeMenu();
        refresh();
    }
    function sync(next) {
        const enableDrag = next.ui_draggable && !settings?.ui_draggable;
        // The host mutates its settings in place; keep previous toggle values for edge detection.
        settings = {...next};
        if (enableDrag) position = readPosition();
        if (!next.ui_draggable) endDrag(false);
        if (!next.ui_interactive_controls || !next.ui_ide_frame) state.collapsed = state.minimal = false;
        if (!next.ui_easter_eggs || Date.now() >= expires) egg = undefined;
        if (!next.ui_easter_eggs) prefix = '';
        if ((menuKind === 'palette' && !next.ui_theme_switcher) ||
            (menuKind === 'commands' && !next.ui_easter_eggs) || state.collapsed) closeMenu();
        if (!next.ui_tilt && (pitch || yaw || previousFrame !== undefined)) resetTilt();
        const interactive = next.ui_interactive_controls && next.ui_ide_frame;
        for (const id of ['collapse', 'minimal', 'replay']) get(id).disabled = !interactive;
        tabs.hidden = !interactive;
        get('current-file').hidden = interactive;
        if (interactive && tabSignature !== next.ui_syntax_mode) {
            const current = next.ui_syntax_mode;
            const modes = ['modern_cpp', 'class', 'cs_modern', 'asm', 'glsl'];
            const sameFile = modes.findIndex(m => MODES[m][0] === MODES[current][0]);
            if (sameFile >= 0) modes[sameFile] = current;
            else modes.push(current);
            tabs.replaceChildren(...modes.map(m => {
                const button = commandButton(MODES[m][0], 'tab', m);
                button.setAttribute('aria-pressed', String(m === current));
                return button;
            }));
            tabSignature = current;
        }
        get('drag-grip').hidden = !next.ui_draggable;
        header.classList.toggle('draggable', next.ui_draggable);
        get('expand').hidden = !state.collapsed;
        get('restore-frame').hidden = !state.minimal;
        get('center-window').hidden = !next.ui_draggable;
        palette.hidden = !next.ui_theme_switcher;
        commands.hidden = !next.ui_easter_eggs;
        const meter = get('audio-meter');
        meter.hidden = !next.ui_audio;
        if (!next.ui_audio || !meter.textContent) setText(meter, '▁▁▁▁▁▁▁▁');
        get('editor-tools').hidden = state.collapsed || !(state.minimal || next.ui_draggable ||
            next.ui_theme_switcher || next.ui_easter_eggs || next.ui_audio);
        place();
    }
    function click(event) {
        if (paused || !settings) return;
        const button = event.target.closest?.('button[data-action]');
        const action = button?.getAttribute('data-action');
        if (!action) { if (menuKind) closeMenu(); return; }
        if (!['palette', 'commands'].includes(action)) closeMenu();
        if (action === 'palette' && settings.ui_theme_switcher) return openMenu(action);
        if (action === 'commands' && settings.ui_easter_eggs) return openMenu(action);
        if (action === 'egg' && settings.ui_easter_eggs) return triggerEgg(button.value);
        if (action === 'theme' && settings.ui_theme_switcher) {
            actions.change?.({ui_theme: button.value, ui_auto_theme: false});
        }
        if (action === 'center' && settings.ui_draggable) {
            position = {x: .5, y: .5};
            persist();
            place();
        }
        if (!settings.ui_interactive_controls) return;
        switch (action) {
            case 'tab': actions.change?.({ui_syntax_mode: button.value}); break;
            case 'collapse': state.collapsed = true; refresh(); break;
            case 'minimal': state.minimal = true; refresh(); break;
            case 'restore': state.collapsed = state.minimal = false; refresh(); break;
            case 'replay': state.replay = true; refresh(); break;
        }
    }
    function down(event) {
        if (paused || drag || !settings?.ui_draggable || event.button !== 0 || event.target.closest('button:not(:disabled)')) return;
        resetTilt();
        const bounds = mount.getBoundingClientRect();
        drag = {id: event.pointerId, dx: event.clientX - bounds.left, dy: event.clientY - bounds.top, original: position};
        header.setPointerCapture(event.pointerId);
        mount.classList.toggle('dragging', true);
        event.preventDefault();
    }
    function move(event) {
        if (settings?.ui_tilt) {
            targetYaw = (event.clientX / host.innerWidth - .5) * 6;
            targetPitch = (.5 - event.clientY / host.innerHeight) * 5;
        }
        if (!drag || event.pointerId !== drag.id) return;
        const fraction = (pixel, room) => room > 0 ? Math.min(1, Math.max(0, pixel / room)) : .5;
        position = {
            x: fraction(event.clientX - drag.dx, host.innerWidth - mount.offsetWidth),
            y: fraction(event.clientY - drag.dy, host.innerHeight - mount.offsetHeight)
        };
        place();
    }
    function resetTilt() {
        pitch = yaw = targetPitch = targetYaw = 0;
        previousFrame = undefined;
        mount.style.transform = '';
    }
    function tilt(now) {
        if (!settings?.ui_tilt || paused || drag) return;
        const dt = previousFrame === undefined ? 16 : Math.min(100, now - previousFrame);
        previousFrame = now;
        if (Math.abs(targetPitch - pitch) + Math.abs(targetYaw - yaw) < .01) return;
        const gain = 1 - Math.exp(-dt / 110);
        pitch += (targetPitch - pitch) * gain;
        yaw += (targetYaw - yaw) * gain;
        mount.style.transform = `perspective(120vmax) rotateX(${pitch.toFixed(3)}deg) rotateY(${yaw.toFixed(3)}deg)`;
    }
    function key(event) {
        if (paused) return;
        if (event.key === 'Escape') { closeMenu(); prefix = ''; return; }
        if (!settings?.ui_easter_eggs || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
        const letter = event.key.toLowerCase();
        const next = prefix + letter;
        prefix = eggs.some(word => word.startsWith(next)) ? next : eggs.some(word => word.startsWith(letter)) ? letter : '';
        if (eggs.includes(prefix)) triggerEgg(prefix);
    }
    listen(document, 'click', click);
    listen(document, 'keydown', key);
    listen(header, 'pointerdown', down);
    listen(header, 'pointerup', event => { if (event.pointerId === drag?.id) endDrag(true); });
    listen(header, 'lostpointercapture', () => endDrag(false));
    listen(header, 'pointercancel', () => endDrag(false));
    return Object.assign(state, {
        sync, place, move, tilt,
        message() {
            if (egg === 'segfault') return 'SIGSEGV · 0xDEADC0DE\n#0  clock_tick()  ·  simulated dump';
            if (egg === 'vim') return 'vim: still here? Type :q!';
            return '';
        },
        matrixBoost: () => egg === 'matrix',
        pause(value) {
            paused = value;
            if (value) { pauseTime = Date.now(); endDrag(false); prefix = ''; closeMenu(); }
            else if (egg) expires += Date.now() - pauseTime;
            previousFrame = undefined;
        },
        stop() { endDrag(false); closeMenu(); listeners.forEach(remove => remove()); }
    });
}
