// Implements the Goertzel algorithm for DTMF tone detection.
// This is a local, offline alternative to AI-based decoding.

import { DTMF_FREQUENCIES } from './dtmf';

const TONE_DURATION_MS = 100;
const PAUSE_DURATION_MS = 50;
const MIN_CHUNK_DURATION_MS = TONE_DURATION_MS + PAUSE_DURATION_MS;
const THRESHOLD = 100; // Power threshold for detecting a tone
const SAMPLE_RATE = 44100; // Standard sample rate

const DTMF_MAP: { [key: string]: string } = {
    "697,1209": "1", "697,1336": "2", "697,1477": "3",
    "770,1209": "4", "770,1336": "5", "770,1477": "6",
    "852,1209": "7", "852,1336": "8", "852,1477": "9",
    "941,1209": "*", "941,1336": "0", "941,1477": "#",
};

const KEY_MAP: { [key: string]: string[] } = {
    '1': ['.', ',', '?', '!'],
    '2': ['а', 'б', 'в', 'г', 'a', 'b', 'c'],
    '3': ['д', 'е', 'ж', 'з', 'd', 'e', 'f'],
    '4': ['и', 'й', 'к', 'л', 'g', 'h', 'i'],
    '5': ['м', 'н', 'о', 'п', 'j', 'k', 'l'],
    '6': ['р', 'с', 'т', 'у', 'm', 'n', 'o'],
    '7': ['ф', 'х', 'ц', 'ч', 'p', 'q', 'r', 's'],
    '8': ['ш', 'щ', 'ъ', 'ы', 't', 'u', 'v'],
    '9': ['ь', 'э', 'ю', 'я', 'w', 'x', 'y', 'z'],
    '0': [' '],
};

class Goertzel {
    private s1 = 0;
    private s2 = 0;
    private coeff: number;

    constructor(freq: number, sampleRate: number) {
        const omega = (2 * Math.PI * freq) / sampleRate;
        this.coeff = 2 * Math.cos(omega);
    }

    process(sample: number) {
        const s0 = sample + this.coeff * this.s1 - this.s2;
        this.s2 = this.s1;
        this.s1 = s0;
    }

    getPower(): number {
        return this.s2 * this.s2 + this.s1 * this.s1 - this.coeff * this.s1 * this.s2;
    }

    reset() {
        this.s1 = 0;
        this.s2 = 0;
    }
}

function detectTone(chunk: Float32Array, sampleRate: number): string | null {
    const lowFreqs = [697, 770, 852, 941];
    const highFreqs = [1209, 1336, 1477, 1633];

    const lowFilters = lowFreqs.map(f => new Goertzel(f, sampleRate));
    const highFilters = highFreqs.map(f => new Goertzel(f, sampleRate));

    for (const sample of chunk) {
        lowFilters.forEach(f => f.process(sample));
        highFilters.forEach(f => f.process(sample));
    }

    const lowPowers = lowFilters.map(f => f.getPower());
    const highPowers = highFilters.map(f => f.getPower());

    const maxLowPower = Math.max(...lowPowers);
    const maxHighPower = Math.max(...highPowers);

    if (maxLowPower < THRESHOLD || maxHighPower < THRESHOLD) {
        return null;
    }

    const lowIndex = lowPowers.indexOf(maxLowPower);
    const highIndex = highPowers.indexOf(maxHighPower);

    const detectedLowFreq = lowFreqs[lowIndex];
    const detectedHighFreq = highFreqs[highIndex];
    
    return DTMF_MAP[`${detectedLowFreq},${detectedHighFreq}`] || null;
}

function decodeSequence(sequence: string[]): string {
    if (!sequence || sequence.length === 0) {
        return '';
    }

    let result = '';
    let isUpperCase = false;
    let i = 0;

    while (i < sequence.length) {
        const currentTone = sequence[i];

        if (currentTone === '*') {
            isUpperCase = !isUpperCase;
            i++;
            continue;
        }
        
        if (currentTone === '#') {
            i++;
            continue;
        }

        const keyChars = KEY_MAP[currentTone as keyof typeof KEY_MAP];
        if (!keyChars) {
            i++;
            continue;
        }

        let pressCount = 1;
        while (i + 1 < sequence.length && sequence[i + 1] === currentTone) {
            pressCount++;
            i++;
        }

        let char = keyChars[(pressCount - 1) % keyChars.length];
        
        if (isUpperCase && char !== ' ') {
            const isRussian = (char >= 'а' && char <= 'я');
            const isLatin = (char >= 'a' && char <= 'z');
            if (isRussian || isLatin) {
               char = char.toUpperCase();
               // For Russian letters, we need to switch case back manually for next letter
               if (isRussian) {
                   const nextToneIndex = sequence.findIndex((t, idx) => idx > i && t !== '#' && t !== '*');
                   if(nextToneIndex !== -1) {
                       const nextTone = sequence[nextToneIndex];
                       const nextNextTone = sequence[nextToneIndex + 1];
                       // Only turn off uppercase if next letter is not also uppercase
                       if(nextTone !== '*' && nextNextTone !== '*') {
                           isUpperCase = false;
                       }
                   } else {
                       isUpperCase = false;
                   }

               } else {
                 isUpperCase = false; // Auto-reset for latin
               }
            }
        }
        
        result += char;
        i++;
    }

    return result;
}


async function getAudioContext(blob: Blob): Promise<AudioBuffer> {
     const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE });
     const arrayBuffer = await blob.arrayBuffer();
     return audioContext.decodeAudioData(arrayBuffer);
}

export async function decodeDtmfFromAudio(blob: Blob): Promise<string | null> {
    const audioBuffer = await getAudioContext(blob);
    const data = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    const chunkSize = Math.floor(sampleRate * (TONE_DURATION_MS / 1000));
    const stepSize = Math.floor(sampleRate * (MIN_CHUNK_DURATION_MS / 1000));

    const detectedTones: string[] = [];
    let lastTone: string | null = null;
    let lastToneTime = -Infinity;

    for (let i = 0; i + chunkSize <= data.length; i += stepSize) {
        const chunk = data.slice(i, i + chunkSize);
        const tone = detectTone(chunk, sampleRate);
        const currentTime = i / sampleRate;

        if (tone && tone !== lastTone) {
            // Debounce tones
            if(currentTime > lastToneTime + (PAUSE_DURATION_MS / 1000)) {
                detectedTones.push(tone);
                lastToneTime = currentTime;
            }
        }
        lastTone = tone;
    }
    
    // Split sequence by '#' which is our same-key separator
    const groupedTones: string[][] = [];
    let currentGroup: string[] = [];
    for(const tone of detectedTones) {
        if (tone === '#') {
            if (currentGroup.length) {
                groupedTones.push(currentGroup);
            }
            currentGroup = [];
        } else {
            currentGroup.push(tone);
        }
    }
    if (currentGroup.length) {
        groupedTones.push(currentGroup);
    }
    
    // Now decode based on groups
    const finalSequence = detectedTones.join('').split('#');

    let sequenceForDecoder: string[] = [];
    let tempSequence = detectedTones;

    // First pass to handle separators (#)
    let processedSequence: string[] = [];
    let j = 0;
    while (j < tempSequence.length) {
      let current = tempSequence[j];
      if (current === '#') {
        processedSequence.push('#');
        j++;
        continue;
      }
      processedSequence.push(current);
      j++;
    }


    return decodeSequence(processedSequence);
}
