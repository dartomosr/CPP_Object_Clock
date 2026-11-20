export function createBackdrop(canvas, host) {
    let mode = 'none', alphabet = 'cpp', context, themeInk, customInk = '';
    let sceneScale = 1;
    let width, height, ratio, previous, elapsed = 0;
    let targetX = 0, targetY = 0, driftX = 0, driftY = 0;
    const nodes = Array.from({length: 52}, (_, i) => ({
        x: (i * 0.618034 + 0.17) % 1, y: (i * 0.414214 + 0.31) % 1,
        speed: 0.25 + (i % 5) * 0.11
    }));
    function segment(x, y, endX, endY) {
        context.moveTo(x, y);
        context.lineTo(endX, endY);
    }
    function grid() {
        const step = 72, offset = (elapsed * 3) % step;
        context.globalAlpha = 0.18;
        context.beginPath();
        for (let x = offset; x < width; x += step) segment(x, 0, x, height);
        for (let y = offset; y < height; y += step) segment(0, y, width, y);
        context.stroke();
        context.globalAlpha = 0.5;
        context.font = '10px monospace';
        for (let x = offset; x < width; x += step * 4) {
            for (let y = offset; y < height; y += step * 4) {
                context.fillRect(x - 2, y - 2, 4, 4);
                context.fillText(`${Math.round((x - offset) / step)}:${Math.round((y - offset) / step)}`, x + 6, y - 6);
            }
        }
    }
    function graph(delta) {
        const ease = 1 - Math.exp(-4 * delta);
        driftX += (targetX - driftX) * ease;
        driftY += (targetY - driftY) * ease;
        const count = Math.min(nodes.length, Math.max(14, Math.ceil(width * height / 32000)));
        const reach = Math.min(260, Math.max(130, width / 7));
        for (let i = 0; i < count; i++) {
            const n = nodes[i], angle = elapsed * 0.11 * n.speed + i;
            n.px = n.x * width + Math.sin(angle) * 36 + driftX * n.speed;
            n.py = n.y * height + Math.cos(angle) * 30 + driftY * n.speed;
            context.globalAlpha = 0.65;
            context.beginPath();
            context.arc(n.px, n.py, 2, 0, 2 * Math.PI);
            context.fill();
            for (let j = 0; j < i; j++) {
                const other = nodes[j];
                const distance = Math.hypot(n.px - other.px, n.py - other.py);
                if (distance >= reach) continue;
                context.globalAlpha = (1 - distance / reach) * 0.44;
                context.beginPath();
                segment(n.px, n.py, other.px, other.py);
                context.stroke();
            }
        }
    }
    function scope(wallTime) {
        // Read the same wall clock as the listing. Each integer second launches a pulse.
        const phase = (wallTime % 1000) / 1000;
        context.beginPath();
        context.globalAlpha = 0.7;
        const center = height * 0.68, period = 230;
        for (let x = 0; x <= width + 2; x += 2) {
            const p = (phase - x / period) - Math.floor(phase - x / period);
            const spike = Math.exp(-((p - 0.09) ** 2) / 0.00035) - 0.4 * Math.exp(-((p - 0.15) ** 2) / 0.0009);
            const y = center - spike * Math.min(height * 0.09, 68);
            if (!x) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.stroke();
    }
    function rain() {
        const symbols = alphabet === 'binary' ? '01' : '{};*&<>[]:';
        const spacing = Math.max(32, width / 80);
        context.font = '13px monospace';
        for (let col = 0; col < width / spacing; col++) {
            const step = Math.floor(elapsed * (2 + col % 4));
            const lineCount = Math.ceil(height / 19) + 6;
            const head = (col * 47 + step) % lineCount;
            for (let tail = 0; tail < 6; tail++) {
                const key = col * 79 + (step - tail) * 31;
                const char = alphabet === 'hex' ? (key & 255).toString(16).toUpperCase().padStart(2, '0')
                    : symbols[Math.abs(key) % symbols.length];
                context.globalAlpha = (6 - tail) * 0.085;
                context.fillText(char, col * spacing + 8, (head - tail) * 19);
            }
        }
    }
    const particles = Array.from({length: 112}, (_, i) => ({
        x: ((i + 1) * 0.754877666) % 1, y: ((i + 1) * 0.569840296) % 1,
        depth: ((i + 1) * 0.618033989) % 1, spin: i * 2.399963
    }));

    function starfield() {
        context.beginPath();
        context.globalAlpha = 0.62;
        const cx = width / 2 + driftX, cy = height / 2 + driftY;
        for (const p of particles) {
            const z = 1.04 - ((p.depth + elapsed * .09) % 1);
            const dx = (p.x - .5) * width, dy = (p.y - .5) * height;
            segment(cx + dx / z, cy + dy / z, cx + dx / (z + .025), cy + dy / (z + .025));
        }
        context.stroke();
    }

    function circuit() {
        const lanes = Math.min(46, Math.ceil(height / 30) + 1);
        for (let i = 0; i < lanes; i++) {
            const p = particles[i], y = p.y * height, x = p.x * width - 60;
            const length = 80 + p.depth * Math.min(width, 560), bend = 28 + 40 * p.y;
            context.globalAlpha = .20;
            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(x + length, y);
            context.lineTo(x + length + bend, y + bend);
            context.lineTo(x + length + bend + 54, y + bend);
            context.stroke();
            context.strokeRect(x - 4, y - 4, 8, 8);
            const distance = (elapsed * 35 + i * 89) % (length + bend + 54);
            const pulseY = y + Math.max(0, Math.min(bend, distance - length));
            context.globalAlpha = .80;
            context.fillRect(x + distance - 2, pulseY - 2, 4, 4);
        }
    }

    function matrix() {
        const pitch = Math.max(20, width / 100), rowHeight = 19;
        const glyphs = '01ABCDEF:<>{}=+アカサタナハマヤラワ';
        context.font = '15px monospace';
        for (let col = 0; col < width / pitch; col++) {
            const p = particles[col % particles.length];
            const trail = 6 + Math.floor(9 * p.depth);
            const rowCount = Math.ceil(height / rowHeight) + trail;
            const phase = elapsed * (4 + 6 * p.y) + p.depth * rowCount;
            const head = phase % rowCount;
            for (let j = 0; j < trail; j++) {
                const y = (head - j) * rowHeight;
                if (y < 0 || y > height + rowHeight) continue;
                const seed = Math.imul(Math.floor(phase * .8) + 1, 73856093) ^ Math.imul(col + 1, 19349663) ^ Math.imul(j + 1, 83492791);
                const index = (seed ^ (seed >>> 13)) >>> 0;
                context.globalAlpha = .76 * (1 - j / trail) ** 2;
                context.fillText(glyphs[index % glyphs.length], col * pitch, y);
            }
        }
    }

    const cube = {vertices: [], edges: []};
    for (let i = 0; i < 8; i++) {
        cube.vertices.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1]);
        for (const axis of [1, 2, 4]) if (!(i & axis)) cube.edges.push([i, i | axis]);
    }
    const octahedron = {
        vertices: [[1.5,0,0],[-1.5,0,0],[0,1.5,0],[0,-1.5,0],[0,0,1.5],[0,0,-1.5]],
        edges: [[0,2],[0,3],[0,4],[0,5],[1,2],[1,3],[1,4],[1,5],[2,4],[2,5],[3,4],[3,5]]
    };
    function wireframe() {
        for (let i = 0; i < 8; i++) {
            const shape = i % 2 ? cube : octahedron, p = particles[i];
            const a = elapsed * .13 + p.spin, b = a * .64;
            const points = shape.vertices.map(([x, y, z]) => {
                const u = x * Math.cos(a) - z * Math.sin(a);
                const v = x * Math.sin(a) + z * Math.cos(a);
                const depth = 4 + y * Math.sin(b) + v * Math.cos(b);
                const scale = (100 + 115 * p.depth) / depth;
                return [width * p.x + u * scale, height * p.y + (y * Math.cos(b) - v * Math.sin(b)) * scale];
            });
            context.globalAlpha = .22 + p.depth * .18;
            context.beginPath();
            for (const [from, to] of shape.edges) segment(...points[from], ...points[to]);
            context.stroke();
        }
    }

    // Interpolate lattice gradients with Perlin's quintic fade.
    const gradients = Array.from({length: 8}, (_, i) => [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)]);
    const fade = t => t * t * t * (t * (6 * t - 15) + 10);
    const mix = (a, b, t) => a + (b - a) * t;
    function gradient(i, j, dx, dy) {
        const hash = Math.imul(i, 374761393) + Math.imul(j, 668265263);
        const [gx, gy] = gradients[Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 29];
        return gx * dx + gy * dy;
    }
    function noise(x, y) {
        const ix = Math.floor(x), iy = Math.floor(y), dx = x - ix, dy = y - iy;
        const u = fade(dx);
        return mix(mix(gradient(ix, iy, dx, dy), gradient(ix + 1, iy, dx - 1, dy), u),
            mix(gradient(ix, iy + 1, dx, dy - 1), gradient(ix + 1, iy + 1, dx - 1, dy - 1), u), fade(dy));
    }
    function flow() {
        context.globalAlpha = .31;
        context.beginPath();
        for (const p of particles) {
            let x = p.x * width, y = p.y * height;
            context.moveTo(x, y);
            for (let i = 0; i < 18; i++) {
                const angle = noise(x / 240 + elapsed * .05, y / 240) * 8 + p.depth * .3;
                x += Math.cos(angle) * 8;
                y += Math.sin(angle) * 8;
                context.lineTo(x, y);
            }
        }
        context.stroke();
    }

    // Independent samples keep seasonal particles from forming the rows of the technical scenes.
    let seasonSeed = 73129;
    function seasonRandom() {
        seasonSeed = (Math.imul(seasonSeed, 1664525) + 1013904223) >>> 0;
        return seasonSeed / 2 ** 32;
    }
    const seasonalParticles = Array.from({length: particles.length}, () => ({
        x: seasonRandom(), y: seasonRandom(), depth: seasonRandom(), speed: seasonRandom(),
        phase: seasonRandom() * Math.PI * 2, turn: (seasonRandom() - .5) * 1.6
    }));

    function snowflake(x, y, depth, angle) {
        context.beginPath();
        if (depth < .72) {
            context.arc(x, y, .7 + depth * 2, 0, Math.PI * 2);
            context.fill();
            return;
        }
        const radius = 4 + depth * 4;
        for (let arm = 0; arm < 6; arm++) {
            const direction = angle + arm * Math.PI / 3;
            const dx = Math.cos(direction), dy = Math.sin(direction);
            const branchX = x + dx * radius * .62, branchY = y + dy * radius * .62;
            segment(x, y, x + dx * radius, y + dy * radius);
            segment(branchX, branchY, branchX + (dx + dy) * 2.1, branchY + (dy - dx) * 2.1);
            segment(branchX, branchY, branchX + (dx - dy) * 2.1, branchY + (dy + dx) * 2.1);
        }
        context.stroke();
    }

    function petalOrLeaf(x, y, radius, angle, flutter, isLeaf) {
        context.save();
        context.translate(x, y);
        context.rotate(angle);
        context.scale(.4 + Math.abs(Math.sin(flutter)) * .6, 1);
        context.beginPath();
        context.moveTo(0, -radius);
        if (isLeaf) {
            context.quadraticCurveTo(radius * 1.25, -.35 * radius, 0, radius);
            context.quadraticCurveTo(-radius, .15 * radius, 0, -radius);
        } else {
            context.quadraticCurveTo(radius * 1.2, -radius * 1.25, radius * .6, 0);
            context.quadraticCurveTo(radius * .3, radius * .8, 0, radius);
            context.quadraticCurveTo(-radius * .9, radius * .3, -radius * .7, -radius * .5);
            context.quadraticCurveTo(-radius * .52, -radius * 1.35, 0, -radius);
        }
        context.fill();
        if (isLeaf) {
            context.globalAlpha *= .75;
            context.beginPath();
            segment(0, -radius * .85, 0, radius * 1.18);
            context.stroke();
        }
        context.restore();
    }

    function season() {
        const count = Math.min(seasonalParticles.length, Math.max(22, Math.ceil(width * height / 16000)));
        const winter = mode === 'winter', summer = mode === 'summer', autumn = mode === 'autumn';
        const wind = Math.sin(elapsed * .23) * 18 + Math.sin(elapsed * .61) * 6;
        const margin = 32, fallHeight = height + 2 * margin;
        for (let i = 0; i < count; i++) {
            const p = seasonalParticles[i];
            const sway = p.phase + elapsed * (.4 + .75 * p.speed);
            const x = p.x * width + Math.sin(sway) * (8 + 25 * p.depth) + wind * p.depth;
            context.globalAlpha = .18 + p.depth * .46;
            if (summer) {
                const y = p.y * height + Math.cos(sway * .8) * (10 + 15 * p.depth);
                const glow = (.5 + .5 * Math.sin(p.phase + elapsed * (.7 + p.speed))) ** 2;
                for (const radius of [10, 5, 1.7]) {
                    context.globalAlpha = (.18 + .82 * glow) * p.depth / radius;
                    context.beginPath();
                    context.arc(x, y, radius * (.6 + p.depth), 0, Math.PI * 2);
                    context.fill();
                }
                continue;
            }
            const speed = 8 + 20 * p.speed + p.depth * (autumn ? 31 : 15);
            const y = (p.y * fallHeight + elapsed * speed) % fallHeight - margin;
            const angle = p.phase + p.turn * elapsed;
            if (winter) snowflake(x, y, p.depth, angle * .4);
            else petalOrLeaf(x, y, (autumn ? 8 : 5) * (.6 + p.depth), angle, sway, autumn);
        }
    }

    function draw(now, wallTime, fps, speed = 1) {
        if (mode === 'none' || !context || (previous !== undefined && now - previous < 1000 / fps)) return;
        const delta = previous === undefined ? 0 : Math.min(0.25, (now - previous) / 1000);
        previous = now;
        elapsed += delta * speed;
        canvas.style.opacity = String(Math.min(1, .55 + elapsed * 1.5));
        const density = Math.min(1.5, host.devicePixelRatio || 1, 2880 / Math.max(1, host.innerWidth));
        const sceneWidth = host.innerWidth / sceneScale, sceneHeight = host.innerHeight / sceneScale;
        if (width !== sceneWidth || height !== sceneHeight || ratio !== density * sceneScale) {
            width = sceneWidth;
            height = sceneHeight;
            ratio = density * sceneScale;
            const pixelsX = Math.max(1, Math.round(host.innerWidth * density));
            const pixelsY = Math.max(1, Math.round(host.innerHeight * density));
            if (canvas.width !== pixelsX) canvas.width = pixelsX;
            if (canvas.height !== pixelsY) canvas.height = pixelsY;
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
        }
        if (!customInk && !themeInk) {
            const colors = host.getComputedStyle(canvas);
            themeInk = colors.color || colors.getPropertyValue('--accent').trim() || '#70b7b1';
        }
        context.clearRect(0, 0, width, height);
        context.strokeStyle = context.fillStyle = customInk || themeInk;
        if (mode === 'grid') grid();
        if (mode === 'graph') graph(delta);
        if (mode === 'scope') scope(wallTime);
        if (mode === 'rain') rain();
        if (mode === 'starfield') {
            driftX += (targetX - driftX) * (1 - Math.exp(-4 * delta));
            driftY += (targetY - driftY) * (1 - Math.exp(-4 * delta));
            starfield();
        }
        if (mode === 'circuit') circuit();
        if (mode === 'matrix') matrix();
        if (mode === 'wireframe') wireframe();
        if (mode === 'flow') flow();
        if (['winter', 'spring', 'summer', 'autumn'].includes(mode)) season();
    }
    return {
        configure(next, chars, fontSize, color) {
            alphabet = chars;
            customInk = color;
            // Background geometry is authored in logical units at the original 48 px clock size.
            sceneScale = fontSize / 48;
            if (mode === next) return;
            mode = next;
            canvas.setAttribute('data-scene', next);
            themeInk = undefined;
            canvas.hidden = mode === 'none';
            if (!canvas.hidden && !context) context = canvas.getContext('2d');
            previous = undefined;
            elapsed = 0;
        },
        point(x, y) {
            if (mode !== 'graph' && mode !== 'starfield') return;
            targetX = (x / Math.max(1, host.innerWidth) - 0.5) * 40;
            targetY = (y / Math.max(1, host.innerHeight) - 0.5) * 40;
        },
        draw,
        resetFrame() { previous = undefined; },
        paletteChanged() { themeInk = undefined; }
    };
}
