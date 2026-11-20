import {MODES} from './clock.js';

export const FIELDS = Object.freeze(['hour', 'minute', 'second', 'period', 'day', 'weekday', 'month', 'year', 'timezone', 'unix', 'utc']);

export const THEMES = Object.freeze({
    main: './styles/main.css',
    code_blocks: './styles/code_blocks.css',
    code_blocks_light: './styles/code_blocks_light.css',
    jb_dark: './styles/jb-dark.css',
    jb_light: './styles/jb-light.css',
    dark_modern: './styles/dark-modern.css',
    light_modern: './styles/light-modern.css',
    one_dark_pro: './styles/one-dark-pro.css',
    dracula_official: './styles/dracula-official.css',
    github_theme: './styles/github-theme.css',
    code_time: './styles/code-time.css',
    rose_pine: './styles/rose-pine.css',
    catppuccin_mocha: './styles/catppuccin-mocha.css',
    rose_pine_dawn: './styles/rose-pine-dawn.css',
    gruvbox: './styles/gruvbox.css',
    tokyo_night: './styles/tokyo-night.css',
    nord: './styles/nord.css',
    monokai_pro: './styles/monokai-pro.css',
    blueprint: './styles/blueprint.css',
    retro_crt: './styles/retro-crt.css',
    synthwave_84: './styles/synthwave-84.css'
});

const FONTS = ['inherit', 'Consolas, monospace', 'Courier New, monospace', 'JetBrains Mono, monospace', 'Hack NFM, monospace', 'Iosevka, monospace', 'Impact, monospace', 'Comic sans, monospace'];
const POSITIONS = ['flex-start', 'center', 'flex-end'];
const OPTIONS = new Map(Object.entries({
    ui_syntax_mode: Object.keys(MODES),
    ui_number_base: ['decimal', 'binary', 'hex', 'roman'],
    ui_progress: ['off', 'minute', 'day'],
    ui_background: ['none', 'grid', 'graph', 'scope', 'rain', 'starfield', 'circuit', 'matrix',
        'wireframe', 'flow', 'auto_season', 'winter', 'spring', 'summer', 'autumn'],
    ui_rain_alphabet: ['cpp', 'binary', 'hex'],
    ui_theme: Object.keys(THEMES),
    ui_day_theme: Object.keys(THEMES),
    ui_night_theme: Object.keys(THEMES),
    ui_font_family: FONTS
}));

export const DEFAULT_SETTINGS = Object.freeze({
    customimage: '',
    ui_background_interval: 5,
    ui_syntax_mode: 'cpp',
    ui_number_base: 'decimal',
    ui_ide_frame: true,
    ui_ide_panel_background: true,
    ui_photo_panel_transparency: 6,
    ui_cursor: true,
    ui_status_bar: true,
    ui_console: false,
    ui_dynamic_comments: false,
    ui_progress: 'off',
    ui_watch: false,
    ui_highlight: false,
    ui_typewriter: true,
    ui_interactive_controls: false,
    ui_draggable: false,
    ui_tilt: false,
    ui_theme_switcher: false,
    ui_warnings: false,
    ui_easter_eggs: false,
    ui_audio: false,
    ui_auto_theme: false,
    ui_day_theme: 'rose_pine_dawn',
    ui_night_theme: 'rose_pine',
    ui_custom_effect_color: false,
    ui_effect_color: '0.7 0.85 1',
    ui_background: 'none',
    ui_rain_alphabet: 'cpp',
    ui_sus_mode: false,
    ui_semi_transparent_bg: false,
    ui_font_size: 64,
    ui_use_12h_format: false,
    ui_show_leading_zero: false,
    ui_customize_position_enable: false,
    ui_position_x: 'center',
    ui_position_y: 'center',
    ui_customize_visibility_enable: false,
    ...Object.fromEntries(FIELDS.map(name => [`ui_show_${name}`, !['weekday', 'timezone', 'unix', 'utc'].includes(name)])),
    ui_theme: 'code_blocks',
    ui_customize_theme_enable: false,
    ui_font_family: 'inherit'
});

export function createSettings() {
    return {...DEFAULT_SETTINGS};
}

export function effectColorCss(value) {
    const channels = value.trim().split(/\s+/).map(Number);
    if (channels.length !== 3 || !channels.every(n => Number.isFinite(n) && n >= 0 && n <= 1)) return '';
    return `rgb(${channels.map(n => Math.round(n * 255)).join(', ')})`;
}

// Wallpaper Engine sends partial updates. Keep previous values for omitted properties.
export function applyProperties(settings, properties) {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        let value = properties?.[key]?.value;
        if (typeof value !== typeof DEFAULT_SETTINGS[key]) continue;
        if (OPTIONS.has(key)) {
            if (!OPTIONS.get(key).includes(value)) continue;
        } else if (key === 'ui_position_x' || key === 'ui_position_y') {
            if (typeof value === 'string') value = value.toLowerCase();
            if (!POSITIONS.includes(value)) continue;
        } else if (key === 'ui_font_size') {
            if (!Number.isFinite(value)) continue;
            value = Math.round(Math.max(16, Math.min(92, value)));
        } else if (key === 'ui_photo_panel_transparency') {
            if (!Number.isFinite(value)) continue;
            value = Math.round(Math.max(0, Math.min(100, value)));
        } else if (key === 'ui_background_interval') {
            if (!Number.isFinite(value)) continue;
            value = Math.round(Math.max(1, Math.min(120, value)));
        } else if (key === 'ui_effect_color' && !effectColorCss(value)) {
            continue;
        }
        settings[key] = value;
    }
}

export function isFieldVisible(name, settings) {
    const source = settings.ui_customize_visibility_enable ? settings : DEFAULT_SETTINGS;
    return source[`ui_show_${name}`];
}

export function visibleFields(settings) {
    return FIELDS.map((name, index) => ({name, index})).filter(({name}) => isFieldVisible(name, settings));
}

export function activeTheme(settings, hour) {
    if (!settings.ui_auto_theme) return settings.ui_theme;
    return hour >= 7 && hour < 19 ? settings.ui_day_theme : settings.ui_night_theme;
}

export function seasonalBackground(mode, monthIndex) {
    if (mode !== 'auto_season') return mode;
    return ['winter', 'spring', 'summer', 'autumn'][Math.floor(((monthIndex + 1) % 12) / 3)];
}
