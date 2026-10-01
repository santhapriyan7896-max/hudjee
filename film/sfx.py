"""Sound effects for the HudJee film, synthesised and placed on the film's own
event times (film.html). Writes sfx.wav: 42 s, 48 kHz, 16-bit stereo.

Everything is soft and short: UI ticks and taps, a two-tone alarm, a bright
chime for a right answer and a low one for a wrong answer, air for things that
move, and the same small sting when the mark clicks shut at both ends.
"""

import wave

import numpy as np
from scipy import signal

SR = 48_000
DUR = 42.0
N = int(SR * DUR)
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(7)


def t_axis(dur):
    return np.arange(int(SR * dur)) / SR


def place(sig, t0, gain=1.0, pan=0.0):
    """Mix `sig` in at t0 seconds; pan -1 (left) to 1 (right), constant power.
    `pan` may also be an array the length of `sig`, for a sweep."""
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    seg = sig[: N - i0]
    pan = np.broadcast_to(pan, sig.shape)[: len(seg)]
    a = (pan + 1) * np.pi / 4
    L[i0:i0 + len(seg)] += seg * gain * np.cos(a)
    R[i0:i0 + len(seg)] += seg * gain * np.sin(a)


def bandpass(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype='band', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def lowpass(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, fs=SR, output='sos'), x)


# ── the sounds ───────────────────────────────────────────────────────────────

def tick(freq=3200.0, dur=0.03):
    t = t_axis(dur)
    return np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.004)


def tap():
    """A finger on glass: a short tock with a click on its front edge."""
    t = t_axis(0.09)
    tock = np.sin(2 * np.pi * 1250 * t) * np.exp(-t / 0.011)
    body = 0.5 * np.sin(2 * np.pi * 240 * t) * np.exp(-t / 0.02)
    click = bandpass(rng.standard_normal(len(t)), 2500, 7000) * np.exp(-t / 0.0035) * 0.6
    return tock + body + click


def bell(freq, dur=1.4, bright=1.0):
    """Kalimba-like: a pure fundamental and two quick inharmonic partials."""
    t = t_axis(dur)
    attack = np.minimum(1, t / 0.004)
    out = np.sin(2 * np.pi * freq * t) * np.exp(-t / (dur * 0.32))
    out += 0.28 * bright * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t / 0.09)
    out += 0.10 * bright * np.sin(2 * np.pi * freq * 5.40 * t) * np.exp(-t / 0.04)
    return out * attack


def chime(notes, t0, gain, spacing=0.06, pan=0.0, dur=1.4):
    for k, f in enumerate(notes):
        place(bell(f, dur), t0 + k * spacing, gain * (0.85 ** k), pan)


def glide(f0, f1, dur, shape='sine'):
    """A tone sliding from f0 to f1 under a raised-cosine envelope."""
    t = t_axis(dur)
    f = f0 * (f1 / f0) ** (t / dur)
    phase = 2 * np.pi * np.cumsum(f) / SR
    env = np.sin(np.pi * t / dur) ** 2
    return np.sin(phase) * env


def pop(f0=900.0, f1=430.0, dur=0.1):
    t = t_axis(dur)
    f = f1 + (f0 - f1) * np.exp(-t / 0.018)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.03) * np.minimum(1, t / 0.002)


def bonk():
    """A wrong answer: two soft, low notes stepping down. A nudge, not a buzzer."""
    out = np.zeros(int(SR * 0.6))
    for k, f in enumerate((349.23, 261.63)):          # F4, C4
        t = t_axis(0.42)
        n = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
        n *= np.exp(-t / 0.14) * np.minimum(1, t / 0.006)
        i = int(SR * 0.13 * k)
        out[i:i + len(n)] += n * (1 - 0.2 * k)
    return lowpass(out, 2200)


def thump():
    t = t_axis(0.25)
    f = 55 + 70 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.07)


def whoosh(dur, f0, f1, pan0=0.0, pan1=0.0, peak=0.45):
    """Air past the ear: noise through a band-pass whose centre slides f0 → f1."""
    n = int(SR * dur)
    x = rng.standard_normal(n)
    fc = f0 * (f1 / f0) ** (np.arange(n) / n)
    # Chamberlin state-variable filter, swept per sample
    out = np.empty(n)
    low = band = 0.0
    damp = 1 / 1.6
    for i, (xi, c) in enumerate(zip(x.tolist(), fc.tolist())):
        f = 2 * np.sin(np.pi * c / SR)
        high = xi - low - damp * band
        band += f * high
        low += f * band
        out[i] = band
    u = np.arange(n) / n
    env = np.where(u < peak, np.sin(np.pi / 2 * u / peak) ** 2, np.cos(np.pi / 2 * (u - peak) / (1 - peak)) ** 2)
    out = out * env / (np.abs(out).max() + 1e-9)
    return out, np.linspace(pan0, pan1, n)


def air(t0, dur, f0, f1, gain, pan0=0.0, pan1=0.0, peak=0.45):
    sig, pan = whoosh(dur, f0, f1, pan0, pan1, peak)
    place(sig, t0, gain, pan)


def pad(dur, notes=(110.0, 164.81, 220.0), attack=0.6, release=1.2):
    t = t_axis(dur)
    out = sum(np.sin(2 * np.pi * f * t + k) * (0.9 ** k) for k, f in enumerate(notes))
    env = np.minimum(1, t / attack) * np.minimum(1, (dur - t) / release)
    return lowpass(out * env, 900)


def ease_out_times(t0, span, steps):
    """When an ease-out-cubic count crosses each of `steps` even steps."""
    k = np.arange(1, steps + 1) / steps
    return t0 + span * (1 - (1 - k) ** (1 / 3))


# ── the score, on the film's own timeline ────────────────────────────────────

# intro: air, the strokes part, the click, the sting
place(pad(2.6, attack=0.5, release=1.6), 0.0, 0.05)
air(0.0, 1.0, 180, 900, 0.06, peak=0.8)
air(0.70, 0.40, 600, 2600, 0.10)
place(thump(), 1.09, 0.32)
place(tap(), 1.09, 0.20)
chime([659.25, 987.77, 1318.51], 1.12, 0.20, spacing=0.05, dur=1.8)    # E5 B5 E6
air(3.05, 0.72, 2200, 600, 0.10, 0, 0)                                 # the mark flies up into the pill
place(pop(620, 980, 0.12), 3.78, 0.10)                                 # the pill opens

# alarm
air(3.98, 0.70, 300, 1300, 0.09)
for t0 in (4.92, 5.52, 6.12):                                          # ding-dong, three times
    place(bell(1318.51, 0.9, 0.7), t0, 0.15)
    place(bell(1046.50, 0.9, 0.7), t0 + 0.19, 0.13)
place(tap(), 6.78, 0.2)
air(7.60, 0.55, 1500, 420, 0.07)

# practice: a question right
place(glide(900, 1150, 0.09), 7.70, 0.035)
air(7.95, 0.75, 350, 1500, 0.08, -0.2, -0.1)
air(8.15, 0.80, 350, 1400, 0.06, 0.25, 0.15)
for k in range(4):
    place(tick(2900 + 120 * k), 8.36 + 0.07 * k, 0.05)
place(tap(), 11.70, 0.2)
place(tap(), 12.45, 0.2)
chime([1046.50, 1318.51, 1567.98], 12.80, 0.16, spacing=0.06)          # C6 E6 G6
place(pop(1000, 600, 0.09), 12.82, 0.07, 0.2)
place(glide(700, 1100, 0.12), 12.96, 0.05)

# a harder one, wrong
air(14.20, 0.55, 1600, 500, 0.07, -0.1, -0.6)
air(14.50, 0.80, 400, 1600, 0.08, 0.6, 0.0)
place(glide(900, 1150, 0.09), 14.70, 0.03)
for k in range(4):
    place(tick(2900 + 120 * k), 14.90 + 0.07 * k, 0.05)
place(tap(), 17.32, 0.2)
place(tap(), 17.98, 0.2)
place(bonk(), 18.30, 0.22)
place(glide(1100, 700, 0.12), 18.46, 0.05)

# why, and into the notebook
air(19.40, 0.65, 300, 1400, 0.07)
place(tap(), 20.60, 0.2)
place(pop(760, 1180, 0.08), 20.64, 0.06)
air(21.55, 0.80, 900, 3200, 0.09, 0.0, 0.35, peak=0.7)
place(pop(1250, 700, 0.11), 22.32, 0.11, 0.3)
place(bell(1760.0, 0.6, 0.5), 22.33, 0.04, 0.3)
air(23.00, 0.50, 1300, 400, 0.05)

# home: the goal fills, the streak ticks over, readiness climbs
for k, t0 in enumerate((23.60, 23.75, 23.90)):
    air(t0, 0.6, 400, 1500, 0.05, (k - 1) * 0.25, (k - 1) * 0.2)
place(glide(520, 1040, 1.3) * np.linspace(0.6, 1, int(SR * 1.3)), 24.90, 0.05)
chime([783.99, 1046.50, 1318.51, 1567.98], 26.25, 0.15, spacing=0.055)  # G5 C6 E6 G6
place(pop(900, 520, 0.09), 26.27, 0.06)
place(tick(2400), 26.50, 0.07)
place(tick(3100), 26.56, 0.06)
for k, t0 in enumerate(ease_out_times(26.70, 1.40, 5)):
    place(tick(2600 + 140 * k), float(t0), 0.06)
place(glide(800, 1100, 0.1), 27.95, 0.035)
air(31.00, 0.50, 1300, 400, 0.05)

# mock: the score counts up, the sections fill
air(31.65, 0.70, 350, 1500, 0.07, -0.1, 0.0)
air(31.95, 0.70, 350, 1500, 0.05, 0.4, 0.3)
for k, t0 in enumerate(ease_out_times(32.30, 1.40, 14)):
    place(tick(2300 + 60 * k), float(t0), 0.05)
place(glide(900, 1200, 0.1), 33.65, 0.035)
for k, t0 in enumerate((34.00, 34.12, 34.24)):
    air(t0, 0.55, 500, 2400, 0.035, -0.2 + 0.2 * k, -0.2 + 0.2 * k)
air(36.75, 0.50, 1300, 400, 0.05)

# outro: the pill folds, the mark comes home and clicks shut
place(pop(1000, 640, 0.1), 37.20, 0.07)
air(37.55, 0.75, 500, 2200, 0.09)
place(thump(), 38.27, 0.30)
place(tap(), 38.27, 0.16)
chime([659.25, 987.77, 1318.51, 1975.53], 38.30, 0.19, spacing=0.05, dur=2.2)
place(pad(3.6, notes=(110.0, 164.81, 220.0, 329.63), attack=0.8, release=2.4), 38.3, 0.045)

# ── master ───────────────────────────────────────────────────────────────────
mix = np.stack([L, R])
fade = np.ones(N)
a, b = int(SR * 41.15), int(SR * 41.85)
fade[a:b] = np.linspace(1, 0, b - a) ** 2
fade[b:] = 0
mix *= fade
mix /= np.abs(mix).max() / 0.85                     # peak at about -1.4 dBFS
mix = np.tanh(mix * 1.1) / np.tanh(1.1)             # round off the loudest transients
pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2').T.copy()
with wave.open('sfx.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
rms = np.sqrt((mix ** 2).mean())
print(f'sfx.wav: {DUR:.0f} s, peak {np.abs(mix).max():.2f}, rms {20 * np.log10(rms):.1f} dBFS')
