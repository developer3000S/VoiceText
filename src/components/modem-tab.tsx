
"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { PhoneCall, PhoneIncoming, Send, XCircle, Loader2, PlusCircle } from 'lucide-react';
import { useLog } from '@/context/log-context';
import { Textarea } from './ui/textarea';
import { Modem, ModemMode, ModemState } from '@/lib/modem';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const templates = ["Привет!", "Как дела?", "Встречаемся в 15:00."];

export function ModemTab() {
  const [modem, setModem] = useState<Modem | null>(null);
  const [modemState, setModemState] = useState<ModemState>('idle');
  const [receivedText, setReceivedText] = useState('');
  const [textToSend, setTextToSend] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { addLog } = useLog();
  const { toast } = useToast();

  const handleStateChange = useCallback((newState: ModemState) => {
    setModemState(newState);
    addLog(`Статус модема: ${newState}`);
    if (['idle', 'error'].includes(newState)) {
      setIsLoading(false);
    }
  }, [addLog]);

  const handleDataReceived = useCallback((data: string) => {
    setReceivedText((prev) => prev + data);
    addLog(`Получен символ: "${data}"`);
  }, [addLog]);

  const initializeModem = useCallback(async () => {
    try {
      const newModem = new Modem(handleStateChange, handleDataReceived, addLog);
      await newModem.initialize();
      setModem(newModem);
      return newModem;
    } catch (error) {
      const msg = `Ошибка инициализации модема: ${(error as Error).message}`;
      addLog(msg, 'error');
      toast({ variant: 'destructive', title: 'Ошибка', description: msg });
      return null;
    }
  }, [handleStateChange, handleDataReceived, addLog, toast]);

  const startAnswering = async () => {
    setIsLoading(true);
    let m = modem;
    if (!m) {
      m = await initializeModem();
    }
    if (m) {
      m.start(ModemMode.ANSWER);
    } else {
      setIsLoading(false);
    }
  };

  const startCalling = async () => {
    setIsLoading(true);
    let m = modem;
    if (!m) {
      m = await initializeModem();
    }
    if (m) {
      m.start(ModemMode.CALL);
    } else {
      setIsLoading(false);
    }
  };

  const handleHangup = () => {
    modem?.hangup();
  };

  const handleSend = () => {
    if (textToSend && modemState === 'connected') {
      modem?.send(textToSend);
      setTextToSend('');
    }
  };

  useEffect(() => {
    return () => {
      modem?.hangup();
    };
  }, [modem]);

  const isConnected = modemState === 'connected';
  const isIdle = modemState === 'idle' || modemState === 'error';

  return (
    <Card className="border-0 shadow-none">
      <CardHeader>
        <CardTitle>Интерактивный модем</CardTitle>
        <CardDescription>Установите соединение для посимвольной передачи текста.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Button onClick={startCalling} disabled={!isIdle || isLoading}>
            {isLoading && modemState !== 'answering' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PhoneCall className="mr-2 h-4 w-4" />}
            Вызвать
          </Button>
          <Button onClick={startAnswering} variant="secondary" disabled={!isIdle || isLoading}>
            {isLoading && modemState === 'answering' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PhoneIncoming className="mr-2 h-4 w-4" />}
            Ответить
          </Button>
        </div>

        {!isIdle && (
          <Button onClick={handleHangup} variant="destructive" className="w-full">
            <XCircle className="mr-2 h-4 w-4" />
            Разъединить
          </Button>
        )}

        <div className="space-y-2">
            <label htmlFor="received-text" className="text-sm font-medium">Получено:</label>
            <Textarea id="received-text" readOnly value={receivedText} className="font-mono h-24" placeholder="Ожидание данных..." />
        </div>

        <div className="space-y-2">
             <div className="flex justify-between items-center mb-2">
                <label htmlFor="send-text" className="text-sm font-medium">Отправить:</label>
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
                              addLog(`Вставлен шаблон: "${template}"`);
                            }}
                          >
                            {template}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
             </div>
            <div className="flex gap-2">
                <Textarea id="send-text" value={textToSend} onChange={(e) => setTextToSend(e.target.value)} disabled={!isConnected} placeholder={isConnected ? "Введите текст для отправки" : "Подключитесь для отправки"} />
                <Button onClick={handleSend} disabled={!isConnected || !textToSend}>
                    <Send className="h-4 w-4" />
                </Button>
            </div>
        </div>
      </CardContent>
    </Card>
  );
}
