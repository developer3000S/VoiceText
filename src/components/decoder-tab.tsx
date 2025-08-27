
"use client";

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mic, Square, FileText, Upload, Speaker, PlayCircle, CircleDashed, LockKeyhole, KeyRound } from 'lucide-react';
import { useRecorder } from '@/hooks/use-recorder';
import { useLog } from '@/context/log-context';
import { decodeDtmfFromAudio, decodeSequenceFromTones, DecodedResult } from '@/lib/dtmf-decoder';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Input } from './ui/input';
import { Label } from './ui/label';

export function DecoderTab() {
  const [isLoading, setIsLoading] = useState(false);
  const [decodedResult, setDecodedResult] = useState<DecodedResult | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [password, setPassword] = useState('');

  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { addLog } = useLog();
  const { isRecording, startRecording, stopRecording } = useRecorder();

  const cleanup = () => {
    setDecodedResult(null);
    setRecordedBlob(null);
    setPassword('');
    if (audioRef.current) {
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
  };

  const handleDecode = useCallback(async (blob: Blob, source: string) => {
    cleanup();
    setIsLoading(true);
    setRecordedBlob(blob);
    
    addLog(`Запуск декодирования аудио из источника: ${source}`);
    try {
      const tones = await decodeDtmfFromAudio(blob, addLog);
      const result = tones ? decodeSequenceFromTones(tones, addLog) : { text: null, requiresPassword: false, error: 'Не удалось извлечь DTMF тоны.' };
      
      setDecodedResult(result);

      if (result.text !== null && result.text !== undefined) {
        addLog(`Декодирование успешно. Результат: "${result.text}"`);
      } else if (result.requiresPassword) {
        addLog('Сообщение зашифровано. Требуется пароль.', 'warning');
        toast({ title: 'Требуется пароль', description: 'Это сообщение зашифровано. Введите пароль для расшифровки.' });
      } else {
        const errorMsg = result.error || 'Не удалось распознать тоны или сообщение неполное.';
        addLog(errorMsg, 'error');
        toast({
          variant: 'destructive',
          title: 'Ошибка декодирования',
          description: errorMsg,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        variant: 'destructive',
        title: 'Ошибка',
        description: 'Не удалось обработать аудиофайл.',
      });
      setDecodedResult(null);
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
      cleanup();
      await startRecording();
      addLog('Запись с микрофона начата...');
  }

  const handleStopRecording = async () => {
    addLog('Остановка записи...');
    const recordResult = await stopRecording();
    if (recordResult && recordResult.blob.size > 0) {
      addLog('Запись завершена, начало декодирования.');
      handleDecode(recordResult.blob, 'микрофон');
    } else {
      addLog('Запись пуста, декодирование отменено.', 'warning');
    }
  }

  const handlePlayRecording = () => {
    if (!recordedBlob || isListening) return;

    addLog('Воспроизведение записанного аудио.');
    setIsListening(true);
    const audioUrl = URL.createObjectURL(recordedBlob);
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.onended = () => {
      setIsListening(false);
      URL.revokeObjectURL(audioUrl);
      audioRef.current = null;
      addLog('Воспроизведение завершено.');
    };
    
    audio.onerror = () => {
      setIsListening(false);
      addLog('Ошибка воспроизведения записи.', 'error');
      toast({
        variant: 'destructive',
        title: 'Ошибка',
        description: 'Не удалось воспроизвести аудиозапись.',
      });
    }

    audio.play();
  };

  const handleDecrypt = async () => {
    if (!decodedResult?.extractedTones || !password) {
        toast({ variant: 'destructive', title: 'Ошибка', description: 'Нет данных для расшифровки или не введен пароль.' });
        return;
    }
    
    addLog(`Запуск расшифровки с паролем.`);
    setIsLoading(true);
    
    try {
        const result = decodeSequenceFromTones(decodedResult.extractedTones, addLog, password);
        setDecodedResult(result);
        
        if (result.text) {
            addLog(`Расшифровка успешна. Результат: "${result.text}"`);
        } else {
            const errorMsg = result.error || 'Неверный пароль или поврежденные данные.';
            addLog(errorMsg, 'error');
            toast({ variant: 'destructive', title: 'Ошибка расшифровки', description: errorMsg });
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLog(`Критическая ошибка при расшифровке: ${errorMessage}`, 'error');
    }

    setIsLoading(false);
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader>
        <CardTitle>Декодер аудио в текст</CardTitle>
        <CardDescription>Запишите или загрузите аудио с DTMF-тонами для декодирования в текст.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        <Alert variant="default" className="bg-primary/10 border-primary/20">
          <Speaker className="h-5 w-5 text-primary" />
          <AlertTitle className="font-semibold text-primary">Важная инструкция</AlertTitle>
          <AlertDescription>
            Для записи сигналов во время звонка, пожалуйста, включите **громкую связь** на телефоне, а затем начните запись в этом приложении.
          </AlertDescription>
        </Alert>

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
            <Button onClick={handleUploadClick} variant="outline" className="w-full" disabled={isLoading || isRecording}>
                <Upload className="mr-2 h-4 w-4" /> Загрузить файл
            </Button>
        </div>

        <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="audio/*"
        />

        {(isLoading || decodedResult !== null || recordedBlob) && (
          <Card className="bg-muted/50 mt-4">
            <CardHeader>
              <CardTitle className="text-lg">Результат</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading && !(decodedResult)?.requiresPassword ? (
                  <div className="flex justify-center items-center p-6">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
              ) : (
                <>
                  {decodedResult?.text !== null && decodedResult?.text !== undefined && (
                    <div className="flex items-start space-x-3 bg-background p-4 rounded-md">
                        <FileText className="h-5 w-5 mt-1 text-primary"/>
                        <p className="font-mono text-left flex-1 break-words">{decodedResult.text || 'Сообщение не найдено'}</p>
                    </div>
                  )}

                  {decodedResult?.requiresPassword && !decodedResult?.text && (
                    <div className="space-y-3">
                         <div className="relative">
                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input 
                                type="password" 
                                placeholder="Пароль для расшифровки" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="pl-9"
                                autoFocus
                            />
                        </div>
                        <Button onClick={handleDecrypt} className="w-full" disabled={!password || isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LockKeyhole className="mr-2 h-4 w-4" />}
                            Расшифровать
                        </Button>
                    </div>
                  )}

                  {recordedBlob && (
                    <Button onClick={handlePlayRecording} disabled={isListening} className="w-full" variant="secondary">
                       {isListening ? (
                         <CircleDashed className="mr-2 h-4 w-4 animate-spin"/>
                       ) : (
                         <PlayCircle className="mr-2 h-4 w-4"/>
                       )}
                       Прослушать запись
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
