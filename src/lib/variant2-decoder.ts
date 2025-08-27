
import * as Tone from 'tone';

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

const FREQ_THRESHOLD = 50;
const GOERTZEL_THRESHOLD = 1e6; // Significantly lowered threshold for better sensitivity

export interface DecodedResult {
    text: string | null;
    error?: string;
    requiresPassword?: false; // V2 doesn't support passwords
}

// --- Goertzel Algorithm for frequency detection ---
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
    
    processChunk(chunk: Float32Array) {
        for (const sample of chunk) {
            this.process(sample);
        }
    }

    getPower(): number {
        return this.s2 * this.s2 + this.s1 * this.s1 - this.coeff * this.s1 * this.s2;
    }
    
    reset() {
        this.s1 = 0;
        this.s2 = 0;
    }
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

// --- Main Decoding Logic ---

async function getAudioData(blob: Blob): Promise<Float32Array> {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer.getChannelData(0);
}

function findPreamble(data: Float32Array, addLog: (msg: string, type?: any) => void): number {
    const preambleChunkSize = BIT_DURATION_SAMPLES;
    const goertzel0 = new Goertzel(FREQ_0, SAMPLE_RATE);
    const goertzel1 = new Goertzel(FREQ_1, SAMPLE_RATE);
    
    let lastBit = -1;
    let preambleCount = 0;

    // Use a smaller step for a sliding window approach to not miss the start
    const step = Math.floor(preambleChunkSize / 4);

    for (let i = 0; i < data.length - preambleChunkSize; i += step) {
        const chunk = data.slice(i, i + preambleChunkSize);
        
        goertzel0.reset();
        goertzel1.reset();
        
        goertzel0.processChunk(chunk);
        goertzel1.processChunk(chunk);

        const power0 = goertzel0.getPower();
        const power1 = goertzel1.getPower();

        let currentBit = -1;
        if (power1 > GOERTZEL_THRESHOLD && power1 > power0) {
            currentBit = 1;
        } else if (power0 > GOERTZEL_THRESHOLD && power0 > power1) {
            currentBit = 0;
        }

        if (currentBit !== -1) {
            if (preambleCount === 0 && currentBit === 1) { // Preamble must start with 1
                preambleCount = 1;
                lastBit = 1;
            } else if (preambleCount > 0 && currentBit !== lastBit) {
                preambleCount++;
                lastBit = currentBit;
                if (preambleCount >= PREAMBLE_BITS) {
                    addLog(`Преамбула найдена на позиции ${i + preambleChunkSize} семплов.`, 'info');
                    return i + preambleChunkSize; // Return the position AFTER the preamble
                }
            } else if (preambleCount > 0 && currentBit === lastBit) {
                 // The bit is the same, this breaks the 101010 pattern, so reset.
                 preambleCount = 0;
                 lastBit = -1;
            }
             else {
                preambleCount = 0; // Reset if the pattern is not met
            }
        } else {
            preambleCount = 0; // Reset if no clear bit is detected
        }
    }
    addLog('Преамбула не найдена.', 'error');
    return -1;
}

function readBits(data: Float32Array, startIndex: number, bitCount: number, addLog: (msg: string, type?: any) => void): number[] | null {
    const bits: number[] = [];
    const goertzel0 = new Goertzel(FREQ_0, SAMPLE_RATE);
    const goertzel1 = new Goertzel(FREQ_1, SAMPLE_RATE);

    for (let i = 0; i < bitCount; i++) {
        const chunkStart = startIndex + i * BIT_DURATION_SAMPLES;
        if (chunkStart + BIT_DURATION_SAMPLES > data.length) {
            addLog(`Неожиданный конец файла при чтении бита ${i + 1}.`, 'error');
            return null;
        }
        const chunk = data.slice(chunkStart, chunkStart + BIT_DURATION_SAMPLES);
        
        goertzel0.reset();
        goertzel1.reset();

        goertzel0.processChunk(chunk);
        goertzel1.processChunk(chunk);

        const power0 = goertzel0.getPower();
        const power1 = goertzel1.getPower();

        if (power1 > GOERTZEL_THRESHOLD && power1 > power0) {
            bits.push(1);
        } else if (power0 > GOERTZEL_THRESHOLD && power0 > power1) {
            bits.push(0);
        } else {
            addLog(`Не удалось определить бит на позиции ${i + 1}. Сигналы слишком слабые.`, 'warning');
            bits.push(0); // Assume 0 on failure
        }
    }
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
        const audioData = await getAudioData(blob);
        addLog(`Аудиофайл загружен. Семплов: ${audioData.length}, Частота: ${SAMPLE_RATE}Гц`);

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
