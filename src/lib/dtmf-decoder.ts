
// Implements the Goertzel algorithm for DTMF tone detection.
// This is a local, offline alternative to AI-based decoding.

import { REVERSE_CHAR_MAP } from './dtmf';

const TONE_DURATION_MS = 100;
const PAUSE_DURATION_MS = 50; 
const THRESHOLD = 100; 
const SAMPLE_RATE = 44100;
const DEBOUNCE_MS = 150; // Ignore same tone detection within this time

const DTMF_FREQUENCIES: { [key: string]: [number, number] } = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477], 'A': [697, 1633],
  '4': [770, 1209], '5': [770, 1336], '6': [770, 1477], 'B': [770, 1633],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477], 'C': [852, 1633],
  '*': [941, 1209], '0': [941, 1336], '#': [941, 1477], 'D': [941, 1633],
};

const DTMF_MAP: { [key: string]: string } = {
    "697,1209": "1", "697,1336": "2", "697,1477": "3",
    "770,1209": "4", "770,1336": "5", "770,1477": "6",
    "852,1209": "7", "852,1336": "8", "852,1477": "9",
    "941,1209": "*", "941,1336": "0", "941,1477": "#",
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

function decodeSequence(sequence: string[], addLog: (message: string, type?: 'info' | 'error' | 'warning') => void): string | null {
    addLog(`Запуск декодирования последовательности: [${sequence.join(',')}]`);

    const startIdx = sequence.indexOf('*');
    if (startIdx === -1) {
        addLog('Стартовый символ * не найден. Декодирование невозможно.', 'error');
        return null;
    }
    addLog(`Стартовый символ * найден на позиции ${startIdx}.`);

    let payload = sequence.slice(startIdx + 1);

    const endIdx = payload.lastIndexOf('#');
    if (endIdx === -1) {
        addLog('Стоповый символ # не найден. Сообщение может быть неполным.', 'warning');
    } else {
        addLog(`Стоповый символ # найден. Обрезаем пакет данных.`);
        payload = payload.slice(0, endIdx);
    }
    
    addLog(`Обнаружен пакет данных: [${payload.join(',')}]`);

    if (payload.some(tone => tone === '*' || tone === '#')) {
        addLog('Внутри пакета данных обнаружены недопустимые служебные символы (* или #). Декодирование прервано.', 'error');
        return null;
    }
    
    if (payload.length % 2 !== 0) {
        addLog(`Длина пакета данных нечетная (${payload.length}). Сообщение повреждено. Декодирование прервано.`, 'error');
        return null;
    }

    if (payload.length === 0) {
        addLog(`Пакет данных пуст.`, 'warning');
        return '';
    }
    
    let result = '';
    for (let i = 0; i < payload.length; i += 2) {
        const codePair = payload[i] + payload[i + 1];
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
     try {
        const buffer = await audioContext.decodeAudioData(arrayBuffer);
        return buffer;
     } catch (e) {
        console.error(`Не удалось декодировать аудиоданные: ${(e as Error).message}`);
        throw e;
     }
}

export async function decodeDtmfFromAudio(blob: Blob, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void): Promise<string | null> {
    try {
        const originalAudioBuffer = await getAudioContext(blob);
        addLog(`Аудиофайл успешно загружен. Длительность: ${originalAudioBuffer.duration.toFixed(2)}с, Частота: ${originalAudioBuffer.sampleRate}Гц`);
        
        addLog('Применение цифровых фильтров для очистки аудио...');
        const offlineCtx = new OfflineAudioContext(
            originalAudioBuffer.numberOfChannels,
            originalAudioBuffer.duration * SAMPLE_RATE,
            SAMPLE_RATE
        );

        const source = offlineCtx.createBufferSource();
        source.buffer = originalAudioBuffer;

        const highPass = offlineCtx.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 650; 

        const lowPass = offlineCtx.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = 1700;

        source.connect(highPass);
        highPass.connect(lowPass);
        lowPass.connect(offlineCtx.destination);
        source.start();

        const filteredBuffer = await offlineCtx.startRendering();
        addLog('Фильтрация завершена.');
        
        const data = filteredBuffer.getChannelData(0);
        const toneSamples = Math.floor(SAMPLE_RATE * (TONE_DURATION_MS / 1000));
        const pauseSamples = Math.floor(SAMPLE_RATE * (PAUSE_DURATION_MS / 1000));
        const stepSamples = Math.floor(toneSamples / 2);
        
        addLog(`Анализ аудио... Длительность тона: ${toneSamples} семплов, Пауза: ${pauseSamples} семплов`);

        const detectedTones: string[] = [];
        let lastTone: string | null = null;
        let lastToneTime = -Infinity;

        let i = 0;
        while (i + toneSamples <= data.length) {
            const chunk = data.slice(i, i + toneSamples);
            const currentTone = detectTone(chunk, SAMPLE_RATE);
            
            if (currentTone) {
                const currentTime = i / SAMPLE_RATE * 1000;
                const timeSinceLast = currentTime - lastToneTime;

                if (currentTone !== lastTone || timeSinceLast > DEBOUNCE_MS) {
                    detectedTones.push(currentTone);
                    addLog(`Обнаружен тон: '${currentTone}' на ${currentTime.toFixed(0)}мс`);
                    lastTone = currentTone;
                    lastToneTime = currentTime;
                     if (currentTone === '#') {
                        addLog("Обнаружен стоповый символ '#'. Завершение анализа.");
                        break; 
                    }
                    i += toneSamples;
                } else {
                    i += stepSamples;
                }
            } else {
                lastTone = null;
                i += stepSamples;
            }
        }
        
        const decoded = decodeSequence(detectedTones, addLog);
        return decoded;

    } catch(error) {
         addLog(`Критическая ошибка при декодировании аудио: ${(error as Error).message}`, 'error');
         return null;
    }
}
