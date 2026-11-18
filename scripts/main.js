import {readClock} from './clock.js';
import {createSettings, applyProperties} from './settings.js';
import {createClockView, applyAppearance} from './view.js';

export function startWallpaper(host, document) {
    const settings = createSettings();
    let canvasFps = 24;
    let view, lastSecond, lastError, timerId, frameId;
    let appearanceDirty = true, paused = false, stopped = false;

    function refresh(force = false) {
        if (stopped || paused || document.readyState === 'loading') return;
        const now = Date.now();
        const second = Math.floor(now / 1000);
        try {
            if (!view) view = createClockView(document, host, {
                refresh: () => refresh(true),
                change: values => listener.applyUserProperties(Object.fromEntries(
                    Object.entries(values).map(([key, value]) => [key, {value}])
                ))
            });
            if (force || second !== lastSecond) {
                const clock = readClock(new Date(now));
                view.update(clock, settings);
                lastSecond = second;
                if (appearanceDirty) {
                    applyAppearance(document, settings, clock.hour);
                    view.fit();
                    appearanceDirty = false;
                }
            }
            lastError = undefined;
        } catch (error) {
            const message = String(error);
            if (message !== lastError) host.console.error('[Object Clock]', error);
            lastError = message;
        }
    }

    function frame(timestamp) {
        if (paused || stopped) return;
        frameId = host.requestAnimationFrame(frame);
        refresh();
        const now = Date.now();
        view?.draw(timestamp ?? now, now, canvasFps);
    }
    function schedule() {
        if (timerId === undefined) timerId = host.setInterval(refresh, 1000);
        if (host.requestAnimationFrame && frameId === undefined) frameId = host.requestAnimationFrame(frame);
    }
    function cancel() {
        if (timerId !== undefined) host.clearInterval(timerId);
        if (frameId !== undefined) host.cancelAnimationFrame(frameId);
        timerId = frameId = undefined;
    }

    const listener = {
        applyGeneralProperties(properties) {
            if (Number.isFinite(properties?.fps) && properties.fps > 0) {
                canvasFps = Math.min(24, properties.fps);
            }
        },
        applyUserProperties(properties) {
            applyProperties(settings, properties);
            appearanceDirty = true;
            refresh(true);
        },
        setPaused(value) {
            if (stopped || paused === Boolean(value)) return;
            paused = Boolean(value);
            view?.setPaused(paused);
            if (paused) cancel();
            else { refresh(true); schedule(); }
        }
    };
    host.wallpaperPropertyListener = listener;
    // The engine exposes one stereo spectrum callback; skip analysis while inactive.
    const bars = '▁▂▃▄▅▆▇█';
    const edges = [0, 2, 4, 8, 14, 22, 32, 46, 64];
    host.wallpaperRegisterAudioListener?.(samples => {
        if (paused || stopped || !view || !settings.ui_audio || !samples || samples.length < 128) return;
        let meter = '';
        for (let i = 1; i < edges.length; i++) {
            let sum = 0;
            for (let j = edges[i - 1]; j < edges[i]; j++) sum += (samples[j] || 0) + (samples[j + 64] || 0);
            const level = Math.min(1, Math.max(0, sum / (2 * (edges[i] - edges[i - 1]))));
            meter += bars[Math.round(Math.sqrt(level) * 7)];
        }
        view.audio(meter);
    });
    const resume = () => refresh(true);
    const visible = () => { if (!document.hidden) resume(); };
    document.addEventListener('DOMContentLoaded', resume);
    document.addEventListener('visibilitychange', visible);
    host.addEventListener('pageshow', resume);
    schedule();
    refresh(true);

    return {
        stop() {
            stopped = true;
            cancel();
            view?.setPaused(true);
            view?.stop();
            if (host.wallpaperPropertyListener === listener) delete host.wallpaperPropertyListener;
            document.removeEventListener('DOMContentLoaded', resume);
            document.removeEventListener('visibilitychange', visible);
            host.removeEventListener('pageshow', resume);
        }
    };
}
