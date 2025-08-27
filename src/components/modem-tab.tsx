
"use client";

import { useState, useCallback, useEffect, useMemo } from 'react';
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
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Speaker } from 'lucide-react';

const templates = ["Привет!", "Как дела?", "Встречаемся в 15:00."];

export function ModemTab() {
  const { addLog } = useLog();
  const { toast } = useToast();

  const modem = useMemo(() => {
    return new Modem((newState) => {
      setModemState(newState);
      addLog(`Статус модема: ${newState}`);
    }, (data) => {
      setReceivedText((prev) => prev + data);
      addLog(`Получены данные: "${data}"`);
    }, addLog, 'A');
  }, [addLog]);

  const [modemState, setModemState] = useState<ModemState>('idle');
  const [receivedText, setReceivedText] = useState('');
  const [textToSend, setTextToSend] = useState('');

  const checkAndRequestPermission = async (): Promise<boolean> => {
    try {
      // Check for permission by trying to get a stream.
      // This will trigger the browser's permission prompt if not already granted.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // We don't need the stream itself, just to know we can get it.
      // Stop the tracks immediately to turn off the microphone indicator.
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      addLog('Доступ к микрофону запрещен. Пожалуйста, разрешите доступ в настройках браузера.', 'error');
      toast({
        variant: 'destructive',
        title: 'Доступ к микрофону запрещен',
        description: 'Необходимо разрешить доступ к микрофону для работы модема.',
      });
      return false;
    }
  };

  const startAnswering = async () => {
    const hasPermission = await checkAndRequestPermission();
    if (!hasPermission) return;
    
    await modem.initialize();
    modem.start(ModemMode.ANSWER);
  };

  const startCalling = async () => {
    const hasPermission = await checkAndRequestPermission();
    if (!hasPermission) return;

    await modem.initialize();
    modem.start(ModemMode.CALL);
  };

  const handleHangup = () => {
    modem.hangup();
  };

  const handleSend = () => {
    if (textToSend && modemState === 'connected') {
      modem.send(textToSend);
      setTextToSend('');
    }
  };

  useEffect(() => {
    return () => {
      modem.hangup();
    };
  }, [modem]);

  const isConnecting = modemState === 'calling' || modemState === 'answering' || modemState === 'handshake';
  const isConnected = modemState === 'connected';
  const isIdle = modemState === 'idle' || modemState === 'error';

  return (
    <Card className="border-0 shadow-none">
      <CardHeader>
        <CardTitle>Интерактивный модем</CardTitle>
        <CardDescription>Установите соединение для посимвольной передачи текста.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        <Alert variant="default" className="bg-primary/10 border-primary/20">
          <Speaker className="h-5 w-5 text-primary" />
          <AlertTitle className="font-semibold text-primary">Важная инструкция</AlertTitle>
          <AlertDescription>
            Для работы модема включите **громкую связь** на телефоне. Одно устройство должно **Отвечать**, второе — **Вызывать**.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Button onClick={startCalling} disabled={!isIdle}>
            {isConnecting && modem.mode === ModemMode.CALL ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PhoneCall className="mr-2 h-4 w-4" />}
            Вызвать
          </Button>
          <Button onClick={startAnswering} variant="secondary" disabled={!isIdle}>
            {isConnecting && modem.mode === ModemMode.ANSWER ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PhoneIncoming className="mr-2 h-4 w-4" />}
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
