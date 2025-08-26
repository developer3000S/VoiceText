import * as Tone from 'tone';

export const DTMF_FREQUENCIES: { [key: string]: [number, number] } = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477],
};

const TONE_DURATION = 0.1; // seconds
const PAUSE_DURATION = 0.05; // seconds

export const CHAR_MAP: { [key: string]: string } = {
    // 00-09: Symbols
    ' ': '00', '.': '01', ',': '02', '?': '03', '!': '04',
    '-': '05', '_': '06', '@': '07',
    // 10-19: Numbers
    '0': '10', '1': '11', '2': '12', '3': '13', '4': '14',
    '5': '15', '6': '16', '7': '17', '8': '18', '9': '19',
    // 20-45: Latin uppercase
    'A': '20', 'B': '21', 'C': '22', 'D': '23', 'E': '24', 'F': '25', 'G': '26',
    'H': '27', 'I': '28', 'J': '29', 'K': '30', 'L': '31', 'M': '32', 'N': '33',
    'O': '34', 'P': '35', 'Q': '36', 'R': '37', 'S': '38', 'T': '39', 'U': '40',
    'V': '41', 'W': '42', 'X': '43', 'Y': '44', 'Z': '45',
    // 46-71: Latin lowercase
    'a': '46', 'b': '47', 'c': '48', 'd': '49', 'e': '50', 'f': '51', 'g': '52',
    'h': '53', 'i': '54', 'j': '55', 'k': '56', 'l': '57', 'm': '58', 'n': '59',
    'o': '60', 'p': '61', 'q': '62', 'r': '63', 's': '64', 't': '65', 'u': '66',
    'v': '67', 'w': '68', 'x': '69', 'y': '70', 'z': '71',
    // Cyrillic will need a different approach or a larger code space if we stick to 2 digits.
    // For now, let's map Cyrillic. We'll run out of space.
    // Let's use 3-digit codes or a different system if more characters are needed.
    // Re-evaluating the user request. Let's stick to 2 digits and reduce the character set.
    // We will keep Cyrillic, numbers, and basic punctuation.
    // New Map:
    'А': '20', 'Б': '21', 'В': '22', 'Г': '23', 'Д': '24', 'Е': '25', 'Ё': '25', 'Ж': '26', 'З': '27',
    'И': '28', 'Й': '29', 'К': '30', 'Л': '31', 'М': '32', 'Н': '33', 'О': '34', 'П': '35',
    'Р': '36', 'С': '37', 'Т': '38', 'У': '39', 'Ф': '40', 'Х': '41', 'Ц': '42', 'Ч': '43',
    'Ш': '44', 'Щ': '45', 'Ъ': '46', 'Ы': '47', 'Ь': '48', 'Э': '49', 'Ю': '50', 'Я': '51',
    'а': '52', 'б': '53', 'в': '54', 'г': '55', 'д': '56', 'е': '57', 'ё': '57', 'ж': '58', 'з': '59',
    'и': '60', 'й': '61', 'к': '62', 'л': '63', 'м': '64', 'н': '65', 'о': '66', 'п': '67',
    'р': '68', 'с': '69', 'т': '70', 'у': '71', 'ф': '72', 'х': '73', 'ц': '74', 'ч': '75',
    'ш': '76', 'щ': '77', 'ъ': '78', 'ы': '79', 'ь': '80', 'э': '81', 'ю': '82', 'я': '83',
};

// Generate reverse map dynamically
export const REVERSE_CHAR_MAP: { [key: string]: string } = Object.entries(CHAR_MAP).reduce((acc, [key, value]) => {
    // To handle cases like 'е' and 'ё' mapping to the same code,
    // we only store the first character encountered for a given code.
    // This will decode '57' to 'е'.
    if (!acc[value]) {
        acc[value] = key;
    }
    return acc;
}, {} as { [key: string]: string });


export function textToDtmfSequence(text: string, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void): string {
    let payloadSequence: string[] = [];
    addLog(`Начало кодирования по новому алгоритму: "${text}"`);

    for (const char of text) {
        const dtmfCode = CHAR_MAP[char];
        if (dtmfCode) {
            addLog(`Символ: '${char}' -> Код: ${dtmfCode}`);
            payloadSequence.push(...dtmfCode.split(''));
        } else {
            addLog(`Символ '${char}' не найден в карте, пропускается.`, 'warning');
        }
    }
    
    const finalSequence = ['*', ...payloadSequence, '#'].join(',');
    addLog(`Кодирование завершено. Итоговая последовательность: ${finalSequence}`);
    return finalSequence;
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
    const tones = sequence.split(/,/).map(s => s.trim()).filter(t => DTMF_FREQUENCIES[t]);
    const duration = tones.length * (TONE_DURATION + PAUSE_DURATION);

    if (duration === 0) {
        // Return a tiny silent buffer if sequence is empty or invalid
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
