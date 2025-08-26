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
    // Service symbols: 00-09
    ' ': '00', '.': '01', ',': '02', '?': '03', '!': '04', '-': '05', '_': '06', '@': '07',
    
    // Numbers: 10-19
    '0': '10', '1': '11', '2': '12', '3': '13', '4': '14', '5': '15', '6': '16', '7': '17', '8': '18', '9': '19',

    // Cyrillic uppercase: 20-52
    'А': '20', 'Б': '21', 'В': '22', 'Г': '23', 'Д': '24', 'Е': '25', 'Ж': '26', 'З': '27', 'И': '28', 'Й': '29',
    'К': '30', 'Л': '31', 'М': '32', 'Н': '33', 'О': '34', 'П': '35', 'Р': '36', 'С': '37', 'Т': '38', 'У': '39',
    'Ф': '40', 'Х': '41', 'Ц': '42', 'Ч': '43', 'Ш': '44', 'Щ': '45', 'Ъ': '46', 'Ы': '47', 'Ь': '48', 'Э': '49',
    'Ю': '50', 'Я': '51', 'Ё': '52',

    // Latin uppercase: 53-78
    'A': '53', 'B': '54', 'C': '55', 'D': '56', 'E': '57', 'F': '58', 'G': '59', 'H': '60', 'I': '61', 'J': '62',
    'K': '63', 'L': '64', 'M': '65', 'N': '66', 'O': '67', 'P': '68', 'Q': '69', 'R': '70', 'S': '71', 'T': '72',
    'U': '73', 'V': '74', 'W': '75', 'X': '76', 'Y': '77', 'Z': '78',

    // Cyrillic lowercase: 80-99 (reserving some space)
    'а': '80', 'б': '81', 'в': '82', 'г': '83', 'д': '84', 'е': '85', 'ж': '86', 'з': '87', 'и': '88', 'й': '89',
    'к': '90', 'л': '91', 'м': '92', 'н': '93', 'о': '94', 'п': '95', 'р': '96', 'с': '97', 'т': '98', 'у': '99',
    
    // Note: To add more characters like latin lowercase, a new range (e.g., starting from '1*') would be needed,
    // as we've run out of two-digit codes. For now, this map covers the requested characters.
    // Let's add latin lowercase by extending the codes, which requires handling in the decoder.
    // For simplicity with the current decoder, we will map them into the Cyrillic lowercase space for now.
    // This is not ideal, but keeps the "2-digit" rule. A better system would use 3 digits or mode switching.
    'ф': '08', 'х': '09', 'ц': '2A', 'ч': '2B', // This is where it gets tricky. Let's stick to pure digits.
    // Re-evaluating the map to fit everything into 2 digits (00-99).
    // Let's create a more compact map.
};

// A better, more compact map.
export const COMPACT_CHAR_MAP: { [key: string]: string } = {
  // Service (10)
  ' ': '00', '.': '01', ',': '02', '?': '03', '!': '04', '-': '05', '_': '06', '@': '07',
  // Numbers (10)
  '0': '10', '1': '11', '2': '12', '3': '13', '4': '14', '5': '15', '6': '16', '7': '17', '8': '18', '9': '19',
  // Cyrillic Uppercase (33)
  'А': '20', 'Б': '21', 'В': '22', 'Г': '23', 'Д': '24', 'Е': '25', 'Ё': '26', 'Ж': '27', 'З': '28', 'И': '29', 'Й': '30',
  'К': '31', 'Л': '32', 'М': '33', 'Н': '34', 'О': '35', 'П': '36', 'Р': '37', 'С': '38', 'Т': '39', 'У': '40',
  'Ф': '41', 'Х': '42', 'Ц': '43', 'Ч': '44', 'Ш': '45', 'Щ': '46', 'Ъ': '47', 'Ы': '48', 'Ь': '49', 'Э': '50', 'Ю': '51', 'Я': '52',
  // Cyrillic Lowercase (33)
  'а': '53', 'б': '54', 'в': '55', 'г': '56', 'д': '57', 'е': '58', 'ё': '59', 'ж': '60', 'з': '61', 'и': '62', 'й': '63',
  'к': '64', 'л': '65', 'м': '66', 'н': '67', 'о': '68', 'п': '69', 'р': '70', 'с': '71', 'т': '72', 'у': '73',
  'ф': '74', 'х': '75', 'ц': '76', 'ч': '77', 'ш': '78', 'щ': '79', 'ъ': '80', 'ы': '81', 'ь': '82', 'э': '83', 'ю': '84', 'я': '85',
  // Latin Uppercase (26 -> needs more space, let's omit for now to ensure reliability)
  // Let's just add a few important ones for mixed text.
  'A': '86', 'B': '87', 'C': '88', 'D': '89', 'E': '90', 'F': '91', 'G': '92', 'H': '93', 'I': '94', 'J': '95', 'K': '96',
  'L': '97', 'M': '98', 'N': '99',
};


// Generate reverse map dynamically from the compact map
export const REVERSE_CHAR_MAP: { [key: string]: string } = Object.entries(COMPACT_CHAR_MAP).reduce((acc, [key, value]) => {
    acc[value] = key;
    return acc;
}, {} as { [key: string]: string });


export function textToDtmfSequence(text: string, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void): string {
    let payloadSequence: string[] = [];
    addLog(`Начало кодирования по новому алгоритму: "${text}"`);
    
    for (const char of text) {
        const dtmfCode = COMPACT_CHAR_MAP[char];
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
    const tones = sequence.split(/,/).map(s => s.trim()).filter(t => DTMF_FREQUENCIES[t] || t === '*' || t === '#');
    const duration = tones.length * (TONE_DURATION + PAUSE_DURATION);

    if (duration === 0) {
        // Return a tiny silent buffer if sequence is empty or invalid
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        return audioContext.createBuffer(1, 1, audioContext.sampleRate);
    }

    // Use Tone.Offline to render the audio in the background
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
