import test from 'node:test';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {MODES, makeListing, timeComment, formatTimezone, readClock, formatField} from '../scripts/clock.js';
import {DEFAULT_SETTINGS, THEMES, FIELDS, createSettings, applyProperties, isFieldVisible, visibleFields, activeTheme, seasonalBackground} from '../scripts/settings.js';
import {createClockView, applyAppearance, backgroundImageUrl} from '../scripts/view.js';

// A small DOM substitute tests node identity and visible text without installing a browser.
class Element {
    constructor() {
        this.children = [];
        this.style = {setProperty(key, value) { this[key] = String(value); }};
        this.listeners = new Map();
        this.offsetWidth = this.offsetHeight = 0;
        this.className = '';
        this.textContent = '';
        this.attributes = {};
        this.classList = {toggle: (name, enabled) => {
            const names = new Set(this.className.split(' ').filter(Boolean));
            if (enabled) names.add(name); else names.delete(name);
            this.className = [...names].join(' ');
        }};
    }
    addEventListener(name, fn) { this.listeners.set(name, fn); }
    removeEventListener(name) { this.listeners.delete(name); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    getBoundingClientRect() { return {left: 0, top: 0, bottom: this.offsetHeight, width: this.offsetWidth, height: this.offsetHeight}; }
}
function documentFixture() {
    const body = new Element();
    const markup = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    for (const [, id] of markup.matchAll(/ id="([^"]+)"/g)) {
        const node = new Element();
        node.id = id;
        body.append(node);
    }
    const find = (element, id) => {
        if (element.id === id) return element;
        for (const child of element.children) {
            if (typeof child === 'string') continue;
            const result = find(child, id);
            if (result) return result;
        }
    };
    return {
        body,
        addEventListener: body.addEventListener.bind(body),
        removeEventListener: body.removeEventListener.bind(body),
        createElement: () => new Element(),
        getElementById: id => find(body, id)
    };
}
function properties(values) {
    return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {value}]));
}

test('timezone preserves minutes and both signs', () => {
    for (const [offset, expected] of [[0, 'GMT+00:00'], [-180, 'GMT+03:00'], [-330, 'GMT+05:30'], [-345, 'GMT+05:45'], [210, 'GMT-03:30']]) {
        assert.equal(formatTimezone(offset), expected);
    }
});

test('clock reads a single supplied instant across year and day boundaries', () => {
    const date = new Date(2026, 11, 31, 23, 59, 59, 999);
    const clock = readClock(date);
    assert.equal(clock.year, 2026);
    assert.equal(clock.month, 'December');
    assert.equal(clock.hour, 23);
    assert.equal(clock.period, 'PM');
    assert.equal(clock.unix, Math.floor(date.getTime() / 1000));
    assert.equal(clock.utc, new Date(clock.unix * 1000).toISOString());
    const next = readClock(new Date(date.getTime() + 1));
    assert.equal(next.year, 2027);
    assert.equal(next.day, 1);
    assert.equal(next.month, 'January');
    assert.equal(next.hour, 0);
    assert.equal(next.period, 'AM');
});

test('12-hour format handles midnight and noon without changing AM/PM', () => {
    const settings = {...createSettings(), ui_use_12h_format: true};
    for (const [hour, expected] of [[0, '12'], [12, '12'], [23, '11']]) {
        assert.equal(formatField('hour', hour, settings).text, expected);
    }
});

test('original syntax preserves string/int types, leading zeros and SUS', () => {
    const settings = {...createSettings(), ui_syntax_mode: 'cpp'};
    assert.deepEqual(formatField('unix', 2200000000, settings), {type: 'int', text: '2200000000', token: 'number'});
    assert.equal(formatField('month', 'January', settings).type, 'string');
    settings.ui_show_leading_zero = true;
    assert.deepEqual(formatField('hour', 8, settings), {type: 'string', text: '"08"', token: 'string'});
    settings.ui_show_leading_zero = false;
    assert.equal(formatField('hour', 8, settings).type, 'int');
    settings.ui_sus_mode = true;
    assert.deepEqual(formatField('unix', 0, settings), {type: 'string', text: '"SUS"', token: 'string'});
    settings.ui_syntax_mode = 'modern_cpp';
    assert.equal(formatField('unix', 0, settings).type, 'auto');
    settings.ui_syntax_mode = 'c';
    assert.equal(formatField('month', 'January', settings).type, 'char');
});

test('partial settings preserve previous values, false and empty paths', () => {
    const settings = createSettings();
    applyProperties(settings, properties({customimage: 'C:/test.jpg', ui_sus_mode: true}));
    applyProperties(settings, properties({ui_font_size: 40}));
    assert.equal(settings.customimage, 'C:/test.jpg');
    assert.equal(settings.ui_sus_mode, true);
    applyProperties(settings, properties({customimage: '', ui_sus_mode: false}));
    assert.equal(settings.customimage, '');
    assert.equal(settings.ui_sus_mode, false);
    assert.deepEqual(DEFAULT_SETTINGS, createSettings());
});

test('settings reject invalid values and accept legacy Center', () => {
    const settings = createSettings();
    applyProperties(settings, properties({ui_syntax_mode: 'not-a-mode', ui_position_y: 'Center', ui_font_size: 100, ui_theme: '__proto__', ui_sus_mode: 'false', ui_position_x: 'invalid', ui_font_family: 'invalid'}));
    assert.equal(settings.ui_syntax_mode, 'modern_cpp');
    assert.equal(settings.ui_position_y, 'center');
    assert.equal(settings.ui_font_size, 92);
    assert.equal(settings.ui_theme, 'code_blocks');
    assert.equal(settings.ui_sus_mode, false);
    assert.equal(settings.ui_position_x, 'center');
    assert.equal(settings.ui_font_family, 'inherit');
    applyProperties(settings, properties({ui_font_size: NaN}));
    assert.equal(settings.ui_font_size, 92);
});

test('visibility customization can be disabled without losing selected fields', () => {
    const settings = createSettings();
    settings.ui_show_hour = false;
    settings.ui_show_utc = true;
    assert.equal(isFieldVisible('hour', settings), true);
    settings.ui_customize_visibility_enable = true;
    assert.equal(isFieldVisible('hour', settings), false);
    assert.equal(isFieldVisible('utc', settings), true);
    settings.ui_customize_visibility_enable = false;
    assert.equal(isFieldVisible('utc', settings), false);
    assert.equal(settings.ui_show_utc, true);
});

test('view retains unchanged nodes across ticks and updates values, types and visibility', () => {
    const document = documentFixture();
    const settings = {...createSettings(), ui_syntax_mode: 'cpp'};
    const view = createClockView(document);
    view.update(readClock(new Date(2026, 0, 1, 0, 0, 1)), settings);
    let node = document.getElementById('second_value');
    const rootChildren = [...document.getElementById('object_clock').children];
    assert.equal(node.textContent, '1');
    view.update(readClock(new Date(2026, 0, 1, 0, 0, 2)), settings);
    assert.equal(document.getElementById('second_value'), node);
    node = document.getElementById('second_value');
    assert.equal(node.textContent, '2');
    assert.deepEqual(document.getElementById('object_clock').children, rootChildren);
    settings.ui_show_leading_zero = true;
    view.update(readClock(new Date(2026, 0, 1, 0, 0, 2)), settings);
    node = document.getElementById('second_value');
    assert.equal(node.textContent, '"02"');
    assert.equal(node.className, 'string');
    assert.equal(document.getElementById('second').children[0].textContent, 'string ');
    settings.ui_customize_visibility_enable = true;
    for (const name of FIELDS) settings[`ui_show_${name}`] = false;
    view.update(readClock(), settings);
    for (const name of FIELDS) assert.equal(document.getElementById(name), undefined);
    assert.equal(document.getElementById('object_clock').children.length, 3);
});

test('appearance restores theme fonts and keeps panel independent from image', () => {
    const document = documentFixture();
    const settings = createSettings();
    settings.ui_theme = 'jb_light';
    settings.ui_customize_theme_enable = true;
    settings.ui_font_family = 'Iosevka, monospace';
    settings.ui_semi_transparent_bg = true;
    settings.customimage = 'C:/images/photo.jpg';
    applyAppearance(document, settings);
    assert.equal(document.body.style.fontFamily, 'Iosevka, monospace');
    assert.equal(document.getElementById('clock-theme').getAttribute('href'), THEMES.jb_light);
    assert.match(document.getElementById('workspace').className, /has-custom-image/);
    assert.match(document.getElementById('workspace').className, /transparent-text-bg-container/);
    settings.ui_customize_theme_enable = false;
    settings.ui_theme = 'main';
    settings.customimage = '';
    applyAppearance(document, settings);
    assert.equal(document.body.style.fontFamily, '');
    assert.equal(document.body.style.backgroundImage, '');
    assert.doesNotMatch(document.getElementById('workspace').className, /has-custom-image/);
    assert.equal(document.getElementById('clock-theme').getAttribute('href'), null);
    assert.match(document.getElementById('workspace').className, /transparent-text-bg-container/);
});

test('background paths safely handle spaces, hashes, quotes and network shares', () => {
    assert.equal(backgroundImageUrl(''), '');
    assert.equal(backgroundImageUrl('C:\\images\\a #1.jpg'), 'url("file:///C:/images/a%20%231.jpg")');
    assert.equal(backgroundImageUrl('file:///C:/a.jpg'), 'url("file:///C:/a.jpg")');
    assert.equal(backgroundImageUrl('file:///C:/a%20b%23c.jpg'), 'url("file:///C:/a%20b%23c.jpg")');
    assert.equal(backgroundImageUrl('C:/a%20b.jpg'), 'url("file:///C:/a%2520b.jpg")');
    assert.equal(backgroundImageUrl('//server/share/a.jpg'), 'url("file://server/share/a.jpg")');
    assert.ok(backgroundImageUrl('C:/a"b.jpg').includes('%22'));
});

test('Wallpaper Engine configuration matches runtime defaults and local assets', () => {
    const config = JSON.parse(readFileSync(new URL('../project.json', import.meta.url), 'utf8'));
    const entries = config.general.properties;
    for (const [key, expected] of Object.entries(DEFAULT_SETTINGS)) {
        assert.ok(entries[key], `missing property ${key}`);
        assert.equal(entries[key].value ?? '', expected, `default for ${key}`);
        for (const option of entries[key].options ?? []) {
            const settings = createSettings();
            applyProperties(settings, properties({[key]: option.value}));
            assert.equal(settings[key], option.value, `unsupported option ${key}=${option.value}`);
        }
    }
    for (const key of ['ui_theme', 'ui_day_theme', 'ui_night_theme']) {
        assert.deepEqual(new Set(entries[key].options.map(o => o.value)), new Set(Object.keys(THEMES)));
    }
    assert.deepEqual(new Set(entries.ui_syntax_mode.options.map(o => o.value)), new Set(Object.keys(MODES)));
    for (const path of Object.values(THEMES)) assert.ok(existsSync(new URL('../' + path, import.meta.url)), path);
    assert.ok(existsSync(new URL('../' + config.file, import.meta.url)));
    assert.ok(existsSync(new URL('../' + config.preview, import.meta.url)));
});

test('all modes retain syntax and theme classes after replacing rows', () => {
    const document = documentFixture();
    const settings = {...createSettings(), ui_syntax_mode: 'cpp'};
    const view = createClockView(document);
    const clock = readClock(new Date(2026, 10, 2, 14, 0, 48));
    const text = element => typeof element === 'string' ? element
        : element.textContent + element.children.map(text).join('');
    view.update(clock, settings);
    let hour = document.getElementById('hour');
    assert.equal(text(hour), 'int hour = 14;');
    assert.equal(hour.children[3].className, 'colon');
    settings.ui_syntax_mode = 'modern_cpp';
    view.update(clock, settings);
    assert.notEqual(document.getElementById('hour'), hour);
    hour = document.getElementById('hour');
    assert.equal(text(hour), 'auto hour = 14;');
    assert.equal(text(document.getElementById('month')), 'auto month = "November";');
    assert.equal(hour.children[3].className, 'colon');
    settings.ui_syntax_mode = 'c';
    view.update(clock, settings);
    hour = document.getElementById('hour');
    assert.equal(text(hour), 'int hour = 14;');
    assert.equal(text(document.getElementById('month')), 'char month[] = \"November\";');
});

function bootRuntime({loading = false, failOnce = false, badImage = false} = {}) {
    const document = documentFixture();
    let now = new Date(2026, 10, 2, 14, 0, 1).getTime();
    class ClockDate extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    const events = new Map();
    const intervals = new Map();
    const frames = new Map();
    const errors = [];
    let id = 0;
    const host = {
        innerWidth: 1280, innerHeight: 720,
        getComputedStyle: () => ({fontSize: '24px', paddingLeft: '30px'}),
        wallpaperRegisterAudioListener: fn => { events.set('audio', fn); },
        console: {error: (...args) => errors.push(args)},
        setInterval: callback => { intervals.set(++id, callback); return id; },
        clearInterval: key => intervals.delete(key),
        requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
        cancelAnimationFrame: key => frames.delete(key),
        addEventListener: (event, callback) => events.set(event, callback),
        removeEventListener: event => events.delete(event)
    };
    document.addEventListener = host.addEventListener;
    document.removeEventListener = host.removeEventListener;
    document.readyState = loading ? 'loading' : 'complete';
    const originalCreate = document.createElement;
    document.createElement = tag => {
        if (failOnce) { failOnce = false; throw new Error('transient DOM failure'); }
        return originalCreate(tag);
    };
    runInNewContext(readFileSync(new URL('../scripts/runtime.js', import.meta.url), 'utf8'), {window: host, document, Date: ClockDate, URL});
    if (badImage) host.wallpaperPropertyListener.applyUserProperties(properties({customimage: String.fromCharCode(0xd800)}));
    return {
        host, document, errors, events, intervals, frames,
        advance: (seconds = 1) => { now += seconds * 1000; },
        timer: () => { for (const callback of intervals.values()) callback(); },
        frame: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); }
    };
}

test('selected image survives partial theme updates and can be replaced and cleared', () => {
    const app = bootRuntime({loading: true});
    const set = values => app.host.wallpaperPropertyListener.applyUserProperties(properties(values));
    const body = app.document.body;
    set({customimage: 'C:/Фон/clock #1.jpg'});
    app.document.readyState = 'complete';
    app.events.get('DOMContentLoaded')();
    const first = 'url("file:///C:/%D0%A4%D0%BE%D0%BD/clock%20%231.jpg")';
    assert.equal(body.style.backgroundImage, first);
    set({ui_theme: 'code_blocks', ui_semi_transparent_bg: true});
    assert.equal(body.style.backgroundImage, first);
    set({customimage: 'file:///C:/second%20image.png'});
    assert.equal(body.style.backgroundImage, 'url("file:///C:/second%20image.png")');
    set({customimage: ''});
    assert.equal(body.style.backgroundImage, '');
    assert.equal(app.errors.length, 0);
});

test('shipped classic script starts repeatedly and keeps updating via timers or frames', () => {
    for (let attempt = 0; attempt < 25; attempt++) {
        const app = bootRuntime();
        const node = app.document.getElementById('second_value');
        assert.equal(node.textContent, '1');
        for (let second = 2; second <= 6; second++) {
            app.advance();
            if (attempt % 2) app.timer(); else app.frame();
            assert.equal(app.document.getElementById('second_value').textContent, String(second));
        }
        assert.equal(app.intervals.size, 1);
        assert.equal(app.frames.size, 1);
        assert.equal(app.errors.length, 0);
    }
});

test('early properties are retained until DOM is ready and engine unpause refreshes immediately', () => {
    const app = bootRuntime({loading: true});
    app.host.wallpaperPropertyListener.applyUserProperties(properties({ui_syntax_mode: 'modern_cpp'}));
    app.document.readyState = 'complete';
    app.events.get('DOMContentLoaded')();
    assert.equal(app.document.getElementById('second').children[0].textContent, 'auto ');
    app.host.wallpaperPropertyListener.setPaused(true);
    app.advance();
    app.timer();
    assert.equal(app.document.getElementById('second_value').textContent, '1');
    app.host.wallpaperPropertyListener.setPaused(false);
    assert.equal(app.document.getElementById('second_value').textContent, '2');
});

test('startup retries after DOM failure and a broken image cannot freeze clock values', () => {
    for (const options of [{failOnce: true}, {badImage: true}]) {
        const app = bootRuntime(options);
        app.advance();
        app.timer();
        assert.equal(app.document.getElementById('second_value').textContent, '2');
        app.advance();
        app.frame();
        assert.equal(app.document.getElementById('second_value').textContent, '3');
        assert.equal(app.errors.length, 1);
    }
});

test('number bases compose with 12-hour time, zero padding and SUS', () => {
    const s = {...createSettings(), ui_use_12h_format: true, ui_show_leading_zero: true};
    for (const [base, midnight, zero] of [
        ['decimal', '"12"', '"00"'], ['hex', '0x0C', '0x00'],
        ['binary', '0b00001100', '0b00000000'], ['roman', '"XII"', '"N"']
    ]) {
        s.ui_number_base = base;
        assert.equal(formatField('hour', 0, s).text, midnight);
        assert.equal(formatField('second', 0, s).text, zero);
        assert.equal(formatField('month', 'June', s).text, '"June"');
        assert.equal(formatField('hour', 23, {...s, ui_sus_mode: true}).text, '"SUS"');
    }
    assert.equal(formatField('year', 1994, s).text, '"MCMXCIV"');
    assert.equal(formatField('unix', 1000000000, s).text, '"((M))"');
    assert.equal(formatField('unix', -15, {...s, ui_number_base: 'hex'}).text, '-0xF');
});

test('every listing exposes the selected fields across all bases and preserves watch addresses', () => {
    const clock = readClock(new Date(2026, 10, 18, 15, 25, 40));
    const s = {...createSettings(), ui_customize_visibility_enable: true};
    for (const name of FIELDS) s['ui_show_' + name] = true;
    for (const mode of Object.keys(MODES)) {
        s.ui_syntax_mode = mode;
        for (const base of ['decimal', 'hex', 'binary', 'roman']) {
            s.ui_number_base = base;
            const rows = makeListing(clock, s, visibleFields(s));
            assert.deepEqual(rows.filter(r => r.key).map(r => r.key), FIELDS);
            for (const line of rows.filter(r => r.key)) {
                assert.equal(line.tokens.find(p => p.isValue).text, formatField(line.key, clock[line.key], s).text);
                const watch = line.tokens.find(p => p.watch).watch;
                assert.ok(watch.bytes > 0);
                assert.match(watch.address, /^0x[0-9A-F]+$/);
            }
        }
        const before = makeListing(clock, s, visibleFields(s)).find(r => r.key === 'second');
        s.ui_show_minute = false;
        const after = makeListing(clock, s, visibleFields(s));
        assert.deepEqual(after.find(r => r.key === 'second'), before);
        assert.ok(!after.some(r => r.key === 'minute'));
        s.ui_show_minute = true;
    }
});

test('mode-specific listings, holidays, opcode bytes and progress boundaries', () => {
    const clock = readClock(new Date(2026, 11, 31, 23, 59, 59));
    const s = {...createSettings(), ui_dynamic_comments: true, ui_progress: 'day'};
    const text = () => makeListing(clock, s, visibleFields(s)).map(l => l.tokens.map(p => p.text).join('')).join('\n');
    for (const [mode, expected] of Object.entries({
        class: /private:[\s\S]*int hour/, memory: /int\* second_ptr = \(int\*\)0x7FFF1080;  \/\/ \*second_ptr = 59/,
        template: /template <class Tag>[\s\S]*consteval bool ready\(\) noexcept/,
        asm: /MOV ECX, 59  ; second  · B9 3B 00 00 00/, glsl: /uniform float u_second;[\s\S]*u_second \/ 60\.0/
    })) {
        s.ui_syntax_mode = mode;
        assert.match(text(), expected);
        assert.match(text(), /year-end buffer/);
        assert.match(text(), /day \[█{15}░\] 99%/);
    }
    clock.second = 30;
    s.ui_progress = 'minute';
    assert.match(text(), /min \[█{8}░{8}\] 50%/);
    assert.notEqual(timeComment({...clock, month: 'July', hour: 3}), timeComment({...clock, month: 'July', hour: 13}));
});

test('day and night themes follow local time and preserve manual selection', () => {
    const s = {...createSettings(), ui_theme: 'nord', ui_auto_theme: true};
    for (const [hour, theme] of [[6, 'rose_pine'], [7, 'rose_pine_dawn'], [18, 'rose_pine_dawn'], [19, 'rose_pine']]) {
        assert.equal(activeTheme(s, hour), theme);
    }
    const doc = documentFixture(), view = createClockView(doc), clock = readClock();
    for (const hour of [6, 7, 19]) {
        view.update({...clock, hour}, s);
        assert.equal(doc.getElementById('clock-theme').getAttribute('href'), THEMES[activeTheme(s, hour)]);
    }
    s.ui_auto_theme = false;
    assert.equal(activeTheme(s, 12), 'nord');
});

test('independent editor effects keep their state through ticks and stop during pause', () => {
    const app = bootRuntime();
    const props = app.host.wallpaperPropertyListener;
    props.applyUserProperties(properties({ui_ide_frame: false, ui_status_bar: true, ui_console: true,
        ui_typewriter: true, ui_highlight: true, ui_watch: true, ui_cursor: false}));
    const get = id => app.document.getElementById(id);
    assert.ok(get('editor-head').hidden);
    assert.equal(get('status-bar').hidden, false);
    assert.equal(get('console-output').hidden, false);
    const hour = get('hour'), second = get('second_value');
    assert.match(hour.className, /typing/);
    app.advance();
    app.timer();
    assert.equal(hour, get('hour'));
    assert.equal(get('hour_value').className, 'number');
    assert.match(second.className, /flash-a/);
    assert.match(get('stdout').textContent, /14:00:02/);
    app.events.get('pointermove')({clientX: 10, clientY: 10, target: hour.children[1]});
    assert.match(get('watch-tip').textContent, /hour.*int\nsizeof  4 B\naddr    0x7FFF1000/);
    props.setPaused(true);
    assert.equal(app.intervals.size, 0);
    assert.equal(app.frames.size, 0);
    assert.ok(get('watch-tip').hidden);
    assert.match(app.document.body.className, /paused/);
    props.applyUserProperties(properties({ui_syntax_mode: 'asm', ui_ide_frame: true}));
    app.advance(5);
    assert.equal(get('filename').textContent, 'main.cpp');
    props.setPaused(false);
    props.setPaused(false);
    assert.equal(app.frames.size, 1);
    assert.equal(app.intervals.size, 1);
    assert.equal(get('filename').textContent, 'boot.asm');
    assert.equal(get('second_value').textContent, '7');
    assert.notEqual(get('hour'), hour);
    assert.match(get('hour').className, /typing/);
});

test('minute rollover plays a short build sequence only while status is enabled', () => {
    const app = bootRuntime(), state = app.document.getElementById('build-state');
    for (const [step, expected] of [[58, 'NORMAL'], [1, 'Compiling…'], [1, 'Build succeeded'], [2, 'NORMAL']]) {
        app.advance(step);
        app.timer();
        assert.equal(state.textContent, expected);
    }
});

test('Canvas modes draw with theme ink, respect frame cap, resize, and release the active loop on pause', () => {
    const app = bootRuntime();
    const canvas = app.document.getElementById('backdrop');
    const calls = {};
    const ctx = Object.fromEntries(['clearRect', 'setTransform', 'beginPath', 'arc', 'fill', 'moveTo', 'lineTo',
        'stroke', 'fillRect', 'fillText'].map(name => [name, (...args) => { (calls[name] ??= []).push(args); }]));
    canvas.getContext = () => ctx;
    let color = '#114477';
    Object.assign(app.host, {innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2,
        getComputedStyle: () => ({getPropertyValue: () => color})});
    const props = app.host.wallpaperPropertyListener;
    props.applyGeneralProperties({fps: 1});
    for (const [mode, method] of [['grid', 'fillRect'], ['graph', 'arc'], ['scope', 'lineTo'], ['rain', 'fillText']]) {
        props.applyUserProperties(properties({ui_background: mode, ui_rain_alphabet: 'hex'}));
        calls[method] = [];
        app.frame();
        assert.ok(calls[method].length, mode);
        assert.equal(ctx.strokeStyle, color);
        assert.equal(canvas.hidden, false);
        assert.equal(canvas.width, 1920);
        const count = calls.clearRect.length;
        app.frame();
        app.advance(0.1);
        app.frame();
        assert.equal(calls.clearRect.length, count);
    }
    assert.match(calls.fillText[0][0], /^[A-F0-9]{2}$/);
    color = '#f00';
    app.document.getElementById('clock-theme').listeners.get('load')();
    app.host.innerWidth = 1000;
    app.advance(); app.frame();
    assert.equal(ctx.fillStyle, color);
    assert.equal(canvas.width, 1500);
    props.applyUserProperties(properties({ui_font_size: 24}));
    app.advance(); app.frame();
    assert.deepEqual(calls.setTransform.at(-1), [0.75, 0, 0, 0.75, 0, 0]);
    assert.deepEqual(calls.clearRect.at(-1), [0, 0, 2000, 1440]);
    assert.equal(canvas.width, 1500);
    props.setPaused(true);
    const count = calls.clearRect.length;
    app.advance(); app.frame();
    assert.equal(calls.clearRect.length, count);
    props.setPaused(false);
    props.applyUserProperties(properties({ui_background: 'none'}));
    app.frame();
    assert.equal(canvas.hidden, true);
    assert.equal(calls.clearRect.length, count);
});

test('C# modes format visible fields, attributes, record signatures and LINQ with empty selections', () => {
    const s = {...createSettings(), ui_customize_visibility_enable: true, ui_number_base: 'hex'};
    for (const name of FIELDS) s['ui_show_' + name] = name === 'minute' || name === 'period';
    const clock = readClock(new Date(2026, 4, 10, 14, 31, 3));
    for (const [mode, file, signature] of [
        ['cs_modern', 'Program.cs', /var snapshot = new TimeSnapshot\([\s\S]*Minute: 0x1F,[\s\S]*readonly record struct TimeSnapshot\([\s\S]*int Minute,/],
        ['cs_class', 'SystemClock.cs', /\[System.ComponentModel.Description\("GMT.*"\)\][\s\S]*public int Minute \{ get; init; \} = 0x1F;/],
        ['cs_async', 'Program.cs', /await Task.Delay\(1000\);[\s\S]*\("Minute", 0x1F\)[\s\S]*\.Where\([\s\S]*\.Select\(/]
    ]) {
        s.ui_syntax_mode = mode;
        assert.equal(MODES[mode][0], file);
        const rows = makeListing(clock, s, visibleFields(s));
        const code = rows.map(line => line.tokens.map(p => p.text).join('')).join('\n');
        assert.match(code, signature);
        assert.deepEqual(rows.filter(r => r.key).map(r => r.key), ['minute', 'period']);
        assert.ok(!makeListing(clock, s, []).some(r => r.key));
    }
});

test('auto season follows all twelve local months, manual scenes keep their selection', () => {
    const seasons = ['winter','winter','spring','spring','spring','summer','summer','summer','autumn','autumn','autumn','winter'];
    seasons.forEach((expected, month) => {
        const clock = readClock(new Date(2027, month, 1, 0, 0));
        assert.equal(seasonalBackground('auto_season', clock.monthIndex), expected);
        assert.equal(seasonalBackground('spring', clock.monthIndex), 'spring');
    });
});

test('all additional scenes paint bounded frames and auto season selects autumn at startup in November', () => {
    const app = bootRuntime(), canvas = app.document.getElementById('backdrop');
    const draws = [];
    const ctx = Object.fromEntries(['clearRect','setTransform','beginPath','arc','fill','moveTo','lineTo','stroke',
        'strokeRect','fillRect','fillText','save','restore','translate','scale','rotate','quadraticCurveTo']
        .map(name => [name, () => draws.push(name)]));
    canvas.getContext = () => ctx;
    app.host.getComputedStyle = () => ({color: '#abcd12'});
    for (const [scene, command] of Object.entries({starfield:'lineTo',circuit:'strokeRect',matrix:'fillText',
        wireframe:'lineTo',flow:'lineTo',winter:'fillText',spring:'quadraticCurveTo',summer:'arc',
        autumn:'quadraticCurveTo',auto_season:'quadraticCurveTo'})) {
        app.host.wallpaperPropertyListener.applyUserProperties(properties({ui_background: scene}));
        draws.length = 0;
        app.advance(); app.frame();
        assert.ok(draws.includes(command), scene);
        assert.ok(draws.length < 18000, scene);
        assert.equal(canvas.getAttribute('data-scene'), scene === 'auto_season' ? 'autumn' : scene);
        assert.equal(ctx.fillStyle, '#abcd12');
    }
    assert.deepEqual(app.errors, []);
});

test('window buttons, file tabs and theme palette act through the bundled entry point', () => {
    const app = bootRuntime(), get = id => app.document.getElementById(id);
    const set = values => app.host.wallpaperPropertyListener.applyUserProperties(properties(values));
    const click = (action, value) => app.events.get('click')({target:{closest:()=>({getAttribute:()=>action,value})}});
    set({ui_interactive_controls:true,ui_theme_switcher:true,ui_typewriter:false,ui_status_bar:false});
    assert.ok(get('file-tabs').children.some(button => button.value === 'cs_modern'));
    click('tab','cs_modern');
    assert.match(get('second').children.map(el => el.textContent).join(''), /Second:/);
    click('collapse');
    assert.ok(get('object_clock').hidden);
    assert.equal(get('status-bar').hidden, false);
    click('restore');
    assert.equal(get('status-bar').hidden, true);
    click('minimal');
    assert.ok(get('editor-head').hidden);
    assert.equal(get('restore-frame').hidden, false);
    click('restore');
    click('replay');
    assert.match(get('second').className, /typing/);
    click('palette');
    assert.equal(get('editor-menu').children.length, Object.keys(THEMES).length);
    click('theme','nord');
    assert.equal(get('clock-theme').getAttribute('href'), THEMES.nord);
    assert.ok(get('editor-menu').hidden);
    set({ui_interactive_controls:false,ui_theme_switcher:false});
    assert.ok(get('file-tabs').hidden && get('pick-theme').hidden);
});

test('drag saves normalized window position, center resets it and tilt releases when disabled', () => {
    const app = bootRuntime(), get = id => app.document.getElementById(id);
    const store = new Map();
    app.host.localStorage = {getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
    const set = values => app.host.wallpaperPropertyListener.applyUserProperties(properties(values));
    const header = get('editor-head'), mount = get('clock-mount');
    mount.offsetWidth = 280; mount.offsetHeight = 220;
    header.setPointerCapture = () => {};
    const target = {closest:()=>null};
    set({ui_draggable:true,ui_tilt:true});
    header.listeners.get('pointerdown')({target,button:0,pointerId:1,clientX:20,clientY:30,preventDefault(){}});
    app.events.get('pointermove')({target,pointerId:1,clientX:780,clientY:330});
    header.listeners.get('pointerup')({pointerId:1});
    assert.deepEqual(JSON.parse([...store.values()][0]),{x:.76,y:.6});
    app.frame(); assert.match(mount.style.transform,/rotateY/);
    set({ui_draggable:false,ui_tilt:false});
    assert.equal(mount.style.transform,'');
    assert.equal(mount.style.left,'');
    set({ui_draggable:true}); assert.equal(mount.style.left,'760px');
    app.events.get('click')({target:{closest:()=>({getAttribute:()=>'center'})}});
    assert.equal(mount.style.left,'500px');
    assert.equal(mount.style.top,'250px');
});

test('diagnostics, timed commands and stereo spectrum respect individual settings and host pause', () => {
    const app = bootRuntime(), get = id => app.document.getElementById(id);
    const listener = app.host.wallpaperPropertyListener, set = values => listener.applyUserProperties(properties(values));
    const word = s => { for (const key of s) app.events.get('keydown')({key}); };
    const samples = new Float32Array(128);
    samples.fill(1,64);
    const audio = app.events.get('audio');
    audio(samples);
    assert.ok(get('audio-meter').hidden);
    set({ui_audio:true,ui_warnings:true,ui_sus_mode:true,ui_easter_eggs:true});
    audio(samples);
    const meter = get('audio-meter').textContent;
    assert.match(meter,/^[▅▆]{8}$/);
    const identifier = get('second').children.find(el => el.clockDiagnostic);
    assert.match(identifier.className,/error/);
    app.events.get('pointermove')({target:identifier,clientX:10,clientY:10});
    assert.match(get('watch-tip').textContent,/CLK002/);
    word('segfault'); assert.match(get('stdout').textContent,/SIGSEGV/);
    listener.setPaused(true); audio(new Float32Array(128)); app.advance(15);
    assert.equal(get('audio-meter').textContent,meter);
    listener.setPaused(false);
    assert.equal(get('console-output').hidden,false);
    audio(new Float32Array(128)); assert.equal(get('audio-meter').textContent,'▁▁▁▁▁▁▁▁');
    word('vim'); assert.match(get('stdout').textContent,/:q!/);
    get('backdrop').getContext = () => null;
    word('matrix'); assert.equal(get('backdrop').getAttribute('data-scene'),'matrix');
    app.advance(7); app.timer(); assert.ok(get('backdrop').hidden);
    assert.ok(get('console-output').hidden);
    set({ui_audio:false,ui_warnings:false,ui_easter_eggs:false});
    assert.equal(get('second').children.some(el=>el.clockDiagnostic),false);
    word('vim'); assert.ok(get('console-output').hidden);
    assert.deepEqual(app.errors,[]);
});
