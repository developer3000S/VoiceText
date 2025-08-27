
import { textToDtmfSequence } from './dtmf';

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

// Convert a byte array to a bit string ('0' and '1')
function bytesToBitString(bytes: Uint8Array): string {
    let bits = '';
    for (const byte of bytes) {
        bits += byte.toString(2).padStart(8, '0');
    }
    return bits;
}


// --- Text to Packet Conversion ---
export function textToVtpSequence(text: string, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void, password?: string): string {
    addLog(`(V2) Начало кодирования по протоколу VTP: "${text}"`);
    const isEncrypted = !!password && password.length > 0;
    
    // Convert text to UTF-8 bytes
    let dataBytes: Uint8Array;
    if (isEncrypted) {
        addLog(`(V2) Шифрование текста с паролем...`);
        // This is a simple placeholder for encryption logic.
        // For a real application, a more robust encryption library should be used.
        const encoder = new TextEncoder();
        const keyEncoder = new TextEncoder();
        const textData = encoder.encode(text);
        const keyData = keyEncoder.encode(password);
        const encryptedData = textData.map((byte, i) => byte ^ keyData[i % keyData.length]);
        dataBytes = new Uint8Array(encryptedData);
    } else {
        const encoder = new TextEncoder();
        dataBytes = encoder.encode(text);
    }
    
    if (dataBytes.length > 255) {
        throw new Error("Сообщение превышает максимальную длину в 255 байт.");
    }
    
    addLog(`(V2) Текст преобразован в ${dataBytes.length} байт (UTF-8).`);

    // Create header (2 bytes)
    const headerBytes = new Uint8Array([dataBytes.length, isEncrypted ? 0x01 : 0x00]); // Length + Encryption Flag

    // Calculate CRC-8
    const dataToCrc = new Uint8Array([...headerBytes, ...dataBytes]);
    const crcValue = crc8(dataToCrc);
    addLog(`(V2) CRC-8 вычислен: 0x${crcValue.toString(16)}`);

    const crcByte = new Uint8Array([crcValue]);

    // Assemble the full packet
    const fullPacketBytes = new Uint8Array([...headerBytes, ...dataBytes, ...crcByte]);

    // Convert the entire binary packet to a string of '0's and '1's
    const bitString = bytesToBitString(fullPacketBytes);
    addLog(`(V2) Пакет в бинарном виде: ${bitString}`);
    
    // The VTP bit string is now the payload for a DTMF-like transmission
    const preamble = '1,0,1,0,1,0';
    const finalSequence = `${preamble},*,${bitString.split('').join(',')},#`;
    
    addLog(`Кодирование завершено.`);
    return finalSequence;
}
