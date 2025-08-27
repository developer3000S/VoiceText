
"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mic, Square, FileText, Upload, Speaker, PlayCircle, CircleDashed } from 'lucide-react';
import { useRecorder } from '@/hooks/use-recorder';
import { useLog } from '@/context/log-context';
import { decodeDtmfFromAudio } from '@/lib/dtmf-decoder';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

export function DecoderTab() {
  const [isLoading, setIsLoading] = useState(false);
  const [decodedText, setDecodedText] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isListening, setIsListening] = useState(false);

  const { toast } = useToast();
  const { isRecording, startRecording, stopRecording } = useRecorder();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { addLog } = useLog();

  const cleanup = () => {
    setDecodedText(null);
    setRecordedBlob(null);
    if (audioRef.current) {
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
  };

  const handleDecode = useCallback(async (blob: Blob, source: string) => {
    cleanup();
    setIsLoading(true);
    setRecordedBlob(blob);
    addLog(`Запуск локального декодирования аудио из источника: ${source}`);
    try {
      const text = await decodeDtmfFromAudio(blob, addLog);
      if (text !== null) {
        setDecodedText(text);
        addLog(`Декодирование успешно. Результат: "${text}"`);
      } else {
        const errorMsg = 'Не удалось распознать DTMF тоны в аудио или сообщение неполное (отсутствует старт * или стоп-символ #).';
        setDecodedText(null);
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
      cleanup();
      addLog('Запрос на начало записи...');
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

  return (
    <Card className="border-0 shadow-none">
      <CardHeader>
        <CardTitle>Декодер DTMF в текст</CardTitle>
        <CardDescription>Запишите или загрузите аудио с DTMF-тонами для декодирования в текст.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        
        <Alert variant="default" className="bg-primary/10 border-primary/20">
          <Speaker className="h-5 w-5 text-primary" />
          <AlertTitle className="font-semibold text-primary">Важная инструкция</AlertTitle>
          <AlertDescription>
            Для записи DTMF-сигналов во время звонка, пожалуйста, включите **громкую связь** на телефоне, а затем начните запись в этом приложении.
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
            accept="audio/wav,audio/mp3,audio/webm,audio/ogg,audio/*"
        />

        {(isLoading || decodedText !== null || recordedBlob) && (
          <Card className="bg-muted/50 mt-4">
            <CardHeader>
              <CardTitle className="text-lg">Результат</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                  <div className="flex justify-center items-center p-6">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
              ) : (
                <>
                  {decodedText !== null && (
                    <div className="flex items-start space-x-3 bg-background p-4 rounded-md">
                        <FileText className="h-5 w-5 mt-1 text-primary"/>
                        <p className="font-mono text-left flex-1 break-words">{decodedText || 'Сообщение не найдено'}</p>
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
