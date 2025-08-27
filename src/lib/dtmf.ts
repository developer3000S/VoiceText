
import * as Tone from 'tone';

const TONE_DURATION = 0.05; 
const PAUSE_DURATION = 0.025; 

// --- Encryption ---
function xorEncryptDecrypt(text: string, key: string): string {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}

// Unicode-compatible Base64 encoding
function toBase64(str: string): string {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        let binaryString = '';
        for (let i = 0; i < data.length; i++) {
            binaryString += String.fromCharCode(data[i]);
        }
        return btoa(binaryString);
    } catch (e) {
        console.error("toBase64 Error:", e);
        return "";
    }
}

// Unicode-compatible Base64 decoding
function fromBase64(base64: string): string {
    try {
        const binary_string = atob(base64);
        const bytes = new Uint8Array(binary_string.length);
        for (let i = 0; i < binary_string.length; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        const decoder = new TextDecoder();
        return decoder.decode(bytes);
    } catch (e) {
        console.error("fromBase64 Error:", e);
        return "";
    }
}


export const DTMF_FREQUENCIES: { [key: string]: [number, number] } = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477], 'A': [697, 1633],
  '4': [770, 1209], '5': [770, 1336], '6': [770, 1477], 'B': [770, 1633],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477], 'C': [852, 1633],
  '*': [941, 1209], '0': [941, 1336], '#': [941, 1477], 'D': [941, 1633],
};


export const COMPACT_CHAR_MAP: { [key: string]: string } = {
  ' ': '00', '.': '01', ',': '02', '?': '03', '!': '04', '-': '05', '_': '06', '@': '07',
  '0': '10', '1': '11', '2': '12', '3': '13', '4': '14', '5': '15', '6': '16', '7': '17', '8': '18', '9': '19',
  'А': '20', 'Б': '21', 'В': '22', 'Г': '23', 'Д': '24', 'Е': '25', 'Ё': '26', 'Ж': '27', 'З': '28', 'И': '29', 'Й': '30',
  'К': '31', 'Л': '32', 'М': '33', 'Н': '34', 'О': '35', 'П': '36', 'Р': '37', 'С': '38', 'Т': '39', 'У': '40',
  'Ф': '41', 'Х': '42', 'Ц': '43', 'Ч': '44', 'Ш': '45', 'Щ': '46', 'Ъ': '47', 'Ы': '48', 'Ь': '49', 'Э': '50', 'Ю': '51', 'Я': '52',
  'а': '53', 'б': '54', 'в': '55', 'г': '56', 'д': '57', 'е': '58', 'ё': '59', 'ж': '60', 'з': '61', 'и': '62', 'й': '63',
  'к': '64', 'л': '65', 'м': '66', 'н': '67', 'о': '68', 'п': '69', 'р': '70', 'с': '71', 'т': '72', 'у': '73',
  'ф': '74', 'х': '75', 'ц': '76', 'ч': '77', 'ш': '78', 'щ': '79', 'ъ': '80', 'ы': '81', 'ь': '82', 'э': '83', 'ю': '84', 'я': '85',
};

export const REVERSE_CHAR_MAP: { [key: string]: string } = Object.entries(COMPACT_CHAR_MAP).reduce((acc, [key, value]) => {
    if (!acc[value]) {
       acc[value] = key;
    }
    return acc;
}, {} as { [key:string]: string });


export function textToDtmfSequence(text: string, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void, password?: string): string {
    let payloadSequence: string[] = [];
    const isEncrypted = password && password.length > 0;
    
    let processedText = text;
    if (isEncrypted) {
        addLog(`Шифрование текста с паролем...`);
        const encrypted = xorEncryptDecrypt(text, password);
        processedText = toBase64(encrypted);
        addLog(`Текст зашифрован и закодирован в Base64.`);
    }

    addLog(`Начало кодирования: "${processedText}"`);
    
    for (const char of processedText) {
        const code = COMPACT_CHAR_MAP[char];
        if (!code) {
            const charCode = char.charCodeAt(0);
            const dtmfCode = '09' + charCode.toString().padStart(3, '0');
            payloadSequence.push(...dtmfCode.split(''));
            continue;
        }
        payloadSequence.push(...(code || '').split(''));
    }
    
    const encryptionFlag = isEncrypted ? '1' : '0';
    const finalSequence = ['*', encryptionFlag, ...payloadSequence, '#'].join(',');
    addLog(`Кодирование завершено. Итоговая последовательность: ${finalSequence}`);
    return finalSequence;
}

export function dtmfToText(sequence: string[], isEncrypted: boolean, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void, password?: string): string | null {
    addLog(`Декодирование последовательности: [${sequence.join(',')}]`);
    
    if (isEncrypted && (!password || password.length === 0)) {
        addLog('Пароль требуется, но не предоставлен.', 'error');
        return null;
    }

    let decodedText = '';
    
    let i = 0;
    while(i < sequence.length) {
        const pair = sequence[i] + (sequence[i+1] || '');
        
        if (pair === '09') { // Fallback char code detected
             if (i + 4 >= sequence.length) {
                addLog(`Обнаружен код символа, но данных не хватает.`, 'error');
                break;
            }
            const code = sequence[i+2] + sequence[i+3] + sequence[i+4];
            const charCode = parseInt(code, 10);
            if (!isNaN(charCode)) {
                decodedText += String.fromCharCode(charCode);
            }
            i += 5; // consumed 5 digits
        } else { // Standard compact map
            const char = REVERSE_CHAR_MAP[pair];
            if (char) {
                decodedText += char;
            } else {
                addLog(`Неверная кодовая пара '${pair}', пропускается.`, 'warning');
            }
            i += 2; // consumed 2 digits
        }
    }
    
    if (isEncrypted && password) {
        try {
            addLog('Сообщение зашифровано. Расшифровка...');
            const decryptedText = xorEncryptDecrypt(fromBase64(decodedText), password);
            if (!decryptedText && decodedText) {
                throw new Error("Decryption result is empty");
            }
            addLog('Расшифровка завершена.');
            return decryptedText;
        } catch (e) {
            addLog(`Ошибка расшифровки. Вероятно, неверный пароль или поврежденные данные. ${(e as Error).message}`, 'error');
            return null;
        }
    }
    
    return decodedText;
}


export async function playDtmfSequence(sequence: string) {
  await Tone.start();
  const tones = sequence.split(/,/).map(s => s.trim());
  
  const synth1 = new Tone.Synth().toDestination();
  const synth2 = new Tone.Synth().toDestination();

  let time = Tone.now();
  for (const tone of tones) {
    if (DTMF_FREQUENCIES[tone]) {
      const [freq1, freq2] = DTMF_FREQUENCIES[tone];
      synth1.triggerAttackRelease(freq1, TONE_DURATION, time);
      synth2.triggerAttackRelease(freq2, TONE_DURATION, time);
      time += TONE_DURATION + PAUSE_DURATION;
    }
  }
}

export async function renderDtmfSequenceToAudioBuffer(sequence: string): Promise<AudioBuffer> {
    const tones = sequence.split(/,/).map(s => s.trim()).filter(t => DTMF_FREQUENCIES[t] || t === '*' || t === '#');
    const duration = tones.length * (TONE_DURATION + PAUSE_DURATION);

    if (duration === 0) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        return audioContext.createBuffer(1, 1, audioContext.sampleRate);
    }

    return Tone.Offline((context) => {
        const synth1 = new Tone.Synth().toDestination();
        const synth2 = new Tone.Synth().toDestination();

        let time = 0;
        for (const tone of tones) {
            if (DTMF_FREQUENCIES[tone]) {
                const [freq1, freq2] = DTMF_FREQUENCIES[tone];
                synth1.triggerAttackRelease(freq1, TONE_DURATION, time);
                synth2.triggerAttackRelease(freq2, TONE_DURATION, time);
                time += TONE_DURATION + PAUSE_DURATION;
            }
        }
    }, duration);
}
