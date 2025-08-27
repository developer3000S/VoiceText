
import { decodeDtmfFromAudio } from './dtmf-decoder';

export interface DecodedResult {
    text: string | null;
    error?: string;
    requiresPassword?: false;
}

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

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}


// --- Main decoding function ---
export async function decodeVtpFromAudio(blob: Blob, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void): Promise<DecodedResult> {
    try {
        const dtmfResult = await decodeDtmfFromAudio(blob, addLog);
        
        if (!dtmfResult.extractedTones || dtmfResult.extractedTones.length < 3) { // *, payload, #
            return { text: null, error: 'Последовательность DTMF слишком короткая для пакета V2.' };
        }

        const sequence = dtmfResult.extractedTones;
        addLog(`(V2) Получена DTMF последовательность: ${sequence.join(',')}`);

        // 1. Check for Start (*) and End (#) markers
        if (sequence[0] !== '*' || sequence[sequence.length - 1] !== '#') {
            return { text: null, error: 'Отсутствуют маркеры начала (*) или конца (#) пакета V2.' };
        }
        
        const payloadHex = sequence.slice(1, -1).join('');
        addLog(`(V2) Полезная нагрузка (HEX): ${payloadHex}`);

        if (payloadHex.length % 2 !== 0) {
             return { text: null, error: 'Длина полезной нагрузки нечетная, не удается преобразовать из HEX.' };
        }

        const payloadBytes = hexToBytes(payloadHex);

        // 2. Extract components
        if (payloadBytes.length < 3) { // Header (2) + CRC (1)
            return { text: null, error: 'Пакет слишком короткий, отсутствует заголовок или CRC.' };
        }

        const headerBytes = payloadBytes.slice(0, 2);
        const dataLength = headerBytes[0];
        const packetType = headerBytes[1];

        const dataAndCrcBytes = payloadBytes.slice(2);
        if (dataAndCrcBytes.length !== dataLength + 1) {
            const err = `Несоответствие длины данных. Заголовок: ${dataLength}, получено: ${dataAndCrcBytes.length - 1}`;
            addLog(`(V2) ${err}`, 'error');
            return { text: null, error: err };
        }

        const dataBytes = dataAndCrcBytes.slice(0, dataLength);
        const receivedCrc = dataAndCrcBytes[dataAndCrcBytes.length - 1];

        addLog(`(V2) Заголовок: Длина=${dataLength}, Тип=${packetType}. Получен CRC: 0x${receivedCrc.toString(16)}`);

        // 3. Verify CRC
        const dataToVerify = new Uint8Array([...headerBytes, ...dataBytes]);
        const calculatedCrc = crc8(dataToVerify);
        addLog(`(V2) Вычислен CRC: 0x${calculatedCrc.toString(16)}`);

        if (receivedCrc !== calculatedCrc) {
            const err = `Ошибка CRC! Ожидалось 0x${calculatedCrc.toString(16)}, получено 0x${receivedCrc.toString(16)}. Данные повреждены.`;
            addLog(`(V2) ${err}`, 'error');
            return { text: null, error: err };
        }
        addLog('(V2) Проверка CRC успешна.', 'info');
        
        // 4. Decode text
        const decodedText = new TextDecoder('utf-8').decode(dataBytes);

        return { text: decodedText };

    } catch (error) {
        const err = `Критическая ошибка декодирования V2: ${(error as Error).message}`;
        addLog(err, 'error');
        return { text: null, error: err };
    }
}
