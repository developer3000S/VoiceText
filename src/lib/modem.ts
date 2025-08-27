
import * as Tone from 'tone';

export type ModemState = 'idle' | 'calling' | 'answering' | 'handshake' | 'connected' | 'error';
export enum ModemMode { CALL, ANSWER }

const CARRIER_FREQ = 1800; // Tone from answerer to show it's ready
const REQUEST_FREQ = 1600; // Tone from caller to start handshake
const ACK_FREQ = 2200;     // Acknowledge tone
const BIT_0_FREQ = 1000;
const BIT_1_FREQ = 2000;

const BIT_DURATION = 0.05; // 50ms per bit => 20 baud
const TONE_DURATION = 0.05; 
const TIMEOUT_MS = 5000;

export class Modem {
    private state: ModemState = 'idle';
    private audioContext!: AudioContext;
    private analyser!: AnalyserNode;
    private microphoneStream: MediaStream | null = null;
    private oscillator: Tone.Oscillator | null = null;
    private synth: Tone.Synth | null = null;

    private onStateChange: (newState: ModemState) => void;
    private onDataReceived: (data: string) => void;
    private addLog: (message: string, type?: 'info' | 'error' | 'warning') => void;
    private analysisFrameId: number | null = null;

    constructor(
        onStateChange: (newState: ModemState) => void,
        onDataReceived: (data: string) => void,
        addLog: (message: string, type?: 'info' | 'error' | 'warning') => void
    ) {
        this.onStateChange = onStateChange;
        this.onDataReceived = onDataReceived;
        this.addLog = addLog;
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
        
        try {
            this.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = this.audioContext.createMediaStreamSource(this.microphoneStream);
            source.connect(this.analyser);
        } catch (error) {
            this.addLog('Ошибка доступа к микрофону', 'error');
            this.setState('error');
            throw new Error('Microphone access denied');
        }
        
        this.oscillator = new Tone.Oscillator().toDestination();
        this.synth = new Tone.Synth().toDestination();
        this.addLog('Модем инициализирован');
    }

    start(mode: ModemMode) {
        if (this.state !== 'idle' && this.state !== 'error') return;
        
        if (mode === ModemMode.ANSWER) {
            this.setState('answering');
            this.oscillator?.set({ frequency: CARRIER_FREQ, volume: -12 }).start();
            this.listenForTone(REQUEST_FREQ, TIMEOUT_MS).then(found => {
                if (found) {
                    this.addLog('Сигнал запроса получен, начинаем handshake');
                    this.oscillator?.stop();
                    this.performHandshake(ModemMode.ANSWER);
                } else {
                    this.addLog('Таймаут ожидания сигнала запроса', 'error');
                    this.hangup();
                }
            });
        } else { // ModemMode.CALL
            this.setState('calling');
            this.listenForTone(CARRIER_FREQ, TIMEOUT_MS).then(found => {
                if (found) {
                    this.addLog('Сигнал готовности получен, отправка запроса');
                    this.synth?.triggerAttackRelease(REQUEST_FREQ, '0.2s');
                    this.performHandshake(ModemMode.CALL);
                } else {
                    this.addLog('Таймаут ожидания сигнала готовности', 'error');
                    this.hangup();
                }
            });
        }
    }

    private async performHandshake(mode: ModemMode) {
        this.setState('handshake');
        // Simple handshake: just transition to connected
        // A real modem would negotiate params here.
        await Tone.Transport.start();
        this.setState('connected');
        this.startListeningForData();
    }

    private async playTone(freq: number, duration: number): Promise<void> {
       return new Promise(resolve => {
           this.synth?.triggerAttackRelease(freq, duration, Tone.now());
           setTimeout(resolve, duration * 1000 + 50); // tone duration + small gap
       })
    }

    async send(text: string) {
        if (this.state !== 'connected') return;
        this.stopListeningForData(); // Pause listening while sending
        
        for (const char of text) {
            const charCode = char.charCodeAt(0);
            this.addLog(`Отправка символа '${char}' (0x${charCode.toString(16)})`);
            const bits: number[] = [];
            for (let i = 7; i >= 0; i--) {
                bits.push((charCode >> i) & 1);
            }

            // Send bits
            for (const bit of bits) {
                const freq = bit === 0 ? BIT_0_FREQ : BIT_1_FREQ;
                await this.playTone(freq, BIT_DURATION);
            }

            // Wait for ACK
            const ackReceived = await this.listenForTone(ACK_FREQ, 500);
            if (!ackReceived) {
                this.addLog(`ACK не получен для символа '${char}', передача прервана`, 'error');
                this.startListeningForData(); // Resume listening
                return;
            }
            this.addLog(`ACK получен для '${char}'`);
        }
        
        this.startListeningForData(); // Resume listening after sending
    }

    private startListeningForData() {
        let bitBuffer: number[] = [];
        let lastBitTime = 0;

        const processFrame = () => {
            if (this.state !== 'connected') return;

            const freq = this.detectFrequency();
            const now = performance.now();
            
            if(freq && now - lastBitTime > (BIT_DURATION * 1000 * 0.8)) {
                let bit: number | null = null;
                if (Math.abs(freq - BIT_0_FREQ) < 20) bit = 0;
                else if (Math.abs(freq - BIT_1_FREQ) < 20) bit = 1;

                if (bit !== null) {
                    bitBuffer.push(bit);
                    lastBitTime = now;
                    if (bitBuffer.length === 8) {
                        const charCode = parseInt(bitBuffer.join(''), 2);
                        const char = String.fromCharCode(charCode);
                        this.onDataReceived(char);
                        bitBuffer = [];
                        // Send ACK
                        this.playTone(ACK_FREQ, TONE_DURATION);
                    }
                }
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
        if (this.microphoneStream) {
            this.microphoneStream.getTracks().forEach(track => track.stop());
            this.microphoneStream = null;
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
           // this.audioContext.close(); // This can be problematic, better to just disconnect
        }
        this.setState('idle');
        this.addLog('Соединение разорвано');
    }

    private detectFrequency(): number | null {
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);

        let maxVal = -1;
        let maxIndex = -1;

        // Iterate over the data to find the peak
        for (let i = 0; i < dataArray.length; i++) {
            if (dataArray[i] > maxVal) {
                maxVal = dataArray[i];
                maxIndex = i;
            }
        }
        
        // Convert the index to a frequency
        const frequency = maxIndex * (this.audioContext.sampleRate / this.analyser.fftSize);

        // Check if the detected peak is strong enough and within a reasonable range to be a signal
        if (maxVal > 50 && frequency > 500) {
            return frequency;
        }

        return null;
    }
    
    private async listenForTone(targetFreq: number, timeout: number): Promise<boolean> {
        return new Promise(resolve => {
            const startTime = Date.now();
            
            const check = () => {
                const freq = this.detectFrequency();
                if (freq && Math.abs(freq - targetFreq) < 20) { // 20Hz tolerance
                    resolve(true);
                    return;
                }
                if (Date.now() - startTime > timeout) {
                    resolve(false);
                    return;
                }
                requestAnimationFrame(check);
            };
            check();
        });
    }
}
