function Clock() {
    let time = new Date();

    let timeZoneOffsetInMinutes = time.getTimezoneOffset();
    let timeZoneSign = timeZoneOffsetInMinutes > 0 ? '-' : '+';
    let timeZoneOffsetHours = Math.abs(Math.floor(timeZoneOffsetInMinutes / 60));

    this.hour = time.getHours();
    this.minute = time.getMinutes();
    this.second = time.getSeconds();
    this.period = (this.hour < 12) ? '"AM"' : '"PM"';
    this.day = time.getDate();
    this.weekday = en_week_days_name[time.getDay()];
    this.month = en_month_name[time.getMonth()];
    this.year = time.getFullYear();
    this.timezone = `"GMT${timeZoneSign}${timeZoneOffsetHours.toString().padStart(2, '0')}"`;
    this.unix = Math.floor(Date.now() / 1000);
    this.utc = `"${new Date(this.unix * 1000).toISOString()}"`;
}

function Settings() {
    this.clock = {
        elements: {
            hour: {
                order: 0,
                visibility: true,
                type: 'number'
            },
            minute: {
                order: 1,
                visibility: true,
                type: 'number'
            },
            second: {
                order: 2,
                visibility: true,
                type: 'number'
            },
            period: {
                order: 3,
                visibility: true,
                type: 'string'
            },
            day: {
                order: 4,
                visibility: true,
                type: 'number'
            },
            weekday: {
                order: 5,
                visibility: false,
                type: 'string'
            },
            month: {
                order: 6,
                visibility: true,
                type: 'string'
            },
            year: {
                order: 7,
                visibility: true,
                type: 'number'
            },
            timezone: {
                order: 8,
                visibility: false,
                type: 'string'
            },
            unix: {
                order: 9,
                visibility: false,
                type: 'number'
            },
            utc: {
                order: 10,
                visibility: false,
                type: 'string'
            }
        },
    }

    this.format = {
        use_12h_format: false,
        show_leading_zero: false,
        use_const_declaration: false,
        full_cpp_mode: false,
        sus_mode: false,
        semi_transparent: false,
        semi_transparent_bg_color: 'rgba(255, 255, 255, 0.5)'
    }

    this.visibility = {
        customization: {
            enable: false
        }
    }

    this.position = {
        customization: {
            enable: false
        },
        x: 'center',
        y: 'center'
    }

    this.theme = {
        customization: {
            enable: false
        },
        name: 'main'
    }

    this.font = {
        size: 32,
        family: 'inherit'
    }
}

const changeable_format_elements = ['hour', 'minute', 'second', 'day']
const possible_declarations = ['int main()', 'const']

const en_month_name = ['"January"', '"February"', '"March"', '"April"', '"May"', '"June"', '"July"', '"August"', '"September"', '"October"', '"November"', '"December"'];
const en_week_days_name = ['"Sunday"', '"Monday"', '"Tuesday"', '"Wednesday"', '"Thursday"', '"Friday"', '"Saturday"'];

const themes = {
    main: "./styles/main.css",
    code_blocks: "./styles/code_blocks.css",
    code_blocks_light: "./styles/code_blocks_light.css",
    jb_dark: "./styles/jb-dark.css",
    jb_light: "./styles/jb-light.css",
    dark_modern: "./styles/dark-modern.css",
    light_modern: "./styles/light-modern.css",
    one_dark_pro: "./styles/one-dark-pro.css",
    dracula_official: "./styles/dracula-official.css",
    github_theme: "./styles/github-theme.css",
    code_time: "./styles/code-time.css",
    rose_pine: "./styles/rose-pine.css",
    catppuccin_mocha: "./styles/catppuccin-mocha.css",
    synthwave_84: "./styles/synthwave-84.css"
}

const default_settings = new Settings()

function convertTo12hFormat(hour) {
    hour %= 12

    if (hour === 0) {
        return 12
    }

    return hour
}

function use12hFormat(flag, object) {
    if (flag) {
        object['hour'] = convertTo12hFormat(object['hour'])
    }
}

function addLeadingZero(num) {
    if (num < 10) {
        return `"${num.toString().padStart(2, '0')}"`
    }

    return `"${num}"`
}

function showLeadingZero(flag, object, elements) {
    if (flag) {
        changeable_format_elements.map((element_name) => {
            object[element_name] = addLeadingZero(object[element_name]);
            if (elements[element_name].type !== 'string') {
                elements[element_name].type = 'string';
            }
        });
    } else {
        changeable_format_elements.map((element_name) => {
            if (elements[element_name].type === 'string') {
                elements[element_name].type = 'number';
            }
        });
    }
}

function getVisibleElementsOrderedList(elements) {
    const elements_list = Object.entries(elements)

    let result = []
    for (let i = 0; i < elements_list.length; i++) {
        for (let j = 0; j < elements_list.length; j++) {
            if ((i === elements_list[j][1].order) && elements_list[j][1].visibility) {
                result.push(elements_list[j][0])
            }
        }
    }

    return result
}

function createClockElement(element_name, object, elements, settings, comma_flag = true) {
    const element = document.createElement('div');
    element.classList.add('line');

    const paragraph = document.createElement('p');
    paragraph.id = element_name;
    paragraph.classList.add('tab');

    if (settings.format.semi_transparent_text_bg) {
        paragraph.classList.add('transparent-text-bg');
    }

    let displayValue = object[element_name];
    let type = elements[element_name].type;
    let additionalClass = "";

    if (settings.format.sus_mode && element_name !== 'return' && element_name !== '0') {
        displayValue = "\"SUS\"";
        type = 'string';
        additionalClass = "string";
    } else if (settings.format.full_cpp_mode) {
        type = (element_name === 'period' || element_name === 'month' || element_name === 'timezone' || element_name === 'utc' || elements[element_name].type === 'string') ? 'string' : 'int';
        if (type === 'string') {
            additionalClass = "string";
        }
    }

    if (settings.format.full_cpp_mode) {
        paragraph.innerHTML = `<span class="keyword">${type}</span> <span class="object-key">${element_name}</span><span class="colon"> = </span> <span id="${element_name}_value" class="${elements[element_name].type} ${additionalClass}">${displayValue}</span><span class="comma">;</span>`;
    } else {
        paragraph.innerHTML = `<span class="object-key">${element_name}</span><span class="colon">:</span> <span id="${element_name}_value" class="${elements[element_name].type} ${additionalClass}">${displayValue}</span><span class="comma">;</span>`;
    }

    if (!comma_flag) {
        paragraph.getElementsByClassName('comma')[0].remove();
    }

    element.appendChild(paragraph);
    return element;
}

function createClockElements(object, elements, ordered_list, settings) {
    const last_element = ordered_list.slice(-1)[0];
    let result = [];
    ordered_list.map((element_name) => {
        if (element_name !== last_element) {
            result.push(createClockElement(element_name, object, elements, settings));
        } else {
            result.push(createClockElement(element_name, object, elements, settings, true));
        }
    });

    return result;
}

function createClock(object, settings) {
    const result = [];

    const container = document.createElement('div');
    container.classList.add('text-bg-container');
    if (settings.format.semi_transparent_text_bg) {
        container.classList.add('transparent-text-bg-container'); 
    }

    const start = document.createElement('p');
    start.innerHTML = `<span class="keyword">int</span> <span class="local-variable">main</span><span class="bracket">(</span><span class="bracket">)</span> <span class="bracket">{</span>`;
    container.appendChild(start);

    const elements = settings.visibility.customization.enable ? settings.clock.elements : default_settings.clock.elements;
    use12hFormat(settings.format.use_12h_format, object);
    showLeadingZero(settings.format.show_leading_zero, object, elements);
    const ordered_list = getVisibleElementsOrderedList(elements);
    const clock_elements = createClockElements(object, elements, ordered_list, settings);
    clock_elements.forEach(element => container.appendChild(element));

    const returnElement = document.createElement('p');
    returnElement.classList.add('tab');
    returnElement.innerHTML = `<span class="keyword">return</span> <span class="number">0</span><span class="semicolon">;</span>`;
    container.appendChild(returnElement);

    const end = document.createElement('p');
    end.innerHTML = `<span class="bracket">}</span>`;
    container.appendChild(end);

    result.push(container);
    return result;
}


function updateClockDOM(object, settings) {
    document.getElementById('object_clock').replaceChildren(...createClock(object, settings));
}

function changePosition(settings) {
    const position = settings.position.customization.enable ? settings.position : default_settings.position
    const x = position.x
    const y = position.y

    document.body.style.justifyContent = x
    document.body.style.alignItems = y
}

function changeFontSize({size}) {
    document.body.style.fontSize = size + "px"
}

function changeFontFamily({family}) {
    document.body.style.fontFamily = family
}

function changeTheme(settings) {
    const theme = settings.theme
    const font = theme.customization.enable ? settings.font : default_settings.font

    changeFontFamily(font)

    const link = document.querySelectorAll('link')[1]
    if (link.getAttribute('href') !== themes[theme.name]) {
        link.setAttribute('href', themes[theme.name])
    }
}

function updateClock(object, settings) {
    object = new Clock()

    changeFontSize(settings.font)

    changePosition(settings)

    changeTheme(settings)

    updateClockDOM(object, settings)
}

window.wallpaperPropertyListener = {
    applyUserProperties: function (properties) {
        if (properties.ui_full_cpp_mode) {
            settings.format.full_cpp_mode = properties.ui_full_cpp_mode.value;
        }
        updateClock(new Clock(), settings);
    }
};


export {Clock, Settings, updateClock}
