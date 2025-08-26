import * as Tone from 'tone';

export const DTMF_FREQUENCIES: { [key: string]: [number, number] } = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  'A': [697, 1633], // Not used in new encoding
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  'B': [770, 1633], // Not used in new encoding
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  'C': [852, 1633], // Not used in new encoding
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477],
  'D': [941, 1633], // Not used in new encoding
};

const TONE_DURATION = 0.1; // seconds
const PAUSE_DURATION = 0.05; // seconds

export const CHAR_MAP: { [key: string]: string } = {
    'А': '01', 'Б': '02', 'В': '03', 'Г': '04', 'Д': '05', 'Е': '06', 'Ж': '07', 'З': '08', 'И': '09', 'Й': '10',
    'К': '11', 'Л': '12', 'М': '13', 'Н': '14', 'О': '15', 'П': '16', 'Р': '17', 'С': '18', 'Т': '19', 'У': '20',
    'Ф': '21', 'Х': '22', 'Ц': '23', 'Ч': '24', 'Ш': '25', 'Щ': '26', 'Ъ': '27', 'Ы': '28', 'Ь': '29', 'Э': '30',
    'Ю': '31', 'Я': '32',
    'а': '33', 'б': '34', 'в': '35', 'г': '36', 'д': '37', 'е': '38', 'ж': '39', 'з': '40', 'и': '41', 'й': '42',
    'к': '43', 'л': '44', 'м': '45', 'н': '46', 'о': '47', 'п': '48', 'р': '49', 'с': '50', 'т': '51', 'у': '52',
    'ф': '53', 'х': '54', 'ц': '55', 'ч': '56', 'ш': '57', 'щ': '58', 'ъ': '59', 'ы': '60', 'ь': '61', 'э': '62',
    'ю': '63', 'я': '64', 'ё': '38', 'Ё': '06',
    'A': '65', 'B': '66', 'C': '67', 'D': '68', 'E': '69', 'F': '70', 'G': '71', 'H': '72', 'I': '73', 'J': '74',
    'K': '75', 'L': '76', 'M': '77', 'N': '78', 'O': '79', 'P': '80', 'Q': '81', 'R': '82', 'S': '83', 'T': '84',
    'U': '85', 'V': '86', 'W': '87', 'X': '88', 'Y': '89', 'Z': '90',
    'a': '91', 'b': '92', 'c': '93', 'd': '94', 'e': '95', 'f': '96', 'g': '97', 'h': '98', 'i': '99', 'j': '1*',
    'k': '2*', 'l': '3*', 'm': '4*', 'n': '5*', 'o': '6*', 'p': '7*', 'q': '8*', 'r': '9*', 's': '0*',
    't': '1#', 'u': '2#', 'v': '3#', 'w': '4#', 'x': '5#', 'y': '6#', 'z': '7#',
    '0': '#0', '1': '#1', '2': '#2', '3': '#3', '4': '#4', '5': '#5', '6': '#6', '7': '#7', '8': '#8', '9': '#9',
    ' ': '00', '.': '*1', ',': '*2', '?': '*3', '!': '*4', '-': '*5', '_': '*6', '@': '*7', '#': '##'
};


export function textToDtmfSequence(text: string, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void): string {
    let sequence: string[] = [];
    addLog(`Начало кодирования по новому алгоритму: "${text}"`);
    for (const char of text) {
        const dtmfCode = CHAR_MAP[char];
        if (dtmfCode) {
            addLog(`Символ: '${char}' -> Код: ${dtmfCode}`);
            sequence.push(...dtmfCode.split(''));
        } else {
            addLog(`Символ '${char}' не найден в карте, пропускается.`, 'warning');
        }
    }
    const finalSequence = sequence.join(',');
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
