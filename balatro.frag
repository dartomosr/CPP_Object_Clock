precision mediump float;

// Авто-uniform’ы
uniform vec2  iResolution;
uniform float iTime;

// UI-управляемые uniform’ы
uniform float SPIN_ROTATION;
uniform float SPIN_SPEED;
uniform float SPIN_EASE;
uniform float SPIN_AMOUNT;
uniform bool  IS_ROTATE;
uniform vec2  OFFSET;
uniform vec4  COLOUR_1;
uniform vec4  COLOUR_2;
uniform vec4  COLOUR_3;
uniform float PIXEL_FILTER;
uniform float CONTRAST;
uniform float LIGHTING;

const float PI = 3.14159265359;

vec4 effect(vec2 screenSize, vec2 fragCoord) {
    float pixel_size = length(screenSize) / PIXEL_FILTER;
    vec2 uv = (floor(fragCoord * (1.0 / pixel_size)) * pixel_size
               - 0.5 * screenSize) / length(screenSize)
               - OFFSET;
    float uv_len = length(uv);

    float speed = SPIN_ROTATION * SPIN_EASE * 0.2;
    if(IS_ROTATE) {
        speed = iTime * speed;
    }
    speed += 302.2;

    float angle = atan(uv.y, uv.x)
                + speed
                - SPIN_EASE * 20.0 * (SPIN_AMOUNT * uv_len + (1.0 - SPIN_AMOUNT));

    vec2 mid = (screenSize / length(screenSize)) * 0.5;
    uv = vec2(
        uv_len * cos(angle) + mid.x,
        uv_len * sin(angle) + mid.y
    ) - mid;

    uv *= 30.0;
    speed = iTime * SPIN_SPEED;
    vec2 uv2 = vec2(uv.x + uv.y);

    for(int i = 0; i < 5; i++) {
        uv2 += sin(max(uv.x, uv.y)) + uv;
        uv  += 0.5 * vec2(
            cos(5.1123314 + 0.353 * uv2.y + speed * 0.131121),
            sin(uv2.x - 0.113 * speed)
        );
        uv  -= cos(uv.x + uv.y) - sin(uv.x * 0.711 - uv.y);
    }

    float contrast_mod = 0.25 * CONTRAST + 0.5 * SPIN_AMOUNT + 1.2;
    float paint_res    = clamp(length(uv) * 0.035 * contrast_mod, 0.0, 2.0);
    float c1p = max(0.0, 1.0 - contrast_mod * abs(1.0 - paint_res));
    float c2p = max(0.0, 1.0 - contrast_mod * abs(paint_res));
    float c3p = 1.0 - min(1.0, c1p + c2p);

    float light = (LIGHTING - 0.2) * max(c1p * 5.0 - 4.0, 0.0)
                + LIGHTING * max(c2p * 5.0 - 4.0, 0.0);

    vec4 col_mix = COLOUR_1 * c1p
                 + COLOUR_2 * c2p
                 + vec4(COLOUR_3.rgb * c3p, COLOUR_1.a * c3p);

    vec4 base = mix(col_mix, COLOUR_1, 0.3 / CONTRAST);
    return base + light;
}

void main() {
    gl_FragColor = effect(iResolution, gl_FragCoord.xy);
}
