
import * as Tone from 'tone';

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
const BIT_RECEIVE_TIMEOUT_MS = BIT_DURATION * 1000 * 2;

// Protocol bits
const START_BIT = 0;
const STOP_BIT = 1;


export class Modem {
    private state: ModemState = 'idle';
    public audioContext!: AudioContext;
    private analyser!: AnalyserNode;
    private microphoneStream: MediaStream | null = null;
    private synth: Tone.Synth | null = null;
    private gainNode: GainNode | null = null;
    private inputSource: AudioNode | null = null;
    private oscillator: Tone.Oscillator | null = null;

    public onStateChange: (newState: ModemState) => void;
    public onDataReceived: (data: string) => void;
    private addLog: (message: string, type?: 'info' | 'error' | 'warning') => void;
    private analysisFrameId: number | null = null;
    public mode: ModemMode | null = null;
    private id: string;
    private partnerModem: Modem | null = null;

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
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        Tone.setContext(this.audioContext);

        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        
        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);
        
        this.synth = new Tone.Synth().connect(new Tone.Gain(0.5));
        this.oscillator = new Tone.Oscillator(440, "sine").toDestination();
        this.synth.connect(this.gainNode);

        this.log('Модем инициализирован');
    }

    private async ensureMicInput() {
       if (!this.inputSource) {
            try {
                this.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const source = this.audioContext.createMediaStreamSource(this.microphoneStream);
                this.connectInput(source, this.audioContext);
                this.log('Вход с микрофона активирован.');
            } catch (error) {
                this.log('Ошибка доступа к микрофону', 'error');
                this.setState('error');
                throw new Error('Microphone access denied');
            }
        }
    }

    connectInput(source: AudioNode, destContext: AudioContext) {
        if (destContext.state === 'closed') {
             this.log('Cannot connect to a closed audio context.', 'error');
             return;
        }
        if(this.audioContext.state === 'closed'){
            this.log('Source audio context is closed, cannot connect.', 'error');
            return;
        }
        // Instead of connecting directly, we check if contexts are different.
        // This is crucial for the test tab.
        if (this.audioContext !== destContext) {
            // For the test tab, we directly connect the gain node of the source
            // modem to the analyser of the destination modem.
            this.gainNode?.connect(this.analyser);
        } else {
             this.inputSource = source;
             this.inputSource.connect(this.analyser);
        }

        this.log(`Вход соединен`);
    }

    disconnectInput() {
        this.inputSource?.disconnect();
        this.gainNode?.disconnect(); // Disconnect gain node as well
        this.inputSource = null;
        this.partnerModem = null;
        this.log('Вход отсоединен.');
    }

    getOutputNode(): AudioNode | null {
        return this.gainNode;
    }

    async start(mode: ModemMode) {
        if (this.state !== 'idle' && this.state !== 'error') return;
        
        if (!this.inputSource) {
            await this.ensureMicInput();
        }

        this.mode = mode;
        
        if (mode === ModemMode.ANSWER) {
            this.setState('answering');
            this.log('Ожидание вызова...');
            this.listenForTone(REQUEST_FREQ, HANDSHAKE_TIMEOUT_MS).then(found => {
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
            this.listenForTone(CARRIER_FREQ, HANDSHAKE_TIMEOUT_MS).then(found => {
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
           if (!this.synth) return resolve();
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
                const bit = (charCode >> i) & 1;
                await this.playBit(bit);
            }

            await this.playBit(STOP_BIT);
        }
    }

    private startListeningForData() {
        if (this.analysisFrameId) return;
        this.log('Обнаружено начало передачи данных');
        let bitBuffer: number[] = [];
        let lastBitTime = 0;
        let isReceivingByte = false;

        const processFrame = () => {
            if (this.state !== 'connected') return;

            this.analysisFrameId = requestAnimationFrame(processFrame);
            const now = performance.now();
            
            if (isReceivingByte && (now - lastBitTime > BIT_RECEIVE_TIMEOUT_MS)) {
                this.log(`Таймаут при приеме битов, буфер сброшен: [${bitBuffer.join('')}]`, 'warning');
                bitBuffer = [];
                isReceivingByte = false;
                return;
            }

            const freq = this.detectFrequency();
            if (!freq) return;

            const bit = this.frequencyToBit(freq);
            if (bit === null) return;

            if (!isReceivingByte) {
                if (bit === START_BIT) {
                    isReceivingByte = true;
                    bitBuffer = [];
                    lastBitTime = now;
                }
            } else { 
                if (now - lastBitTime > (BIT_DURATION * 1000 * 0.8)) {
                    lastBitTime = now;
                    bitBuffer.push(bit);

                    if (bitBuffer.length === 9) {
                        const stopBit = bitBuffer.pop(); 
                        if (stopBit !== STOP_BIT) {
                            this.log(`Ошибка: неверный стоповый бит. Получено: ${stopBit}`, 'error');
                        } else {
                            const byteValue = parseInt(bitBuffer.reverse().join(''), 2);
                            const char = String.fromCharCode(byteValue);
                            this.log(`Принят байт 0x${byteValue.toString(16)}, символ '${char}'`);
                            this.onDataReceived(char);
                        }
                        isReceivingByte = false;
                        bitBuffer = [];
                    }
                }
            }
        };
        processFrame();
    }
    
    private frequencyToBit(freq: number): number | null {
        if (Math.abs(freq - BIT_0_FREQ) < 20) return 0;
        if (Math.abs(freq - BIT_1_FREQ) < 20) return 1;
        return null;
    }

    private stopListeningForData() {
        if (this.analysisFrameId) {
            cancelAnimationFrame(this.analysisFrameId);
            this.analysisFrameId = null;
        }
    }

    hangup() {
        if (this.state === 'idle') return;

        this.stopListeningForData();
        this.oscillator?.stop();
        this.synth?.triggerRelease();
        
        if (this.microphoneStream) {
            this.microphoneStream.getTracks().forEach(track => track.stop());
            this.microphoneStream = null;
        }
        
        if (this.partnerModem && this.partnerModem.state !== 'idle') {
            this.partnerModem.hangup();
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
           this.audioContext.close().catch(e => this.log(`Ошибка при закрытии AudioContext: ${e}`, 'error'));
        }

        this.setState('idle');
        this.log('Соединение разорвано');
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
            let frameId: number;
            
            const check = () => {
                if (this.state === 'idle' || this.state === 'error') {
                    if (frameId) cancelAnimationFrame(frameId);
                    resolve(false);
                    return;
                }
                const freq = this.detectFrequency();
                if (freq && Math.abs(freq - targetFreq) < 20) {
                    cancelAnimationFrame(frameId);
                    resolve(true);
                    return;
                }
                if (Date.now() - startTime > timeout) {
                    cancelAnimationFrame(frameId);
                    resolve(false);
                    return;
                }
                frameId = requestAnimationFrame(check);
            };
            check();
        });
    }
}
