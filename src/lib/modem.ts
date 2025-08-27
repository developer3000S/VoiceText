
import * as Tone from 'tone';
import { AudioNode } from 'tone';

export type ModemState = 'idle' | 'calling' | 'answering' | 'handshake' | 'connected' | 'error';
export enum ModemMode { CALL, ANSWER }

const CARRIER_FREQ = 2200; // Tone from answerer to show it's ready
const REQUEST_FREQ = 1600; // Tone from caller to start handshake

// Using standard Bell 103 frequencies for Mark (1) and Space (0)
const BIT_1_FREQ = 1270;   // Mark
const BIT_0_FREQ = 1070;   // Space

// Timing
const BIT_DURATION = 0.05; // 50ms per bit => 20 baud
const HANDSHAKE_TIMEOUT_MS = 5000;
const BIT_RECEIVE_TIMEOUT_MS = BIT_DURATION * 1000 * 3; // Timeout for waiting for the next bit in a byte

// Protocol bits
const START_BIT = 0;
const STOP_BIT = 1;


export class Modem {
    private state: ModemState = 'idle';
    public audioContext!: Tone.Context;
    private analyser!: Tone.FFT;
    private microphoneStream: MediaStream | null = null;
    private synth: Tone.Synth | null = null;
    public gainNode: Tone.Gain | null = null;
    private inputSource: AudioNode | null = null;

    public onStateChange: (newState: ModemState) => void;
    public onDataReceived: (data: string) => void;
    private addLog: (message: string, type?: 'info' | 'error' | 'warning') => void;
    private partnerModem: Modem | null = null;
    public mode: ModemMode | null = null;
    private id: string;
    
    private listenLoop: Tone.Loop | null = null;
    private handshakeTimeout: NodeJS.Timeout | null = null;


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

    async initialize(options: { context?: Tone.Context, ensureMic?: boolean } = {}) {
        const { context, ensureMic = true } = options;

        if (this.audioContext && this.audioContext.state === 'running') {
            if (ensureMic) await this.ensureMicInput();
            return;
        }

        if (context) {
            this.audioContext = context;
        } else {
            await Tone.start();
            this.audioContext = new Tone.Context();
            await this.audioContext.resume();
        }

        this.analyser = new Tone.FFT({
            size: 2048,
            context: this.audioContext,
        });

        this.synth = new Tone.Synth({ context: this.audioContext }).toDestination();
        this.gainNode = new Tone.Gain(1.0).connect(this.analyser);
        this.synth.connect(this.gainNode);

        if (ensureMic) {
            await this.ensureMicInput();
        }

        this.log('Модем инициализирован');
    }
    
    private async ensureMicInput() {
       if (!this.inputSource) {
            try {
                this.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.inputSource = this.audioContext.createMediaStreamSource(this.microphoneStream);
                this.inputSource.connect(this.gainNode!);
                this.log('Вход с микрофона активирован.');
            } catch (error) {
                this.log('Ошибка доступа к микрофону', 'error');
                this.setState('error');
                throw new Error('Microphone access denied');
            }
        }
    }
    
    // This method is for test mode to connect the output of this modem to the input of another.
    connectInput(source: AudioNode, partner?: Modem) {
        this.inputSource = source;
        this.inputSource.connect(this.analyser);
        if (partner) {
            this.partnerModem = partner;
        }
        this.log(`Вход соединен с другим модемом`);
    }

    disconnectInput(sourceNode: Tone.Gain) {
        if (this.gainNode) {
            try {
              sourceNode.disconnect(this.analyser);
              this.log('Вход отсоединен.');
            } catch (e) {
              this.log('Ошибка при отсоединении входа, возможно уже отсоединен', 'warning');
            }
        }
        this.partnerModem = null;
    }

    async start(mode: ModemMode) {
        if (this.state !== 'idle' && this.state !== 'error') return;
        
        if (!this.audioContext || this.audioContext.state !== 'running') {
            this.log('Модем не инициализирован. Вызовите initialize() перед start().', 'error');
            this.setState('error');
            return;
        }
        
        if(!this.inputSource) {
            try {
                await this.ensureMicInput();
            } catch (e) {
                return; // Stop if mic access failed
            }
        }


        this.mode = mode;
        
        if (mode === ModemMode.ANSWER) {
            this.setState('answering');
            this.log('Ожидание вызова...');
            this.listenForTone(REQUEST_FREQ, () => {
                this.log('Сигнал запроса получен, отправка сигнала готовности...');
                this.performHandshake(ModemMode.ANSWER);
            });
        } else { // ModemMode.CALL
            this.setState('calling');
            this.log('Вызов... Отправка сигнала запроса.');
            this.playTone(REQUEST_FREQ, 500);
            this.listenForTone(CARRIER_FREQ, () => {
                 this.log('Сигнал готовности получен.');
                 this.performHandshake(ModemMode.CALL);
            });
        }
        
        if(this.handshakeTimeout) clearTimeout(this.handshakeTimeout);
        this.handshakeTimeout = setTimeout(() => {
            if (this.state === 'calling' || this.state === 'answering') {
                this.log(this.state === 'calling' ? 'Таймаут ожидания сигнала готовности' : 'Таймаут ожидания сигнала запроса', 'error');
                this.hangup();
            }
        }, HANDSHAKE_TIMEOUT_MS);
    }

    private async performHandshake(mode: ModemMode) {
        if (this.handshakeTimeout) clearTimeout(this.handshakeTimeout);
        this.stopListeningForTone();

        this.setState('handshake');
        if (mode === ModemMode.ANSWER) {
            this.log('Handshake: Отправка сигнала готовности (carrier)');
            await this.playTone(CARRIER_FREQ, 1000);
        } else {
             await new Promise(res => setTimeout(res, 500));
        }

        this.log('Handshake завершен. Соединение установлено.');
        this.setState('connected');
        this.startListeningForData();
    }

    private async playTone(freq: number, duration: number): Promise<void> {
       return new Promise(resolve => {
           if (!this.synth || this.audioContext.state !== 'running') return resolve();
           this.synth.triggerAttackRelease(freq, duration / 1000, this.audioContext.currentTime);
           setTimeout(resolve, duration);
       })
    }
    
    private async playBit(bit: number) {
        const freq = bit === 1 ? BIT_1_FREQ : BIT_0_FREQ;
        await this.playTone(freq, BIT_DURATION * 1000);
    }

    async send(text: string) {
        if (this.state !== 'connected' || !this.synth) return;
        
        for (const char of text) {
            const charCode = char.charCodeAt(0);
            this.log(`Отправка символа '${char}' (0x${charCode.toString(16)})`);
            
            await this.playBit(START_BIT);

            for (let i = 0; i < 8; i++) {
                const bit = (charCode >> i) & 1; // LSB first
                await this.playBit(bit);
            }

            await this.playBit(STOP_BIT);
        }
    }

    private startListeningForData() {
        if (this.listenLoop) this.listenLoop.stop();
        
        this.log('Начало прослушивания данных...');
        let bitBuffer: number[] = [];
        let lastBitTime = performance.now();
        let isReceivingByte = false;

        this.listenLoop = new Tone.Loop(time => {
            const freq = this.detectFrequency();
            if (!freq) return;

            const bit = this.frequencyToBit(freq);
            if (bit === null) return;
            
            const now = performance.now();
            
            if (isReceivingByte && (now - lastBitTime > BIT_RECEIVE_TIMEOUT_MS)) {
                this.log(`Таймаут при приеме битов, буфер сброшен: [${bitBuffer.join('')}]`, 'warning');
                bitBuffer = [];
                isReceivingByte = false;
                return;
            }

            if (now - lastBitTime < BIT_DURATION * 1000 * 0.8) {
                return;
            }
            lastBitTime = now;

            if (!isReceivingByte) {
                if (bit === START_BIT) {
                    this.log('Обнаружено начало передачи данных');
                    isReceivingByte = true;
                    bitBuffer = [];
                }
            } else { 
                bitBuffer.push(bit);

                if (bitBuffer.length === 9) { // 8 data bits + 1 stop bit
                    const stopBit = bitBuffer.pop(); 
                    if (stopBit !== STOP_BIT) {
                        this.log(`Ошибка: неверный стоповый бит. Получено: ${stopBit}`, 'error');
                    } else {
                        const byteValue = bitBuffer.reduce((acc, b, i) => acc | (b << i), 0);
                        const char = String.fromCharCode(byteValue);
                        this.log(`Принят байт 0x${byteValue.toString(16)}, символ '${char}'`);
                        this.onDataReceived(char);
                    }
                    isReceivingByte = false;
                    bitBuffer = [];
                }
            }
        }, "16n").start(0);

        Tone.Transport.start();
    }
    
    private frequencyToBit(freq: number): number | null {
        if (Math.abs(freq - BIT_0_FREQ) < 20) return 0;
        if (Math.abs(freq - BIT_1_FREQ) < 20) return 1;
        return null;
    }

    private stopListeningForData() {
        this.listenLoop?.stop();
        this.listenLoop?.dispose();
        this.listenLoop = null;
    }

    hangup() {
        if (this.state === 'idle') return;

        this.stopListeningForTone();
        this.stopListeningForData();
        this.synth?.triggerRelease();
        
        if (this.microphoneStream) {
            this.microphoneStream.getTracks().forEach(track => track.stop());
            this.microphoneStream = null;
            this.inputSource = null;
        }

        if (this.partnerModem && this.partnerModem.state !== 'idle') {
            this.partnerModem.hangup();
        }
        
        this.setState('idle');
        this.log('Соединение разорвано');
    }

    private detectFrequency(): number | null {
        if (!this.analyser) return null;
        
        const values = this.analyser.getValue();
        if (!(values instanceof Float32Array) || values.length === 0) return null;

        let maxVal = -Infinity;
        let maxIndex = -1;

        for (let i = 0; i < values.length; i++) {
            if (values[i] > maxVal) {
                maxVal = values[i];
                maxIndex = i;
            }
        }
        
        if (maxVal < -70) { 
            return null;
        }

        const frequency = maxIndex * (this.audioContext.sampleRate / this.analyser.size);
        
        if (frequency > 500) { 
            return frequency;
        }

        return null;
    }
    
    private listenForTone(targetFreq: number, onFound: () => void) {
        if (this.listenLoop) this.listenLoop.stop();

        this.listenLoop = new Tone.Loop(time => {
             const freq = this.detectFrequency();
             if (freq && Math.abs(freq - targetFreq) < 20) {
                 onFound();
                 this.stopListeningForTone();
             }
        }, "16n").start(0);

        Tone.Transport.start();
    }
    
    private stopListeningForTone() {
        if(this.handshakeTimeout) clearTimeout(this.handshakeTimeout);
        this.listenLoop?.stop();
        this.listenLoop?.dispose();
        this.listenLoop = null;
    }
}
