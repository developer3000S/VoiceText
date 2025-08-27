
import * as Tone from 'tone';

const BIT_RATE = 100; // 100 baud
const BIT_DURATION_S = 1 / BIT_RATE; // 0.01s or 10ms
const FREQ_0 = 1000;
const FREQ_1 = 2000;
const POSTAMBLE_FREQ = 1500;
const POSTAMBLE_DURATION_S = 0.02; // 20ms

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

// --- Text to Packet Conversion ---
export function textToVtpPacket(text: string, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void): number[] {
    addLog(`Начало кодирования по протоколу VTP: "${text}"`);
    
    // Convert text to UTF-8 bytes
    const textEncoder = new TextEncoder();
    const dataBytes = textEncoder.encode(text);
    
    if (dataBytes.length > 255) {
        throw new Error("Сообщение превышает максимальную длину в 255 байт.");
    }
    
    addLog(`Текст преобразован в ${dataBytes.length} байт (UTF-8).`);

    // Create header (2 bytes)
    const headerBytes = new Uint8Array([dataBytes.length, 0x01]); // Length + Packet Type (text)

    // Calculate CRC-8
    const dataToCrc = new Uint8Array([...headerBytes, ...dataBytes]);
    const crcValue = crc8(dataToCrc);
    addLog(`CRC-8 вычислен: 0x${crcValue.toString(16)}`);

    // --- Assemble the full bit sequence ---
    const bits: number[] = [];
    
    // 1. Preamble (16 bits: 1010101010101010)
    for (let i = 0; i < 16; i++) {
        bits.push(i % 2 === 0 ? 1 : 0);
    }
    addLog(`Добавлена преамбула (16 бит).`);

    // Helper to convert bytes to LSB-first bits
    const addBytesToBits = (bytes: Uint8Array) => {
        bytes.forEach(byte => {
            for (let i = 0; i < 8; i++) {
                bits.push((byte >> i) & 1);
            }
        });
    };

    // 2. Header
    addBytesToBits(headerBytes);
    addLog(`Добавлен заголовок (16 бит).`);
    
    // 3. Data
    addBytesToBits(dataBytes);
    addLog(`Добавлены данные (${dataBytes.length * 8} бит).`);
    
    // 4. CRC
    addBytesToBits(new Uint8Array([crcValue]));
    addLog(`Добавлен CRC-8 (8 бит).`);

    addLog(`Кодирование завершено. Общая длина битовой последовательности: ${bits.length} бит.`);
    return bits;
}


// --- Audio Generation ---

export async function playVtpSequence(bits: number[]) {
  await Tone.start();
  const synth = new Tone.Synth().toDestination();
  let time = Tone.now();

  // Preamble, Header, Data, CRC
  for (const bit of bits) {
    const freq = bit === 1 ? FREQ_1 : FREQ_0;
    synth.triggerAttackRelease(freq, BIT_DURATION_S, time);
    time += BIT_DURATION_S;
  }
  
  // Postamble
  synth.triggerAttackRelease(POSTAMBLE_FREQ, POSTAMBLE_DURATION_S, time);
}

export async function renderVtpSequenceToAudioBuffer(bits: number[]): Promise<AudioBuffer> {
    const totalDuration = (bits.length * BIT_DURATION_S) + POSTAMBLE_DURATION_S;

    if (totalDuration === 0) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        return audioContext.createBuffer(1, 1, audioContext.sampleRate);
    }

    return Tone.Offline((context) => {
        const synth = new Tone.Synth().toDestination();
        let time = 0;
        
        for (const bit of bits) {
            const freq = bit === 1 ? FREQ_1 : FREQ_0;
            synth.triggerAttackRelease(freq, BIT_DURATION_S, time);
            time += BIT_DURATION_S;
        }
        
        synth.triggerAttackRelease(POSTAMBLE_FREQ, POSTAMBLE_DURATION_S, time);
    }, totalDuration);
}
