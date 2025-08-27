
"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useLog } from '@/context/log-context';
import { Textarea } from './ui/textarea';
import { Modem, ModemMode, ModemState } from '@/lib/modem';
import { PhoneCall, PhoneIncoming, Send, XCircle, Link, Unlink, Loader2, PlusCircle } from 'lucide-react';
import { Separator } from './ui/separator';
import * as Tone from 'tone';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const templates = ["Test 123", "Hello World", "ABC-DEF-GHI"];

const ModemInstance = ({ id, modem, isConnected, addLog }: { id: string, modem: Modem, isConnected: boolean, addLog: (message: string, type?: 'info' | 'error' | 'warning') => void }) => {
    const [modemState, setModemState] = useState<ModemState>('idle');
    const [receivedText, setReceivedText] = useState('');
    const [textToSend, setTextToSend] = useState('');

    useEffect(() => {
        modem.onStateChange = (newState) => {
            if (newState === 'idle') {
                setReceivedText('');
                setTextToSend('');
            }
            setModemState(newState);
        };
        modem.onDataReceived = (data) => setReceivedText(prev => prev + data);
    }, [modem]);
    
    const startCalling = async () => {
        if (!isConnected) return;
        modem.start(ModemMode.CALL);
    };

    const startAnswering = async () => {
        if (!isConnected) return;
        modem.start(ModemMode.ANSWER);
    };
    
    const handleSend = () => {
        if (textToSend && modemState === 'connected') {
            modem.send(textToSend);
            setTextToSend('');
        }
    };

    const isConnecting = modemState === 'calling' || modemState === 'answering' || modemState === 'handshake';
    const isActuallyConnected = modemState === 'connected';
    const isIdle = modemState === 'idle' || modemState === 'error';

    return (
        <Card className="flex-1">
            <CardHeader>
                <CardTitle>Модем {id}</CardTitle>
                <CardDescription>Состояние: <span className={`font-bold ${isActuallyConnected ? 'text-green-600' : 'text-muted-foreground'}`}>{modemState}</span></CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                    <Button onClick={startCalling} disabled={!isIdle || !isConnected}>
                        {isConnecting && modem.mode === ModemMode.CALL ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PhoneCall className="mr-2 h-4 w-4" />}
                        Вызвать
                    </Button>
                    <Button onClick={startAnswering} variant="secondary" disabled={!isIdle || !isConnected}>
                        {isConnecting && modem.mode === ModemMode.ANSWER ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PhoneIncoming className="mr-2 h-4 w-4" />}
                        Ответить
                    </Button>
                </div>
                 {!isIdle && (
                  <Button onClick={() => modem.hangup()} variant="destructive" className="w-full">
                    <XCircle className="mr-2 h-4 w-4" />
                    Разъединить
                  </Button>
                )}
                <div className="space-y-1">
                    <label className="text-sm font-medium">Получено:</label>
                    <Textarea readOnly value={receivedText} className="font-mono h-20" placeholder="Ожидание..." />
                </div>
                <div className="space-y-1">
                     <div className="flex justify-between items-center mb-1">
                        <label className="text-sm font-medium">Отправить:</label>
                         <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <PlusCircle className="mr-2 h-4 w-4" />
                                  Шаблоны
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                {templates.map((template, index) => (
                                  <DropdownMenuItem
                                    key={index}
                                    onSelect={() => {
                                      setTextToSend(template);
                                      addLog(`(Модем ${id}) Вставлен шаблон: "${template}"`);
                                    }}
                                  >
                                    {template}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                     </div>
                     <div className="flex gap-2">
                        <Textarea value={textToSend} onChange={(e) => setTextToSend(e.target.value)} disabled={!isActuallyConnected} />
                        <Button onClick={handleSend} disabled={!isActuallyConnected || !textToSend} size="icon">
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};


export function ModemTestTab() {
  const { addLog } = useLog();
  const [isConnected, setIsConnected] = useState(false);
  
  const modemA = useMemo(() => new Modem((s) => {}, (d) => {}, addLog, 'A'), [addLog]);
  const modemB = useMemo(() => new Modem((s) => {}, (d) => {}, addLog, 'B'), [addLog]);
  const sharedAudioContextRef = useRef<AudioContext | null>(null);

  const connectModems = useCallback(async () => {
    addLog('Соединение виртуальных модемов...');
    
    // Create and resume the shared audio context on user gesture
    if (!sharedAudioContextRef.current) {
        sharedAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (sharedAudioContextRef.current.state === 'suspended') {
        await sharedAudioContextRef.current.resume();
        addLog('AudioContext возобновлен.');
    }
    
    const audioCtx = sharedAudioContextRef.current;
    
    // Initialize both modems with the same shared context and no mic input.
    await modemA.initialize(audioCtx, { ensureMic: false });
    await modemB.initialize(audioCtx, { ensureMic: false });

    // Connect the output of each modem to the input of the other.
    const modemAOutput = modemA.getOutputNode();
    const modemBOutput = modemB.getOutputNode();
    
    if (modemAOutput && modemBOutput) {
        modemA.connectInput(modemBOutput);
        modemB.connectInput(modemAOutput);
        
        setIsConnected(true);
        addLog('Модемы успешно соединены.');
    } else {
        addLog('Ошибка: не удалось получить аудио узлы для соединения.', 'error');
    }

  }, [addLog, modemA, modemB]);

  const disconnectModems = useCallback(() => {
    if (!isConnected) return;
    addLog('Разъединение виртуальных модемов...');
    
    const modemAOutput = modemA.getOutputNode();
    const modemBOutput = modemB.getOutputNode();

    if (modemAOutput && modemBOutput) {
        modemA.disconnectInput(modemBOutput);
        modemB.disconnectInput(modemAOutput);
    }

    modemA.hangup();
    modemB.hangup();
    
    setIsConnected(false);
    addLog('Модемы разъединены.');
  }, [addLog, modemA, modemB, isConnected]);
  
  useEffect(() => {
      // Cleanup on component unmount
      return () => {
          disconnectModems();
      }
  }, [disconnectModems]);

  return (
    <Card className="border-0 shadow-none">
      <CardHeader>
        <CardTitle>Тестирование модема</CardTitle>
        <CardDescription>Симуляция двусторонней связи между двумя модемами в браузере.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Card>
            <CardHeader>
                <CardTitle>Управление каналом связи</CardTitle>
            </CardHeader>
            <CardContent>
                {isConnected ? (
                     <Button onClick={disconnectModems} variant="destructive" className="w-full">
                        <Unlink className="mr-2 h-4 w-4"/>
                        Разъединить модемы
                    </Button>
                ) : (
                    <Button onClick={connectModems} className="w-full">
                        <Link className="mr-2 h-4 w-4"/>
                        Соединить модемы (виртуальный кабель)
                    </Button>
                )}
            </CardContent>
        </Card>
        
        <Separator/>

        <div className="flex flex-col md:flex-row gap-4">
          <ModemInstance id="A" modem={modemA} isConnected={isConnected} addLog={addLog} />
          <ModemInstance id="B" modem={modemB} isConnected={isConnected} addLog={addLog} />
        </div>
      </CardContent>
    </Card>
  );
}
