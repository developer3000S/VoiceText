
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
    
    // Convert text to UTF-8 bytes
    const textEncoder = new TextEncoder();
    const dataBytes = textEncoder.encode(text);
    
    if (dataBytes.length > 255) {
        throw new Error("Сообщение превышает максимальную длину в 255 байт.");
    }
    
    addLog(`(V2) Текст преобразован в ${dataBytes.length} байт (UTF-8).`);

    // Create header (2 bytes)
    const headerBytes = new Uint8Array([dataBytes.length, 0x01]); // Length + Packet Type (text)

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
    
    // Use the main DTMF sequence generator, passing the bit string as the payload.
    // The V1 encoder will handle passwords and framing (*, #, preamble).
    return textToDtmfSequence(bitString, addLog, password, true); // isV2 = true
}
