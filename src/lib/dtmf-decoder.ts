// Implements the Goertzel algorithm for DTMF tone detection.
// This is a local, offline alternative to AI-based decoding.

import { DTMF_FREQUENCIES } from './dtmf';

const TONE_DURATION_MS = 65;
const PAUSE_DURATION_MS = 50;
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
    let isRussianUpperCase = false;
    let i = 0;

    while (i < sequence.length) {
        const currentTone = sequence[i];

        if (currentTone === '#') {
            addLog(`Обнаружен разделитель, сброс счетчика нажатий.`);
            i++;
            continue;
        }

        if (currentTone === '*') {
            const nextKeyIndex = sequence.findIndex((t, idx) => idx > i && t !== '*' && t !== '#');
            if (nextKeyIndex !== -1) {
                const nextKey = sequence[nextKeyIndex];
                const keyChars = KEY_MAP[nextKey as keyof typeof KEY_MAP];
                const isNextCharLatin = keyChars?.some(c => c >= 'a' && c <= 'z');
                
                if (isNextCharLatin) {
                    addLog(`Обнаружен переключатель регистра для латиницы (одноразовый).`);
                    // This is a one-time upper case for a Latin char, handled below.
                } else {
                     isRussianUpperCase = !isRussianUpperCase;
                     addLog(`Переключение русского регистра: ${isRussianUpperCase ? 'ВКЛ' : 'ВЫКЛ'}`);
                }

            } else {
                 isRussianUpperCase = !isRussianUpperCase;
                 addLog(`Переключение русского регистра: ${isRussianUpperCase ? 'ВКЛ' : 'ВЫКЛ'}`);
            }
            i++;
            continue;
        }

        const keyChars = KEY_MAP[currentTone as keyof typeof KEY_MAP];
        if (!keyChars) {
            addLog(`Неизвестный тон '${currentTone}', пропускается.`, 'warning');
            i++;
            continue;
        }
        
        let pressCount = 1;
        while (i + 1 < sequence.length && sequence[i + 1] === currentTone) {
            pressCount++;
            i++;
        }
        
        addLog(`Тон '${currentTone}' нажат ${pressCount} раз(а).`);

        let char = keyChars[(pressCount - 1) % keyChars.length];
        
        const isLatin = (char >= 'a' && char <= 'z');
        const isRussian = (char >= 'а' && char <= 'я');

        // Find the preceding '*' for one-time uppercase, ignoring separators '#'
        let isOneTimeUpperCase = false;
        let temp_i = i - pressCount;
        while(temp_i >= 0){
            if(sequence[temp_i] === '#'){
                temp_i--;
                continue;
            }
            if(sequence[temp_i] === '*'){
                 const nextKeyIndex = sequence.findIndex((t, idx) => idx > temp_i && t !== '*' && t !== '#');
                 if(nextKeyIndex === (i-pressCount+1)){
                    isOneTimeUpperCase = true;
                 }
            }
            break;
        }

        if ((isRussian && isRussianUpperCase) || (isLatin && isOneTimeUpperCase)) {
             char = char.toUpperCase();
             addLog(`Применение верхнего регистра: '${char}'`);
        }
        
        result += char;
        addLog(`Добавлен символ: '${char}'. Текущий результат: "${result}"`);
        i++;
    }
    
    addLog(`Декодирование завершено. Итоговый результат: "${result}"`);
    return result;
}


async function getAudioContext(blob: Blob): Promise<AudioBuffer> {
     const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE });
     const arrayBuffer = await blob.arrayBuffer();
     try {
        const buffer = await audioContext.decodeAudioData(arrayBuffer);
        return buffer;
     } catch (e) {
        addLog(`Не удалось декодировать аудиоданные: ${(e as Error).message}`, 'error');
        throw e;
     }
}

export async function decodeDtmfFromAudio(blob: Blob, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void): Promise<string | null> {
    try {
        const audioBuffer = await getAudioContext(blob);
        addLog(`Аудиофайл успешно загружен. Длительность: ${audioBuffer.duration.toFixed(2)}с, Частота: ${audioBuffer.sampleRate}Гц`);
        
        // Resample if necessary
        let data;
        if (audioBuffer.sampleRate !== SAMPLE_RATE) {
            addLog(`Частота дискретизации отличается (${audioBuffer.sampleRate}Hz). Производится передискретизация до ${SAMPLE_RATE}Hz.`, 'warning');
            const offlineContext = new OfflineAudioContext(audioBuffer.numberOfChannels, audioBuffer.duration * SAMPLE_RATE, SAMPLE_RATE);
            const bufferSource = offlineContext.createBufferSource();
            bufferSource.buffer = audioBuffer;
            bufferSource.connect(offlineContext.destination);
            bufferSource.start();
            const resampledBuffer = await offlineContext.startRendering();
            data = resampledBuffer.getChannelData(0);
        } else {
            data = audioBuffer.getChannelData(0);
        }


        const chunkSize = Math.floor(SAMPLE_RATE * (TONE_DURATION_MS / 1000));
        const stepSize = Math.floor(SAMPLE_RATE * (PAUSE_DURATION_MS / 1000));
        
        addLog(`Анализ аудио... Размер блока: ${chunkSize} семплов, Шаг: ${stepSize} семплов`);

        const detectedTones: string[] = [];
        let lastTone: string | null = null;
        let lastToneTime = -Infinity;

        for (let i = 0; i + chunkSize <= data.length; i += stepSize) {
            const chunk = data.slice(i, i + chunkSize);
            const tone = detectTone(chunk, SAMPLE_RATE);
            
            if(tone) {
                const currentTime = (i / SAMPLE_RATE) * 1000;
                if (tone !== lastTone || (currentTime > lastToneTime + TONE_DURATION_MS * 1.5)) {
                    detectedTones.push(tone);
                    lastToneTime = currentTime;
                    addLog(`Обнаружен тон: '${tone}' на ${currentTime.toFixed(0)}мс`);
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
    } catch(error) {
         addLog(`Критическая ошибка при декодировании аудио: ${(error as Error).message}`, 'error');
         return null;
    }
}
