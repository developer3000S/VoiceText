
"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mic, Square, FileText, Upload, ShieldCheck } from 'lucide-react';
import { useRecorder } from '@/hooks/use-recorder';
import { useLog } from '@/context/log-context';
import { decodeDtmfFromAudio } from '@/lib/dtmf-decoder';
import { Capacitor } from '@capacitor/core';
import type { PermissionState } from '@capacitor/core';

export function DecoderTab() {
  const [isLoading, setIsLoading] = useState(false);
  const [decodedText, setDecodedText] = useState<string | null>(null);
  const [microphonePermission, setMicrophonePermission] = useState<PermissionState>('prompt');

  const { toast } = useToast();
  const { isRecording, startRecording, stopRecording } = useRecorder();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addLog } = useLog();

  const checkPermissions = useCallback(async () => {
    if (!Capacitor.isPluginAvailable('Permissions')) {
        addLog('Плагин разрешений недоступен, используется стандартный API браузера.', 'info');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            setMicrophonePermission('granted');
            addLog('Доступ к микрофону в браузере разрешен.', 'info');
        } catch {
            setMicrophonePermission('denied');
            addLog('Доступ к микрофону в браузере запрещен.', 'warning');
        }
        return;
    }

    try {
      addLog('Проверка разрешений на нативном устройстве...', 'info');
      const { microphone } = await Capacitor.Plugins.Permissions.check();
      setMicrophonePermission(microphone);
      addLog(`Текущий статус разрешения: ${microphone}`, 'info');
    } catch (error) {
       const errorMessage = error instanceof Error ? error.message : String(error);
       addLog(`Ошибка при проверке разрешений: ${errorMessage}`, 'error');
    }
  }, [addLog]);

  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  const requestPermissions = async () => {
    if (Capacitor.isPluginAvailable('Permissions')) {
        addLog('Запрос разрешения на использование микрофона...', 'info');
        try {
            const { microphone } = await Capacitor.Plugins.Permissions.request({
                names: ['microphone']
            });
            setMicrophonePermission(microphone);

            if (microphone === 'granted') {
                addLog('Разрешение на микрофон было успешно получено.', 'info');
                toast({ title: 'Доступ разрешен', description: 'Теперь вы можете использовать микрофон.'});
            } else {
                addLog('Пользователь отказал в доступе к микрофону.', 'warning');
                toast({
                    variant: 'destructive',
                    title: 'Доступ запрещен',
                    description: 'Для записи аудио необходимо разрешение на использование микрофона.',
                });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            addLog(`Ошибка при запросе разрешений: ${errorMessage}`, 'error');
            toast({ variant: 'destructive', title: 'Ошибка разрешений', description: errorMessage });
        }
    } else {
        // Fallback for web
        await startRecording();
    }
  };

  const handleDecode = useCallback(async (blob: Blob, source: string) => {
    setIsLoading(true);
    setDecodedText(null);
    addLog(`Запуск локального декодирования аудио из источника: ${source}`);
    try {
      const text = await decodeDtmfFromAudio(blob, addLog);
      if (text !== null) {
        setDecodedText(text);
        addLog(`Декодирование успешно. Результат: "${text}"`);
      } else {
        const errorMsg = 'Не удалось распознать DTMF тоны в аудио или сообщение неполное (отсутствует стоп-символ #).';
        toast({
          variant: 'destructive',
          title: 'Ошибка декодирования',
          description: errorMsg,
        });
        setDecodedText(null);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        variant: 'destructive',
        title: 'Ошибка',
        description: 'Не удалось обработать аудиофайл.',
      });
      setDecodedText(null);
      addLog(`Ошибка обработки аудио: ${errorMessage}`, 'error');
    }
    setIsLoading(false);
  }, [toast, addLog]);
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      addLog(`Выбран файл для декодирования: ${file.name}`);
      handleDecode(file, `файл (${file.name})`);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleStartRecording = async () => {
    addLog('Запись с микрофона начата...');
    await startRecording();
  }

  const handleStopRecording = async () => {
    addLog('Запись с микрофона остановлена.');
    const blob = await stopRecording();
    if (blob && blob.size > 0) {
      handleDecode(blob, 'микрофон');
    } else {
      addLog('Запись пуста, декодирование отменено.', 'warning');
    }
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader>
        <CardTitle>Декодер DTMF в текст</CardTitle>
        <CardDescription>Запишите или загрузите аудио с DTMF-тонами для декодирования в текст.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {microphonePermission !== 'granted' ? (
             <Card className="border-primary/50 bg-primary/10 mt-4">
                <CardHeader>
                    <CardTitle className="text-lg text-primary">Требуется доступ к микрофону</CardTitle>
                    <CardDescription className="text-foreground/80">
                        Чтобы записывать аудио, приложению необходимо разрешение на использование микрофона.
                    </CardDescription>
                </CardHeader>
                <CardFooter>
                    <Button onClick={requestPermissions} className="w-full">
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Предоставить доступ
                    </Button>
                </CardFooter>
            </Card>
        ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Button 
                    onClick={isRecording ? handleStopRecording : handleStartRecording} 
                    className="w-full" 
                    disabled={isLoading}
                >
                    {isRecording ? (
                    <>
                        <Square className="mr-2 h-4 w-4 animate-pulse fill-current" /> Остановить запись
                    </>
                    ) : (
                    <>
                        <Mic className="mr-2 h-4 w-4" /> Начать запись
                    </>
                    )}
                </Button>
                <Button onClick={handleUploadClick} variant="outline" className="w-full" disabled={isLoading}>
                    <Upload className="mr-2 h-4 w-4" /> Загрузить файл
                </Button>
            </div>
        )}

        <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="audio/wav,audio/mp3,audio/webm,audio/ogg,audio/*"
        />

        {(isLoading || decodedText) && (
          <Card className="bg-muted/50 mt-4">
            <CardHeader>
              <CardTitle className="text-lg">Декодированное сообщение</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                  <div className="flex justify-center items-center p-6">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
              ) : (
                 <div className="flex items-start space-x-3 bg-background p-4 rounded-md">
                    <FileText className="h-5 w-5 mt-1 text-primary"/>
                    <p className="font-mono text-left flex-1 break-words">{decodedText || "Текст не декодирован."}</p>
                 </div>
              )}
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
