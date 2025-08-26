import * as Tone from 'tone';

export const DTMF_FREQUENCIES: { [key: string]: [number, number] } = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  'A': [697, 1633],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  'B': [770, 1633],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  'C': [852, 1633],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477],
  'D': [941, 1633],
};

const TONE_DURATION = 0.1; // seconds
const PAUSE_DURATION = 0.05; // seconds

const CHAR_MAP: { [key: string]: string } = {
  'а': '2', 'б': '22', 'в': '222', 'г': '2222',
  'д': '3', 'е': '33', 'ё': '33', 'ж': '333', 'з': '3333',
  'и': '4', 'й': '44', 'к': '444', 'л': '4444',
  'м': '5', 'н': '55', 'о': '555', 'п': '5555',
  'р': '6', 'с': '66', 'т': '666', 'у': '6666',
  'ф': '7', 'х': '77', 'ц': '777', 'ч': '7777',
  'ш': '8', 'щ': '88', 'ъ': '888', 'ы': '8888',
  'ь': '9', 'э': '99', 'ю': '999', 'я': '9999',
  'a': '2', 'b': '22', 'c': '222',
  'd': '3', 'e': '33', 'f': '333',
  'g': '4', 'h': '44', 'i': '444',
  'j': '5', 'k': '55', 'l': '555',
  'm': '6', 'n': '66', 'o': '666',
  'p': '7', 'q': '77', 'r': '777', 's': '7777',
  't': '8', 'u': '88', 'v': '888',
  'w': '9', 'x': '99', 'y': '999', 'z': '9999',
  ' ': '0',
  '.': '1', ',': '11', '?': '111', '!': '1111',
};

export function textToDtmfSequence(text: string): string {
    let sequence: string[] = [];
    let lastKey = '';
    let isCurrentlyUpperCase = false;

    for (const char of text) {
        const lowerChar = char.toLowerCase();
        const isLetter = (lowerChar >= 'a' && lowerChar <= 'z') || (lowerChar >= 'а' && lowerChar <= 'я' || lowerChar === 'ё');
        const isUpperCase = isLetter && char === char.toUpperCase() && char !== lowerChar;
        
        if (isUpperCase && !isCurrentlyUpperCase) {
            sequence.push('*');
            isCurrentlyUpperCase = true;
        } else if (!isUpperCase && isCurrentlyUpperCase && isLetter) {
            // No need to toggle off for Russian, it's stateful.
            // For latin, it's a one-time thing.
            const isLatin = (lowerChar >= 'a' && lowerChar <= 'z');
            if (isLatin) {
              isCurrentlyUpperCase = false;
            }
        }

        const dtmfChars = CHAR_MAP[lowerChar];
        if (dtmfChars) {
            const currentKey = dtmfChars[0];
            if (currentKey === lastKey) {
                sequence.push('#'); // Separator for same-key characters
            }
            sequence.push(...dtmfChars.split(''));
            lastKey = currentKey;
        } else {
             sequence.push('#', '#'); // Represent unknown characters
             lastKey = '';
        }
    }
    return sequence.join(',');
}


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
        // Return a tiny silent buffer if sequence is empty or invalid
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        return audioContext.createBuffer(1, 1, audioContext.sampleRate);
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
