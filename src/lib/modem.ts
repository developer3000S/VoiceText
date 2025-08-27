
import * as Tone from 'tone';

export type ModemState = 'idle' | 'calling' | 'answering' | 'handshake' | 'connected' | 'error';
export enum ModemMode { CALL, ANSWER }

const CARRIER_FREQ = 2200; // Tone from answerer to show it's ready
const REQUEST_FREQ = 1600; // Tone from caller to start handshake
const BIT_0_FREQ = 1070;   // Bell 103 standard
const BIT_1_FREQ = 1270;   // Bell 103 standard

const BIT_DURATION = 0.05; // 50ms per bit => 20 baud
const TIMEOUT_MS = 10000;

export class Modem {
    private state: ModemState = 'idle';
    private audioContext!: AudioContext;
    private analyser!: AnalyserNode;
    private microphoneStream: MediaStream | null = null;
    private oscillator: Tone.Oscillator | null = null;
    private synth: Tone.Synth | null = null;
    private gainNode: GainNode | null = null;
    private inputSource: AudioNode | null = null;

    public onStateChange: (newState: ModemState) => void;
    public onDataReceived: (data: string) => void;
    private addLog: (message: string, type?: 'info' | 'error' | 'warning') => void;
    private analysisFrameId: number | null = null;
    public mode: ModemMode | null = null;
    private id: string;

    constructor(
        onStateChange: (newState: ModemState) => void,
        onDataReceived: (data: string) => void,
        addLog: (message: string, type?: 'info' | 'error' | 'warning') => void,
        id: string
    ) {
        this.onStateChange = onStateChange;
        this.onDataReceived = onDataReceived;
        this.addLog = addLog;
        this.id = id;
    }

    private log(message: string, type?: 'info' | 'error' | 'warning') {
        this.addLog(`(Модем ${this.id}) ${message}`, type);
    }

    private setState(newState: ModemState) {
        if (this.state === newState) return;
        this.state = newState;
        this.onStateChange(newState);
    }

    async initialize() {
        if (this.audioContext && this.audioContext.state === 'running') return;
        await Tone.start();
        this.audioContext = Tone.context.rawContext;
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        
        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);
        
        this.oscillator = new Tone.Oscillator().connect(new Tone.Gain(0.5).connect(this.gainNode));
        this.synth = new Tone.Synth().connect(new Tone.Gain(0.5).connect(this.gainNode));

        this.log('Модем инициализирован');
    }

    private async ensureMicInput() {
       if (!this.microphoneStream) {
            try {
                this.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const source = this.audioContext.createMediaStreamSource(this.microphoneStream);
                this.inputSource = source;
                this.inputSource.connect(this.analyser);
                this.log('Вход с микрофона активирован.');
            } catch (error) {
                this.log('Ошибка доступа к микрофону', 'error');
                this.setState('error');
                throw new Error('Microphone access denied');
            }
        }
    }

    connectInput(source: AudioNode) {
        this.inputSource = source;
        this.inputSource.connect(this.analyser);
        this.log(`Вход соединен с другим модемом`);
    }

    disconnectInput() {
        this.inputSource?.disconnect();
        this.inputSource = null;
        this.log('Вход отсоединен.');
    }

    getOutputNode(): AudioNode | null {
        return this.gainNode;
    }

    async start(mode: ModemMode) {
        if (this.state !== 'idle' && this.state !== 'error') return;
        
        // For real mode, ensure microphone is ready. For test mode, input is connected externally.
        if (!this.inputSource) {
            await this.ensureMicInput();
        }

        this.mode = mode;
        
        if (mode === ModemMode.ANSWER) {
            this.setState('answering');
            this.log('Ожидание вызова...');
            this.listenForTone(REQUEST_FREQ, TIMEOUT_MS).then(found => {
                if (found) {
                    this.log('Сигнал запроса получен, отправка сигнала готовности...');
                    this.performHandshake(ModemMode.ANSWER);
                } else {
                    this.log('Таймаут ожидания сигнала запроса', 'error');
                    this.hangup();
                }
            });
        } else { // ModemMode.CALL
            this.setState('calling');
            this.log('Вызов... Отправка сигнала запроса.');
            this.playTone(REQUEST_FREQ, 500);
            this.listenForTone(CARRIER_FREQ, TIMEOUT_MS).then(found => {
                if (found) {
                    this.log('Сигнал готовности получен.');
                    this.performHandshake(ModemMode.CALL);
                } else {
                    this.log('Таймаут ожидания сигнала готовности', 'error');
                    this.hangup();
                }
            });
        }
    }

    private async performHandshake(mode: ModemMode) {
        this.setState('handshake');
        if (mode === ModemMode.ANSWER) {
            this.log('Handshake: Отправка сигнала готовности (carrier)');
            await this.playTone(CARRIER_FREQ, 1000);
        }
        this.log('Handshake завершен. Соединение установлено.');
        this.setState('connected');
        this.startListeningForData();
    }

    private async playTone(freq: number, duration: number): Promise<void> {
       return new Promise(resolve => {
           this.synth?.triggerAttackRelease(freq, duration / 1000, Tone.now());
           setTimeout(resolve, duration + 50);
       })
    }

    async send(text: string) {
        if (this.state !== 'connected') return;
        
        for (const char of text) {
            const charCode = char.charCodeAt(0);
            this.log(`Отправка символа '${char}' (0x${charCode.toString(16)})`);
            const bits: number[] = [];
            for (let i = 0; i < 8; i++) {
                bits.push((charCode >> i) & 1);
            }

            for (const bit of bits) {
                const freq = bit === 0 ? BIT_0_FREQ : BIT_1_FREQ;
                await this.playTone(freq, BIT_DURATION * 1000);
            }
        }
    }

    private startListeningForData() {
        if (this.analysisFrameId) return;

        let bitBuffer: number[] = [];
        let lastBitTime = 0;
        let isReceiving = false;

        const processFrame = () => {
            if (this.state !== 'connected') return;

            const freq = this.detectFrequency();
            const now = performance.now();
            
            if (freq && (Math.abs(freq - BIT_0_FREQ) < 20 || Math.abs(freq - BIT_1_FREQ) < 20)) {
                if (!isReceiving) {
                    isReceiving = true;
                    lastBitTime = now;
                    this.log('Обнаружено начало передачи данных');
                }
                
                if (now - lastBitTime > (BIT_DURATION * 1000 * 0.9)) {
                    const bit = Math.abs(freq - BIT_0_FREQ) < 20 ? 0 : 1;
                    bitBuffer.push(bit);
                    lastBitTime = now;

                    if (bitBuffer.length === 8) {
                        const charCode = parseInt(bitBuffer.reverse().join(''), 2);
                        const char = String.fromCharCode(charCode);
                        this.log(`Принят байт 0x${charCode.toString(16)}, символ '${char}'`);
                        this.onDataReceived(char);
                        bitBuffer = [];
                        isReceiving = false;
                    }
                }
            } else if (isReceiving && now - lastBitTime > (BIT_DURATION * 1000 * 2)) {
                this.log(`Таймаут при приеме битов, буфер сброшен: [${bitBuffer.join('')}]`, 'warning');
                bitBuffer = [];
                isReceiving = false;
            }
            
            this.analysisFrameId = requestAnimationFrame(processFrame);
        };
        processFrame();
    }

    private stopListeningForData() {
        if (this.analysisFrameId) {
            cancelAnimationFrame(this.analysisFrameId);
            this.analysisFrameId = null;
        }
    }

    hangup() {
        this.stopListeningForData();
        this.oscillator?.stop();
        this.synth?.triggerRelease();
        
        if (this.microphoneStream) {
            this.microphoneStream.getTracks().forEach(track => track.stop());
            this.microphoneStream = null;
        }
        
        if (this.state !== 'idle') {
            this.setState('idle');
            this.log('Соединение разорвано');
        }
    }

    private detectFrequency(): number | null {
        if (!this.analyser) return null;
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);

        let maxVal = -1;
        let maxIndex = -1;

        for (let i = 0; i < dataArray.length; i++) {
            if (dataArray[i] > maxVal) {
                maxVal = dataArray[i];
                maxIndex = i;
            }
        }
        
        if (maxVal > 50) {
            const frequency = maxIndex * (this.audioContext.sampleRate / this.analyser.fftSize);
            if (frequency > 500) {
                return frequency;
            }
        }

        return null;
    }
    
    private async listenForTone(targetFreq: number, timeout: number): Promise<boolean> {
        return new Promise(resolve => {
            if (!this.analyser) {
                this.log('Анализатор не инициализирован для прослушивания тона', 'error');
                resolve(false);
                return;
            }
            const startTime = Date.now();
            
            const check = () => {
                const freq = this.detectFrequency();
                if (freq && Math.abs(freq - targetFreq) < 20) {
                    resolve(true);
                    return;
                }
                if (Date.now() - startTime > timeout) {
                    resolve(false);
                    return;
                }
                if (this.state === 'idle' || this.state === 'error') {
                    resolve(false);
                    return;
                }
                this.analysisFrameId = requestAnimationFrame(check);
            };
            check();
        });
    }
}
