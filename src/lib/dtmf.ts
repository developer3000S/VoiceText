
import * as Tone from 'tone';

const TONE_DURATION = 0.05; 
const PAUSE_DURATION = 0.025; 

// --- Шифрование ---
function xorEncryptDecrypt(text: string, key: string): string {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}

// Unicode-совместимое кодирование в Base64
function toBase64(str: string): string {
    const buffer = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < buffer.length; i++) {
        binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
}

// Unicode-совместимое декодирование из Base64
function fromBase64(base64: string): string {
    const binary_string = atob(base64);
    const bytes = new Uint8Array(binary_string.length);
    for (let i = 0; i < binary_string.length; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
}


export const DTMF_FREQUENCIES: { [key: string]: [number, number] } = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
  '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
  '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
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
  'A': '86', 'B': '87', 'C': '88', 'D': '89', 'E': '90', 'F': '91', 'G': '92', 'H': '93', 'I': '94', 'J': '95', 'K': '96',
  'L': '97', 'M': '98', 'N': '99',
};


export const REVERSE_CHAR_MAP: { [key: string]: string } = Object.entries(COMPACT_CHAR_MAP).reduce((acc, [key, value]) => {
    acc[value] = key;
    return acc;
}, {} as { [key: string]: string });


export function textToDtmfSequence(text: string, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void, password?: string): string {
    let payloadSequence: string[] = [];
    const isEncrypted = password && password.length > 0;
    
    let processedText = text;
    if (isEncrypted) {
        addLog(`Шифрование текста с паролем...`);
        processedText = xorEncryptDecrypt(text, password);
        // Base64 encode to handle any non-standard characters from XOR
        processedText = toBase64(processedText);
        addLog(`Текст зашифрован и закодирован в Base64.`);
    }

    addLog(`Начало кодирования: "${processedText}"`);
    
    // Using a more robust char-to-code mapping to handle any character
    for (const char of processedText) {
        const charCode = char.charCodeAt(0);
        // Pad with leading zeros to make it 3 digits
        const dtmfCode = charCode.toString().padStart(3, '0');
        payloadSequence.push(...dtmfCode.split(''));
    }
    
    // Header: * + (0 for unencrypted, 1 for encrypted) + payload + #
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

    if (sequence.length % 3 !== 0) {
        addLog(`Длина пакета данных не кратна 3 (${sequence.length}). Сообщение повреждено.`, 'error');
        return null;
    }

    let encodedText = '';
    for (let i = 0; i < sequence.length; i += 3) {
        const code = sequence[i] + sequence[i+1] + sequence[i+2];
        const charCode = parseInt(code, 10);
        if (!isNaN(charCode)) {
            encodedText += String.fromCharCode(charCode);
        } else {
            addLog(`Неверная кодовая тройка '${code}', пропускается.`, 'warning');
        }
    }
    
    if (isEncrypted && password) {
        try {
            addLog('Сообщение зашифровано. Расшифровка...');
            const decodedFromBase64 = fromBase64(encodedText);
            const decryptedText = xorEncryptDecrypt(decodedFromBase64, password);
            addLog('Расшифровка завершена.');
            return decryptedText;
        } catch (e) {
            addLog('Ошибка расшифровки. Вероятно, неверный пароль или поврежденные данные.', 'error');
            return null;
        }
    }
    
    return encodedText;
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
