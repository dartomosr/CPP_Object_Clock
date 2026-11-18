const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PADDED_FIELDS = new Set(['hour', 'minute', 'second', 'day']);

export function formatTimezone(offsetMinutes) {
    const absolute = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
    const minutes = String(absolute % 60).padStart(2, '0');
    return `GMT${offsetMinutes > 0 ? '-' : '+'}${hours}:${minutes}`;
}

// All fields come from one instant, including Unix and UTC.
export function readClock(date = new Date()) {
    return {
        hour: date.getHours(),
        minute: date.getMinutes(),
        second: date.getSeconds(),
        period: date.getHours() < 12 ? 'AM' : 'PM',
        day: date.getDate(),
        weekday: WEEKDAYS[date.getDay()],
        month: MONTHS[date.getMonth()],
        monthIndex: date.getMonth(),
        year: date.getFullYear(),
        timezone: formatTimezone(date.getTimezoneOffset()),
        unix: Math.floor(date.getTime() / 1000),
        utc: new Date(Math.floor(date.getTime() / 1000) * 1000).toISOString()
    };
}

// Parentheses multiply a Roman group by 1000, so Unix timestamps stay compact.
function roman(value) {
    if (value === 0) return 'N';
    if (value < 0) return '-' + roman(-value);
    if (value >= 4000) {
        return `(${roman(Math.floor(value / 1000))})${value % 1000 ? roman(value % 1000) : ''}`;
    }
    let result = '';
    for (const [amount, symbol] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) {
        while (value >= amount) { result += symbol; value -= amount; }
    }
    return result;
}

export function formatField(name, value, settings) {
    if (name === 'hour' && settings.ui_use_12h_format) value = value % 12 || 12;
    const pad = settings.ui_show_leading_zero && PADDED_FIELDS.has(name);
    const base = settings.ui_number_base;
    if (settings.ui_sus_mode) value = 'SUS';
    else if (typeof value === 'number') {
        if (base === 'roman') value = roman(value);
        else if (base === 'hex' || base === 'binary') {
            const binary = base === 'binary';
            const digits = Math.abs(value).toString(binary ? 2 : 16).toUpperCase();
            const width = pad ? (binary ? 8 : 2) : 1;
            return {type: settings.ui_syntax_mode === 'modern_cpp' ? 'auto' : 'int',
                text: (value < 0 ? '-' : '') + (binary ? '0b' : '0x') + digits.padStart(width, '0'), token: 'number'};
        } else if (pad) value = String(value).padStart(2, '0');
    }
    const string = typeof value === 'string';
    const type = string && settings.ui_syntax_mode === 'c' ? 'char' : string ? 'string' : 'int';
    return {type: settings.ui_syntax_mode === 'modern_cpp' ? 'auto' : type,
        text: string ? JSON.stringify(value) : String(value), token: string ? 'string' : 'number'};
}

export const MODES = Object.freeze({
    c: ['main.c', 'C17'], cpp: ['main.cpp', 'C++23'], modern_cpp: ['main.cpp', 'C++23'],
    class: ['clock.hpp', 'C++23'], memory: ['memory.cpp', 'C++23'],
    template: ['traits.hpp', 'C++23'], asm: ['boot.asm', 'x86-32'], glsl: ['shader.frag', 'GLSL'],
    cs_modern: ['Program.cs', 'C#'], cs_class: ['SystemClock.cs', 'C#'], cs_async: ['Program.cs', 'C#']
});

export function timeComment(clock) {
    if (clock.month === 'January' && clock.day === 1) return 'New year. Fresh stack.';
    if (clock.month === 'October' && clock.day === 31) return 'Checking for dangling pointers...';
    if (clock.month === 'December' && clock.day === 31) return 'Flushing the year-end buffer.';
    if (clock.hour < 5) return 'Night shift. Even the compiler is quiet.';
    if (clock.hour < 12) return 'Coffee acquired. Resuming main().';
    if (clock.hour < 14) return 'Lunch break. Threads may yield.';
    if (clock.hour < 19) return 'Hot path is warm. Keep shipping.';
    return 'Evening build. One last commit.';
}

const token = (kind, text, watch) => ({kind, text, watch});
const row = (indent, ...tokens) => ({indent, tokens});
const kw = text => token('keyword', text);
const punct = text => token('bracket', text);
const comment = text => token('comment', text);
const func = text => token('local-variable', text);
const REGISTERS = ['EAX', 'EBX', 'ECX', 'EDX', 'ESI', 'EDI', 'EBP'];

function fieldAddress(index) {
    return '0x' + (0x7fff1000 + index * 64).toString(16).toUpperCase();
}

function fieldRow(name, index, value, mode, raw) {
    const address = fieldAddress(index);
    const string = value.token === 'string';
    const length = string ? JSON.parse(value.text).length + 1 : 4;
    const chars = `char[${length}]`;
    const watch = (label, type, bytes) => token('object-key', label, {type, bytes, address});
    const type = string ? 'std::string' : 'int';
    const size = string ? 32 : 4; // Modeled x64 release ABI for std::string.
    const val = token(value.token, value.text);
    val.isValue = true;
    const assign = token('colon', ' = ');
    const end = token('comma', ';');
    let line;
    if (mode === 'asm') {
        const reg = REGISTERS[index % REGISTERS.length];
        const immediate = string ? parseInt(address, 16) : raw;
        const opcode = [0xb8 + ['EAX', 'ECX', 'EDX', 'EBX', 'ESP', 'EBP', 'ESI', 'EDI'].indexOf(reg)];
        for (let i = 0; i < 4; i++) opcode.push((immediate >>> (8 * i)) & 255);
        const bytes = opcode.map(byte => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
        line = row(1, kw('MOV '), watch(reg, 'uint32_t', 4), punct(', '));
        if (string) line.tokens.push(token('number', address), comment('  ; ' + name + ' → '), val);
        else line.tokens.push(val, comment('  ; ' + name));
        line.tokens.push(comment('  · ' + bytes));
    } else if (mode === 'memory') {
        const base = string ? 'const char*' : 'int';
        const nameToken = watch(name + '_ptr', base + '*', 8);
        line = row(1, kw(base + '* '), nameToken, assign, punct('(' + base + '*)'),
            token('number', address), end, comment('  // *'), watch(name + '_ptr', base + '*', 8), comment(' = '), val);
    } else if (mode === 'glsl') {
        // GLSL has no strings. Keep text fields as annotated host-side values.
        line = string ? row(0, comment('// '), watch('u_' + name, chars, length), assign, val)
            : row(0, kw('uniform float '), watch('u_' + name, 'float', 4), end, comment('  // '), val);
    } else {
        let declaration = value.type;
        if (mode === 'template') declaration = 'static constexpr ' + (string ? 'const char*' : 'int');
        const charArray = mode === 'c' && string;
        const pointer = string && (mode === 'template' || mode === 'modern_cpp');
        const storageType = charArray ? chars : pointer ? 'const char*' : type;
        const storageSize = charArray ? length : pointer ? 8 : size;
        line = row(1, kw(declaration + ' '), watch(name, storageType, storageSize),
            punct(charArray ? '[]' : ''), assign, val, end);
    }
    return {...line, key: name};
}

export function makeListing(clock, settings, visible) {
    const mode = settings.ui_syntax_mode;
    if (mode.startsWith('cs_')) return makeCSharpListing(clock, settings, visible);
    let head, tail;
    switch (mode) {
        case 'class':
            head = [row(0, kw('class '), func('TimeSnapshot'), punct(' {')), row(0, kw('public:')),
                row(1, func('TimeSnapshot'), punct('() = '), kw('default'), punct(';')), row(0, kw('private:'))];
            tail = [row(0, punct('};'))];
            break;
        case 'memory':
            head = [row(0, kw('void '), func('inspect'), punct('() {'))];
            tail = [row(0, punct('}'))];
            break;
        case 'template':
            head = [row(0, kw('template '), punct('<'), kw('class '), func('Tag'), punct('>')),
                row(0, kw('struct '), func('ClockTraits'), punct(' {'))];
            tail = [row(1, kw('static consteval bool '), func('ready'), punct('() '), kw('noexcept'), punct(' { '), kw('return true'), punct('; }')), row(0, punct('};'))];
            break;
        case 'asm':
            head = [row(0, kw('section '), func('.text')), row(0, func('clock_tick:'))];
            tail = [row(1, kw('RET'))];
            break;
        case 'glsl':
            head = [row(0, kw('precision mediump float'), punct(';'))];
            tail = [row(0, kw('void '), func('main'), punct('() {'))];
            tail.push(row(1, token('object-key', 'gl_FragColor', {type: 'vec4', bytes: 16, address: '0x7FFF2000'}),
                punct(' = '), func('vec4'), punct('(')));
            for (const [name, range] of [['hour', '24.0'], ['minute', '60.0'], ['second', '60.0']]) {
                const field = visible.find(field => field.name === name);
                const numeric = field && formatField(name, clock[name], settings).token === 'number';
                const channel = numeric ? [token('object-key', 'u_' + name, {type: 'float', bytes: 4, address: fieldAddress(field.index)}),
                    punct(' / '), token('number', range)] : [token('number', '0.0')];
                tail.push(row(2, ...channel, punct(',')));
            }
            tail.push(row(2, token('number', '1.0'), punct(');')), row(0, punct('}')));
            break;
        default:
            head = [row(0, kw('int '), func('main'), punct('() {'))];
            tail = [row(1, kw('return '), token('number', '0'), token('semicolon', ';')), row(0, punct('}'))];
    }
    const prefix = mode === 'asm' ? '; ' : '// ';
    const rows = [...head];
    if (settings.ui_dynamic_comments) rows.push(row(mode === 'glsl' ? 0 : 1, comment(prefix + timeComment(clock))));
    for (const {name, index} of visible) {
        const value = formatField(name, clock[name], settings);
        const raw = name === 'hour' && settings.ui_use_12h_format ? clock.hour % 12 || 12 : clock[name];
        rows.push(fieldRow(name, index, value, mode, raw));
    }
    rows.push(...progressRows(clock, settings.ui_progress, prefix, mode === 'glsl' ? 0 : 1));
    return rows.concat(tail);
}

function progressRows(clock, progress, prefix, indent) {
    if (progress !== 'off') {
        const day = progress === 'day';
        const elapsed = day ? clock.hour * 3600 + clock.minute * 60 + clock.second : clock.second;
        const fraction = elapsed / (day ? 86400 : 60);
        const blocks = Math.floor(fraction * 16);
        return [row(indent, comment(`${prefix}${day ? 'day' : 'min'} [${'█'.repeat(blocks)}${'░'.repeat(16 - blocks)}] ${Math.floor(fraction * 100)}%`))];
    }
    return [];
}

function makeCSharpListing(clock, settings, visible) {
    const mode = settings.ui_syntax_mode;
    const rows = [], parameters = [];
    if (settings.ui_dynamic_comments) rows.push(row(0, comment('// ' + timeComment(clock))));
    if (mode === 'cs_modern') {
        rows.push(row(0, kw('var '), func('snapshot'), punct(' = '), kw('new '), func('TimeSnapshot'), punct('(')));
    } else if (mode === 'cs_class') {
        rows.push(row(0, punct('['), func('System.ComponentModel.Description'), punct('('),
            token('string', JSON.stringify(clock.timezone)), punct(')]')),
            row(0, kw('public class '), func('SystemClock')), row(0, punct('{')));
    } else {
        rows.push(row(0, kw('await '), func('Task.Delay'), punct('('), token('number', '1000'), punct(');')),
            row(0, kw('var '), func('fields'), punct(' = '), kw('new '), punct('('),
                kw('string '), func('Name'), punct(', '), kw('object '), func('Value'), punct(')[]')),
            row(0, punct('{')));
    }
    visible.forEach(({name, index}, i) => {
        const value = formatField(name, clock[name], settings);
        const label = name[0].toUpperCase() + name.slice(1);
        const type = value.token === 'string' ? 'string' : name === 'unix' ? 'long' : 'int';
        const symbol = token('object-key', label, {type, bytes: type === 'int' ? 4 : 8, address: fieldAddress(index)});
        const literal = {...token(value.token, value.text), isValue: true};
        const comma = i === visible.length - 1 ? '' : ',';
        let line;
        if (mode === 'cs_class') {
            line = row(1, kw('public ' + type + ' '), symbol, punct(' { '), kw('get'), punct('; '),
                kw('init'), punct('; } = '), literal, punct(';'));
        } else if (mode === 'cs_modern') {
            line = row(1, symbol, punct(': '), literal, punct(comma));
            parameters.push(row(1, kw(type + ' '), token('object-key', label, symbol.watch), punct(comma)));
        } else {
            line = row(1, punct('("'), symbol, punct('", '));
            if (type === 'long') line.tokens.push(punct('('), kw('long'), punct(')'));
            line.tokens.push(literal, punct(')' + comma));
        }
        rows.push({...line, key: name});
    });
    if (mode === 'cs_modern') {
        rows.push(row(0, punct(');')), row(0, func('Console.WriteLine'), punct('('),
            token('string', '$"{snapshot}"'), punct(');')),
            row(0, kw('readonly record struct '), func('TimeSnapshot'), punct('(')), ...parameters, row(0, punct(');')));
    } else if (mode === 'cs_class') rows.push(row(0, punct('}')));
    else rows.push(row(0, punct('}.'), func('Where'), punct('(f => f.Value '), kw('is not null'), punct(')')),
        row(1, punct('.'), func('Select'), punct('(f => '), token('string', '$"{f.Name}={f.Value}"'), punct(')')),
        row(1, punct('.'), func('ToArray'), punct('();')));
    return rows.concat(progressRows(clock, settings.ui_progress, '// ', 0));
}
