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
    // Numbers 10-19
    '0': '10', '1': '11', '2': '12', '3': '13', '4': '14', '5': '15', '6': '16', '7': '17', '8': '18', '9': '19',
    
    // Latin uppercase 20-45
    'A': '20', 'B': '21', 'C': '22', 'D': '23', 'E': '24', 'F': '25', 'G': '26', 'H': '27', 'I': '28', 'J': '29', 'K': '30', 'L': '31', 'M': '32', 'N': '33', 'O': '34', 'P': '35', 'Q': '36', 'R': '37', 'S': '38', 'T': '39', 'U': '40', 'V': '41', 'W': '42', 'X': '43', 'Y': '44', 'Z': '45',

    // Latin lowercase 46-71
    'a': '46', 'b': '47', 'c': '48', 'd': '49', 'e': '50', 'f': '51', 'g': '52', 'h': '53', 'i': '54', 'j': '55', 'k': '56', 'l': '57', 'm': '58', 'n': '59', 'o': '60', 'p': '61', 'q': '62', 'r': '63', 's': '64', 't': '65', 'u': '66', 'v': '67', 'w': '68', 'x': '69', 'y': '70', 'z': '71',

    // Cyrillic uppercase 72-99 (partial)
    'А': '72', 'Б': '73', 'В': '74', 'Г': '75', 'Д': '76', 'Е': '77', 'Ё': '77', 'Ж': '78', 'З': '79', 'И': '80', 'Й': '81', 'К': '82', 'Л': '83', 'М': '84', 'Н': '85', 'О': '86', 'П': '87', 'Р': '88', 'С': '89', 'Т': '90', 'У': '91', 'Ф': '92', 'Х': '93', 'Ц': '94', 'Ч': '95', 'Ш': '96', 'Щ': '97', 'Ъ': '98', 'Ы': '99',
    
    // Cyrillic lowercase - uses available codes
    'а': '10', 'б': '11', 'в': '12', 'г': '13', 'д': '14', 'е': '15', 'ё': '15', 'ж': '16', 'з': '17', 'и': '18', 'й': '19', 'к': '20', 'л': '21', 'м': '22', 'н': '23', 'о': '24', 'п': '25', 'р': '26', 'с': '27', 'т': '28', 'у': '29', 'ф': '30', 'х': '31', 'ц': '32', 'ч': '33', 'ш': '34', 'щ': '35', 'ъ': '36', 'ы': '37', 'ь': '38', 'э': '39', 'ю': '40', 'я': '41',
    
    // Symbols - uses available codes
    ' ': '42', '.': '43', ',': '44', '?': '45', '!': '46', '-': '47', '_': '48', '@': '49'
};

// Generate reverse map dynamically
export const REVERSE_CHAR_MAP: { [key: string]: string } = Object.entries(CHAR_MAP).reduce((acc, [key, value]) => {
    if (!acc[value] || key.toLowerCase() === key) { // Give preference to lowercase or the last key if codes are shared (e.g. 'е' and 'ё')
      acc[value] = key;
    }
    return acc;
}, {} as { [key: string]: string });


export function textToDtmfSequence(text: string, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void): string {
    let payloadSequence: string[] = [];
    addLog(`Начало кодирования по новому алгоритму: "${text}"`);
    
    const normalizedText = text;

    for (const char of normalizedText) {
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
