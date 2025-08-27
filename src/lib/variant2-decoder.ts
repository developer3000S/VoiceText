
import { decodeDtmfFromAudio, DecodedResult } from './dtmf-decoder';

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
            const byteIndex = Math.floor(i / 8);
            const bitIndexInByte = i % 8;
            bytes[byteIndex] |= 1 << (7 - bitIndexInByte);
        }
    }
    return bytes;
}

function processBitSequence(bits: number[], addLog: (message: string, type?: 'info' | 'error' | 'warning') => void, password?: string): DecodedResult {
    if (bits.length < 24) { // Header (16) + CRC (8)
        return { text: null, error: 'Последовательность слишком короткая, отсутствует заголовок или CRC.', requiresPassword: false };
    }

    const headerBits = bits.slice(0, 16);
    const dataAndCrcBits = bits.slice(16);

    const headerBytes = bitsToBytes(headerBits);
    const dataLength = headerBytes[0];
    const isEncrypted = headerBytes[1] === 0x01;
    addLog(`(V2) Заголовок: Длина=${dataLength}, Шифрование=${isEncrypted}`);

    const expectedDataAndCrcBits = (dataLength * 8) + 8;
    if (dataAndCrcBits.length < expectedDataAndCrcBits) {
        const err = `Несоответствие длины данных. Заголовок: ${dataLength} байт, получено бит для данных и CRC: ${dataAndCrcBits.length}`;
        addLog(`(V2) ${err}`, 'error');
        return { text: null, error: err, requiresPassword: isEncrypted };
    }

    // Trim any extra bits at the end
    const validDataAndCrcBits = dataAndCrcBits.slice(0, expectedDataAndCrcBits);

    const dataBits = validDataAndCrcBits.slice(0, dataLength * 8);
    const receivedCrcBits = validDataAndCrcBits.slice(dataLength * 8);

    const dataBytes = bitsToBytes(dataBits);
    const receivedCrc = bitsToBytes(receivedCrcBits)[0];

    addLog(`(V2) Получен CRC: 0x${receivedCrc.toString(16)}`);

    const dataToVerify = new Uint8Array([...headerBytes, ...dataBytes]);
    const calculatedCrc = crc8(dataToVerify);
    addLog(`(V2) Вычислен CRC: 0x${calculatedCrc.toString(16)}`);

    if (receivedCrc !== calculatedCrc) {
        const err = `Ошибка CRC! Ожидалось 0x${calculatedCrc.toString(16)}, получено 0x${receivedCrc.toString(16)}. Данные повреждены.`;
        addLog(`(V2) ${err}`, 'error');
        return { text: null, error: err, requiresPassword: isEncrypted };
    }
    addLog('(V2) Проверка CRC успешна.', 'info');

    if (isEncrypted && (!password || password.length === 0)) {
        addLog('(V2) Сообщение зашифровано, требуется пароль.', 'warning');
        return { text: null, requiresPassword: true };
    }

    let resultBytes = dataBytes;
    if (isEncrypted && password) {
        addLog(`(V2) Расшифровка текста с паролем...`);
        const keyEncoder = new TextEncoder();
        const keyData = keyEncoder.encode(password);
        const decryptedData = dataBytes.map((byte, i) => byte ^ keyData[i % keyData.length]);
        resultBytes = new Uint8Array(decryptedData);
    }

    try {
        const decodedText = new TextDecoder('utf-8', { fatal: true }).decode(resultBytes);
        return { text: decodedText, requiresPassword: isEncrypted };
    } catch (e) {
        const err = "Ошибка декодирования UTF-8. Данные повреждены или неверный пароль.";
        addLog(`(V2) ${err}`, 'error');
        return { text: null, error: err, requiresPassword: isEncrypted };
    }
}


export async function decodeVtpFromAudio(blob: Blob, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void, password?: string): Promise<DecodedResult> {
    try {
        const detectedTones = await decodeDtmfFromAudio(blob, addLog);

        if (!detectedTones) {
            return { text: null, error: "DTMF-декодер не вернул последовательность.", requiresPassword: false };
        }
        
        let preambleFound = false;
        let startIdx = -1;
        for (let i = 0; i <= detectedTones.length - 7; i++) {
            if (
                detectedTones[i] === '1' && detectedTones[i+1] === '0' &&
                detectedTones[i+2] === '1' && detectedTones[i+3] === '0' &&
                detectedTones[i+4] === '1' && detectedTones[i+5] === '0' &&
                detectedTones[i+6] === '*'
            ) {
                preambleFound = true;
                startIdx = i + 7;
                break;
            }
        }

        if (!preambleFound) {
            return { text: null, error: "Преамбула V2 и стартовый символ * не найдены.", requiresPassword: false };
        }

        const endIdx = detectedTones.lastIndexOf('#');
        if (endIdx === -1 || endIdx < startIdx) {
            return { text: null, error: "Стоповый символ # не найден.", requiresPassword: false };
        }

        const bitTones = detectedTones.slice(startIdx, endIdx);
        addLog(`(V2) Получена битовая последовательность для анализа: ${bitTones.length} бит`);

        const bits = bitTones.map(tone => parseInt(tone, 10)).filter(bit => !isNaN(bit));

        if (bits.length !== bitTones.length) {
            return { text: null, error: "Обнаружены невалидные символы в битовой последовательности.", requiresPassword: false };
        }

        return processBitSequence(bits, addLog, password);

    } catch (error) {
        const err = `Критическая ошибка декодирования V2: ${(error as Error).message}`;
        addLog(err, 'error');
        return { text: null, error: err, requiresPassword: false };
    }
}

export function decodeVtpFromSequence(bits: number[], addLog: (message: string, type?: 'info' | 'error' | 'warning') => void, password?: string): DecodedResult {
    try {
        return processBitSequence(bits, addLog, password);
    } catch(e) {
        const err = `Критическая ошибка при ручном декодировании V2: ${(e as Error).message}`;
        addLog(err, 'error');
        return { text: null, error: err, requiresPassword: false };
    }
}
