// Implements the Goertzel algorithm for DTMF tone detection.
// This is a local, offline alternative to AI-based decoding.

import { DTMF_FREQUENCIES } from './dtmf';

const TONE_DURATION_MS = 65;
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

function decodeSequence(sequence: string[], addLog: (message: string, type?: 'info' | 'error' | 'warning') => void): string {
    if (!sequence || sequence.length === 0) {
        return '';
    }
    addLog(`Начало декодирования последовательности: [${sequence.join(', ')}]`);

    let result = '';
    let isRussianUpperCase = false; // separate state for Russian stateful case
    let i = 0;

    while (i < sequence.length) {
        const currentTone = sequence[i];

        if (currentTone === '*') {
            // Check the next character to determine context if possible
            const nextTone = sequence.find((t, idx) => idx > i && t !== '#' && t !== '*');
            const keyChars = nextTone ? KEY_MAP[nextTone as keyof typeof KEY_MAP] : undefined;
            const isLatinNext = keyChars?.some(c => c >= 'a' && c <= 'z');
            
            // If the next char is not Latin, we assume it's a Russian case switch
            if (!isLatinNext) {
                isRussianUpperCase = !isRussianUpperCase;
                addLog(`Переключение русского регистра: ${isRussianUpperCase ? 'ВКЛ' : 'ВЫКЛ'}`);
            } else {
                 addLog(`Обнаружен переключатель регистра для латиницы (одноразовый).`);
            }
            i++;
            continue;
        }
        
        if (currentTone === '#') {
            addLog(`Обнаружен разделитель, сброс счетчика нажатий.`);
            i++;
            continue; // Separator, just move to the next tone
        }

        const keyChars = KEY_MAP[currentTone as keyof typeof KEY_MAP];
        if (!keyChars) {
            addLog(`Неизвестный тон '${currentTone}', пропускается.`, 'warning');
            i++;
            continue;
        }
        
        // Count consecutive presses of the same key
        let pressCount = 1;
        while (i + 1 < sequence.length && sequence[i + 1] === currentTone) {
            pressCount++;
            i++;
        }
        
        addLog(`Тон '${currentTone}' нажат ${pressCount} раз(а).`);

        let char = keyChars[(pressCount - 1) % keyChars.length];
        
        const isLatin = (char >= 'a' && char <= 'z');
        const isRussian = (char >= 'а' && char <= 'я');

        // Check for a one-time Latin upper case marker
        const hasOneTimeUpperCase = i > 0 && sequence[i - pressCount] === '*';
        
        if ((isRussian && isRussianUpperCase) || (isLatin && hasOneTimeUpperCase)) {
             char = char.toUpperCase();
             addLog(`Применение верхнего регистра: '${char}'`);
        }
        
        result += char;
        addLog(`Добавлен символ: '${char}'. Текущий результат: "${result}"`);
        i++;
    }

    return result;
}


async function getAudioContext(blob: Blob): Promise<AudioBuffer> {
     const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE });
     const arrayBuffer = await blob.arrayBuffer();
     return audioContext.decodeAudioData(arrayBuffer);
}

export async function decodeDtmfFromAudio(blob: Blob, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void): Promise<string | null> {
    const audioBuffer = await getAudioContext(blob);
    addLog(`Аудиофайл успешно загружен. Длительность: ${audioBuffer.duration.toFixed(2)}с, Частота: ${audioBuffer.sampleRate}Гц`);
    const data = audioBuffer.getChannelData(0);

    const chunkSize = Math.floor(audioBuffer.sampleRate * (TONE_DURATION_MS / 1000));
    const stepSize = Math.floor(audioBuffer.sampleRate * (PAUSE_DURATION_MS / 1000));
    
    addLog(`Анализ аудио... Размер блока: ${chunkSize} семплов, Шаг: ${stepSize} семплов`);

    const detectedTones: string[] = [];
    let lastTone: string | null = null;
    let lastToneTime = -Infinity;

    for (let i = 0; i + chunkSize <= data.length; i += stepSize) {
        const chunk = data.slice(i, i + chunkSize);
        const tone = detectTone(chunk, audioBuffer.sampleRate);
        
        if(tone) {
            if (tone !== lastTone) {
                 const currentTime = (i / audioBuffer.sampleRate) * 1000;
                 // Debounce to avoid detecting the same tone multiple times
                 if (currentTime > lastToneTime + TONE_DURATION_MS) {
                    detectedTones.push(tone);
                    lastToneTime = currentTime;
                    addLog(`Обнаружен тон: '${tone}' на ${currentTime.toFixed(0)}мс`);
                }
            }
            lastTone = tone;
        } else {
            lastTone = null;
        }
    }
    
    if (detectedTones.length === 0) {
      addLog("DTMF тоны не обнаружены в аудио.", 'warning');
      return null;
    }

    return decodeSequence(detectedTones, addLog);
}
