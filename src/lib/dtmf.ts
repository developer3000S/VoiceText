import * as Tone from 'tone';

export const DTMF_FREQUENCIES: { [key: string]: [number, number] } = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477],
};

const TONE_DURATION = 0.1; // seconds
const PAUSE_DURATION = 0.05; // seconds

export async function playDtmfSequence(sequence: string) {
  await Tone.start();
  const tones = sequence.split(/,/).map(s => s.trim());
  
  const synth1 = new Tone.Synth().toDestination();
  const synth2 = new Tone.Synth().toDestination();

  let time = Tone.now();
  for (const tone of tones) {
    if (DTMF_FREQUENCIES[tone]) {
      const [freq1, freq2] = DTMF_FREQUENCIES[tone];
      synth1.triggerAttackRelease(freq1, TONE_DURATION, time);
      synth2.triggerAttackRelease(freq2, TONE_DURATION, time);
      time += TONE_DURATION + PAUSE_DURATION;
    }
  }
}

export async function renderDtmfSequenceToAudioBuffer(sequence: string): Promise<AudioBuffer> {
    const tones = sequence.split(/,/).map(s => s.trim()).filter(t => DTMF_FREQUENCIES[t]);
    const duration = tones.length * (TONE_DURATION + PAUSE_DURATION);

    if (duration === 0) {
        return new AudioContext().createBuffer(1, 1, 44100);
    }

    return Tone.Offline((context) => {
        const synth1 = new Tone.Synth().toDestination();
        const synth2 = new Tone.Synth().toDestination();

        let time = 0;
        for (const tone of tones) {
            if (DTMF_FREQUENCIES[tone]) {
                const [freq1, freq2] = DTMF_FREQUENCIES[tone];
                synth1.triggerAttackRelease(freq1, TONE_DURATION, time);
                synth2.triggerAttackRelease(freq2, TONE_DURATION, time);
                time += TONE_DURATION + PAUSE_DURATION;
            }
        }
    }, duration);
}
