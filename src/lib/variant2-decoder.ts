
import { decodeDtmfFromAudio, DecodedResult as DtmfResult } from './dtmf-decoder';

export interface DecodedResult extends DtmfResult {}

// --- CRC-8 Calculation ---
// Polynomial: x^8 + x^2 + x + 1 => 0x07
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

function bitsToBytes(bits: number[]): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(bits.length / 8));
    for (let i = 0; i < bits.length; i++) {
        if (bits[i] === 1) {
            bytes[Math.floor(i / 8)] |= 1 << (7 - (i % 8));
        }
    }
    return bytes;
}

function processBitSequence(bits: number[], addLog: (message: string, type?: 'info' | 'error' | 'warning') => void): { text: string | null; error?: string } {
    if (bits.length < 24) { // Header (16) + CRC (8)
        return { text: null, error: 'Последовательность слишком короткая, отсутствует заголовок или CRC.' };
    }

    const headerBits = bits.slice(0, 16);
    const dataAndCrcBits = bits.slice(16);

    const headerBytes = bitsToBytes(headerBits);
    const dataLength = headerBytes[0];
    const packetType = headerBytes[1];

    if (dataAndCrcBits.length !== (dataLength * 8) + 8) {
        const err = `Несоответствие длины данных. Заголовок: ${dataLength} байт, получено бит для данных и CRC: ${dataAndCrcBits.length}`;
        addLog(`(V2) ${err}`, 'error');
        return { text: null, error: err };
    }

    const dataBits = dataAndCrcBits.slice(0, dataLength * 8);
    const receivedCrcBits = dataAndCrcBits.slice(dataLength * 8);

    const dataBytes = bitsToBytes(dataBits);
    const receivedCrc = bitsToBytes(receivedCrcBits)[0];

    addLog(`(V2) Заголовок: Длина=${dataLength}, Тип=${packetType}. Получен CRC: 0x${receivedCrc.toString(16)}`);

    const dataToVerify = new Uint8Array([...headerBytes, ...dataBytes]);
    const calculatedCrc = crc8(dataToVerify);
    addLog(`(V2) Вычислен CRC: 0x${calculatedCrc.toString(16)}`);

    if (receivedCrc !== calculatedCrc) {
        const err = `Ошибка CRC! Ожидалось 0x${calculatedCrc.toString(16)}, получено 0x${receivedCrc.toString(16)}. Данные повреждены.`;
        addLog(`(V2) ${err}`, 'error');
        return { text: null, error: err };
    }
    addLog('(V2) Проверка CRC успешна.', 'info');

    const decodedText = new TextDecoder('utf-8').decode(dataBytes);
    return { text: decodedText };
}

// --- Main decoding function for audio files ---
export async function decodeVtpFromAudio(blob: Blob, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void, password?: string): Promise<DecodedResult> {
    try {
        const dtmfResult = await decodeDtmfFromAudio(blob, addLog, password, true);

        if (dtmfResult.error) {
            return { ...dtmfResult, text: null };
        }

        // The dtmfResult.text for V2 is now the decrypted sequence of bits (0s and 1s)
        const bitString = dtmfResult.text;
        if (!bitString) {
            return { text: null, error: "DTMF-декодер не вернул битовую последовательность.", requiresPassword: dtmfResult.requiresPassword };
        }
        
        addLog(`(V2) Получена битовая последовательность для анализа: ${bitString.length} бит`);
        const bits = bitString.split('').map(b => parseInt(b, 10));

        const { text, error } = processBitSequence(bits, addLog);

        return { ...dtmfResult, text, error };

    } catch (error) {
        const err = `Критическая ошибка декодирования V2: ${(error as Error).message}`;
        addLog(err, 'error');
        return { text: null, error: err, requiresPassword: false };
    }
}

// --- Main decoding function for manual sequence ---
export function decodeVtpFromSequence(bits: number[], addLog: (message: string, type?: 'info' | 'error' | 'warning') => void, password?: string): DecodedResult {
    // For manual decoding, we assume the bit sequence is the payload only (header + data + crc)
    // We don't deal with passwords here as the V1 method handles it before this stage.
    try {
        const { text, error } = processBitSequence(bits, addLog);
        return { text, error, requiresPassword: false }; // Manual entry assumes no encryption layer
    } catch(e) {
        const err = `Критическая ошибка при ручном декодировании V2: ${(e as Error).message}`;
        addLog(err, 'error');
        return { text: null, error: err, requiresPassword: false };
    }
}
