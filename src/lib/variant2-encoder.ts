
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

// Helper to convert a byte array to a hex string
function bytesToHex(bytes: Uint8Array): string {
  return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
}


// --- Text to Packet Conversion ---
export function textToVtpPacket(text: string, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void, password?: string): string {
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

    // Convert the entire packet to a hex string
    const hexPacket = bytesToHex(fullPacketBytes);
    addLog(`(V2) Пакет в HEX: ${hexPacket}`);
    
    // Use the main DTMF sequence generator, which now handles preambles and passwords
    return textToDtmfSequence(hexPacket, addLog, password, true);
}
