
import * as Tone from 'tone';
import { FFT } from 'tone';

const SAMPLE_RATE = 44100;
const PREAMBLE_BITS = 16;
const HEADER_BYTES = 2;
const CRC_BYTES = 1;
const BIT_DURATION_MS = 10;
const BIT_DURATION_SAMPLES = Math.floor(SAMPLE_RATE * (BIT_DURATION_MS / 1000));
const PREAMBLE_DURATION_MS = PREAMBLE_BITS * BIT_DURATION_MS;

const FREQ_0 = 1000;
const FREQ_1 = 2000;
const POSTAMBLE_FREQ = 1500;
const FFT_SIZE = 2048;

export interface DecodedResult {
    text: string | null;
    error?: string;
    requiresPassword?: false; // V2 doesn't support passwords
}

// --- CRC-8 Calculation ---
function crc8(data: Uint8Array): number {
    let crc = 0x00;
    const poly = 0x07;
    for (const byte of data) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) {
            if (crc & 0x80) {
                crc = (crc << 1) ^ poly;
            } else {
                crc <<= 1;
            }
        }
    }
    return crc & 0xFF;
}

async function getFilteredAudioBuffer(blob: Blob): Promise<AudioBuffer> {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    const arrayBuffer = await blob.arrayBuffer();
    const originalBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Filter to isolate our frequencies of interest
    const offlineCtx = new OfflineAudioContext(originalBuffer.numberOfChannels, originalBuffer.length, originalBuffer.sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = originalBuffer;

    const highPass = offlineCtx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 900; // Cut off below our lowest freq (1000 Hz)

    const lowPass = offlineCtx.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 2100; // Cut off above our highest freq (2000 Hz)

    source.connect(highPass);
    highPass.connect(lowPass);
    lowPass.connect(offlineCtx.destination);
    source.start();

    return offlineCtx.startRendering();
}


function detectBit(chunk: Float32Array, fft: FFT): number | null {
    const magnitudes = fft.analyse(chunk);
    const freq0Index = Math.round(FREQ_0 / (SAMPLE_RATE / FFT_SIZE));
    const freq1Index = Math.round(FREQ_1 / (SAMPLE_RATE / FFT_SIZE));

    const power0 = magnitudes[freq0Index];
    const power1 = magnitudes[freq1Index];
    
    // Use a sensitive threshold, assuming filtering has removed most noise.
    const THRESHOLD = -60; // dB

    if (power0 < THRESHOLD && power1 < THRESHOLD) {
        return null; // Silence or noise
    }

    // A bit is detected if its power is significantly higher than the other.
    if (power1 > power0 + 10 && power1 > THRESHOLD) { // +10dB difference
        return 1;
    }
    if (power0 > power1 + 10 && power0 > THRESHOLD) {
        return 0;
    }

    return null;
}


function findPreamble(data: Float32Array, addLog: (msg: string, type?: any) => void): number {
    const fft = new FFT(FFT_SIZE);
    let lastBit = -1;
    let alternatingBitsCount = 0;
    const step = Math.floor(BIT_DURATION_SAMPLES / 2); // Overlap for more robust detection

    for (let i = 0; i <= data.length - BIT_DURATION_SAMPLES; i += step) {
        const chunk = data.slice(i, i + BIT_DURATION_SAMPLES);
        const currentBit = detectBit(chunk, fft);

        if (currentBit !== null) {
            // Preamble must start with 1
            if (alternatingBitsCount === 0 && currentBit === 1) {
                alternatingBitsCount = 1;
                lastBit = 1;
            } 
            // If we have started, and the current bit is different from the last one
            else if (alternatingBitsCount > 0 && currentBit !== lastBit) {
                alternatingBitsCount++;
                lastBit = currentBit;
                // We'll be more lenient: accept if we get at least 14 correct alternating bits
                if (alternatingBitsCount >= 14) { 
                    const preambleEndIndex = i + BIT_DURATION_SAMPLES + ((PREAMBLE_BITS - alternatingBitsCount) * BIT_DURATION_SAMPLES);
                    addLog(`Преамбула найдена с ${alternatingBitsCount}/16 бит на позиции ${preambleEndIndex} семплов.`, 'info');
                    fft.dispose();
                    return preambleEndIndex; // Return the position AFTER the full preamble
                }
            } 
            // If the alternating pattern is broken, reset
            else if (alternatingBitsCount > 0 && currentBit === lastBit) {
                 alternatingBitsCount = 0;
                 lastBit = -1;
            }
        }
    }
    fft.dispose();
    addLog('Преамбула не найдена.', 'error');
    return -1;
}

function readBits(data: Float32Array, startIndex: number, bitCount: number, addLog: (msg: string, type?: any) => void): number[] | null {
    const fft = new FFT(FFT_SIZE);
    const bits: number[] = [];
    
    for (let i = 0; i < bitCount; i++) {
        const chunkStart = startIndex + i * BIT_DURATION_SAMPLES;
        if (chunkStart + BIT_DURATION_SAMPLES > data.length) {
            addLog(`Неожиданный конец файла при чтении бита ${i + 1}.`, 'error');
            fft.dispose();
            return null;
        }
        const chunk = data.slice(chunkStart, chunkStart + BIT_DURATION_SAMPLES);
        const bit = detectBit(chunk, fft);

        if (bit !== null) {
            bits.push(bit);
        } else {
             addLog(`Не удалось определить бит на позиции ${i + 1}. Сигналы слишком слабые.`, 'warning');
             bits.push(0); // Assume 0 on failure to avoid stopping the whole process
        }
    }
    fft.dispose();
    return bits;
}


function bitsToBytes(bits: number[]): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
        let byte = 0;
        for (let j = 0; j < 8; j++) {
            const bitIndex = i * 8 + j;
            if (bitIndex < bits.length && bits[bitIndex] === 1) {
                // LSB first, so we set the j-th bit
                byte |= (1 << j);
            }
        }
        bytes[i] = byte;
    }
    return bytes;
}

export async function decodeVtpFromAudio(blob: Blob, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void): Promise<DecodedResult> {
    try {
        addLog(`Применение цифровых фильтров к V2 аудио...`);
        const filteredAudioBuffer = await getFilteredAudioBuffer(blob);
        const audioData = filteredAudioBuffer.getChannelData(0);
        addLog(`Аудиофайл отфильтрован. Семплов: ${audioData.length}, Частота: ${SAMPLE_RATE}Гц`);

        const preambleEndIndex = findPreamble(audioData, addLog);
        if (preambleEndIndex === -1) {
            return { text: null, error: 'Не удалось найти преамбулу. Сигнал отсутствует или поврежден.' };
        }

        let currentIndex = preambleEndIndex;

        // 1. Read Header
        const headerBits = readBits(audioData, currentIndex, HEADER_BYTES * 8, addLog);
        if (!headerBits) return { text: null, error: 'Ошибка чтения заголовка.' };
        currentIndex += HEADER_BYTES * 8 * BIT_DURATION_SAMPLES;
        const headerBytes = bitsToBytes(headerBits);
        const dataLength = headerBytes[0];
        const packetType = headerBytes[1];
        addLog(`Заголовок прочитан: Длина данных = ${dataLength} байт, Тип пакета = ${packetType}`);

        if (dataLength === 0) {
             return { text: "Пустой пакет получен.", error: undefined };
        }
        if (dataLength > 255) {
             return { text: null, error: `Неверная длина данных: ${dataLength}.` };
        }
        
        // 2. Read Data
        const dataBits = readBits(audioData, currentIndex, dataLength * 8, addLog);
        if (!dataBits) return { text: null, error: 'Ошибка чтения данных.' };
        currentIndex += dataLength * 8 * BIT_DURATION_SAMPLES;
        const dataBytes = bitsToBytes(dataBits);

        // 3. Read CRC
        const crcBits = readBits(audioData, currentIndex, CRC_BYTES * 8, addLog);
        if (!crcBits) return { text: null, error: 'Ошибка чтения CRC.' };
        const receivedCrc = bitsToBytes(crcBits)[0];
        addLog(`CRC получен: 0x${receivedCrc.toString(16)}`);
        
        // 4. Verify CRC
        const dataToVerify = new Uint8Array([...headerBytes, ...dataBytes]);
        const calculatedCrc = crc8(dataToVerify);
        addLog(`CRC вычислен: 0x${calculatedCrc.toString(16)}`);

        if (receivedCrc !== calculatedCrc) {
            const err = `Ошибка CRC! Ожидалось 0x${calculatedCrc.toString(16)}, получено 0x${receivedCrc.toString(16)}. Данные повреждены.`;
            addLog(err, 'error');
            return { text: null, error: err };
        }
        addLog('Проверка CRC успешна.', 'info');
        
        // 5. Decode text
        const decodedText = new TextDecoder('utf-8').decode(dataBytes);

        return { text: decodedText };

    } catch (error) {
        const err = `Критическая ошибка декодирования: ${(error as Error).message}`;
        addLog(err, 'error');
        return { text: null, error: err };
    }
}
