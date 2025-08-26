// Implements the Goertzel algorithm for DTMF tone detection.
// This is a local, offline alternative to AI-based decoding.

import { DTMF_FREQUENCIES, CHAR_MAP } from './dtmf';

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

// Create a reverse map for decoding
const REVERSE_CHAR_MAP: { [key: string]: string } = Object.entries(CHAR_MAP).reduce((acc, [key, value]) => {
    acc[value] = key;
    return acc;
}, {} as { [key: string]: string });


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
    if (!sequence || sequence.length < 2) {
        addLog('Последовательность слишком коротка для декодирования.', 'warning');
        return '';
    }
    addLog(`Начало декодирования последовательности: [${sequence.join(', ')}]`);

    let result = '';
    for (let i = 0; i < sequence.length - 1; i += 2) {
        const codePair = sequence[i] + sequence[i + 1];
        const char = REVERSE_CHAR_MAP[codePair];
        if (char) {
            result += char;
            addLog(`Пара '${codePair}' -> Символ '${char}'. Текущий результат: "${result}"`);
        } else {
            addLog(`Неизвестная кодовая пара '${codePair}', пропускается.`, 'warning');
        }
    }
    
    addLog(`Декодирование завершено. Итоговый результат: "${result}"`);
    return result;
}


async function getAudioContext(blob: Blob): Promise<AudioBuffer> {
     const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE });
     const arrayBuffer = await blob.arrayBuffer();
     // Add a custom log function to avoid undefined issues in this scope
     const localLog = (msg: string, type: 'error' | 'info' | 'warning' = 'info') => console.log(`[${type.toUpperCase()}] ${msg}`);
     try {
        const buffer = await audioContext.decodeAudioData(arrayBuffer);
        return buffer;
     } catch (e) {
        localLog(`Не удалось декодировать аудиоданные: ${(e as Error).message}`, 'error');
        throw e;
     }
}

export async function decodeDtmfFromAudio(blob: Blob, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void): Promise<string | null> {
    try {
        const audioBuffer = await getAudioContext(blob);
        addLog(`Аудиофайл успешно загружен. Длительность: ${audioBuffer.duration.toFixed(2)}с, Частота: ${audioBuffer.sampleRate}Гц`);
        
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
        const stepSize = Math.floor(SAMPLE_RATE * ((TONE_DURATION_MS + PAUSE_DURATION_MS) / 1000));
        
        addLog(`Анализ аудио... Размер блока: ${chunkSize} семплов, Шаг: ${stepSize} семплов`);

        const detectedTones: string[] = [];
        let i = 0;
        while (i + chunkSize <= data.length) {
            const chunk = data.slice(i, i + chunkSize);
            const tone = detectTone(chunk, SAMPLE_RATE);
            
            if (tone) {
                const currentTime = (i / SAMPLE_RATE) * 1000;
                addLog(`Обнаружен тон: '${tone}' на ${currentTime.toFixed(0)}мс`);
                detectedTones.push(tone);
                // Skip past the detected tone and the following pause
                i += stepSize; 
            } else {
                // If no tone, advance by a smaller amount to not miss the start of a tone
                i += Math.floor(chunkSize / 4);
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
