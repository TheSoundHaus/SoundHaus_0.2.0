"""Generate themed audio sample files for SoundHaus testing."""
import wave, struct, math, random

SAMPLE_RATE = 44100

def write_wav(filename, samples):
    with wave.open(filename, 'w') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        frames = struct.pack('<' + 'h' * len(samples),
                             *[max(-32767, min(32767, int(s))) for s in samples])
        w.writeframes(frames)

def drum_loop(duration=10, bpm=120):
    samples = []
    beat_len = int(SAMPLE_RATE * 60 / bpm)
    eighth = beat_len // 2
    total = int(SAMPLE_RATE * duration)
    random.seed(42)
    for i in range(total):
        pos_in_bar = i % (beat_len * 4)
        beat = pos_in_bar // beat_len
        pos_in_beat = pos_in_bar % beat_len
        pos_in_eighth = pos_in_bar % eighth
        val = 0.0
        if beat in (0, 2) and pos_in_beat < int(SAMPLE_RATE * 0.08):
            t = pos_in_beat / SAMPLE_RATE
            freq = 80 * math.exp(-t * 30)
            val += 25000 * math.sin(2 * math.pi * freq * t) * math.exp(-t * 15)
        if beat in (1, 3) and pos_in_beat < int(SAMPLE_RATE * 0.06):
            t = pos_in_beat / SAMPLE_RATE
            noise = random.uniform(-1, 1)
            val += 12000 * noise * math.exp(-t * 25)
            val += 8000 * math.sin(2 * math.pi * 200 * t) * math.exp(-t * 30)
        if pos_in_eighth < int(SAMPLE_RATE * 0.02):
            t = pos_in_eighth / SAMPLE_RATE
            noise = random.uniform(-1, 1)
            val += 4000 * noise * math.exp(-t * 80)
        samples.append(val)
    return samples

def bass_line(duration=10, bpm=120):
    samples = []
    notes = [55, 55, 73.42, 65.41]
    beat_len = int(SAMPLE_RATE * 60 / bpm)
    total = int(SAMPLE_RATE * duration)
    for i in range(total):
        bar_pos = i % (beat_len * 4)
        note_idx = bar_pos // beat_len
        freq = notes[note_idx % len(notes)]
        t = (bar_pos % beat_len) / SAMPLE_RATE
        env = min(1.0, t * 20) * math.exp(-t * 2)
        phase = (freq * i / SAMPLE_RATE) % 1.0
        raw = 1.0 if phase < 0.5 else -1.0
        val = raw * env * 18000
        samples.append(val)
    return samples

def synth_pad(duration=10):
    samples = []
    total = int(SAMPLE_RATE * duration)
    chord = [261.63, 329.63, 392.0]
    for i in range(total):
        t = i / SAMPLE_RATE
        env = min(1.0, t / 1.5) * min(1.0, (duration - t) / 1.5)
        val = 0.0
        for freq in chord:
            for detune in [-1.5, 0, 1.5]:
                f = freq + detune
                phase = (f * t) % 1.0
                val += (2 * phase - 1) * 2500
        val *= (0.85 + 0.15 * math.sin(2 * math.pi * 4 * t))
        val *= env
        samples.append(val)
    return samples

def guitar_riff(duration=10, bpm=120):
    samples = []
    notes = [329.63, 392.0, 440.0, 392.0]
    beat_len = int(SAMPLE_RATE * 60 / bpm)
    total = int(SAMPLE_RATE * duration)
    for i in range(total):
        bar_pos = i % (beat_len * 4)
        note_idx = bar_pos // beat_len
        freq = notes[note_idx % len(notes)]
        t = (bar_pos % beat_len) / SAMPLE_RATE
        env = math.exp(-t * 4)
        val = 0.0
        for h in range(1, 6):
            amp = 1.0 / h
            val += amp * math.sin(2 * math.pi * freq * h * t)
        val *= env * 15000
        samples.append(val)
    return samples

def vocal_chop(duration=10, bpm=120):
    samples = []
    total = int(SAMPLE_RATE * duration)
    beat_len = int(SAMPLE_RATE * 60 / bpm)
    formants = [(800, 1200), (300, 2500), (500, 1500), (700, 1000)]
    for i in range(total):
        bar_pos = i % (beat_len * 2)
        chop_idx = bar_pos // (beat_len // 2)
        t = (bar_pos % (beat_len // 2)) / SAMPLE_RATE
        f1, f2 = formants[chop_idx % len(formants)]
        env = min(1.0, t * 40) * math.exp(-t * 8)
        buzz = 0.0
        base_freq = 150
        for h in range(1, 10):
            buzz += math.sin(2 * math.pi * base_freq * h * t) / h
        r1 = math.sin(2 * math.pi * f1 * t)
        r2 = math.sin(2 * math.pi * f2 * t) * 0.5
        val = buzz * (0.5 + 0.3 * r1 + 0.2 * r2) * env * 10000
        samples.append(val)
    return samples

if __name__ == "__main__":
    print("Generating drum_loop_120bpm.wav...")
    write_wav("drum_loop_120bpm.wav", drum_loop())
    print("Generating bass_synth_A.wav...")
    write_wav("bass_synth_A.wav", bass_line())
    print("Generating synth_pad_Cmaj.wav...")
    write_wav("synth_pad_Cmaj.wav", synth_pad())
    print("Generating guitar_riff_Em.wav...")
    write_wav("guitar_riff_Em.wav", guitar_riff())
    print("Generating vocal_chop_fx.wav...")
    write_wav("vocal_chop_fx.wav", vocal_chop())
    print("Done! All samples generated.")
