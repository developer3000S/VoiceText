"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { decodeAudioAction } from '@/app/actions';
import { Loader2, Mic, Square, FileText, Upload } from 'lucide-react';
import { useRecorder } from '@/hooks/use-recorder';

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(new Error("Чтение прервано"));
    reader.readAsDataURL(blob);
  });
}

export function DecoderTab() {
  const [isLoading, setIsLoading] = useState(false);
  const [decodedText, setDecodedText] = useState<string | null>(null);
  const { toast } = useToast();
  const { isRecording, audioBlob, startRecording, stopRecording } = useRecorder();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDecode = useCallback(async (blob: Blob) => {
    setIsLoading(true);
    setDecodedText(null);
    try {
      const audioDataUri = await blobToDataURL(blob);
      const result = await decodeAudioAction({ audioDataUri });
      if (result.success) {
        setDecodedText(result.data.decodedText);
      } else {
        toast({
          variant: 'destructive',
          title: 'Ошибка декодирования',
          description: result.error,
        });
        setDecodedText(null);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Ошибка',
        description: 'Не удалось обработать аудиофайл.',
      });
      setDecodedText(null);
    }
    setIsLoading(false);
  }, [toast]);
  
  useEffect(() => {
    if (audioBlob) {
      handleDecode(audioBlob);
    }
  }, [audioBlob, handleDecode]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleDecode(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Card className="border-0 shadow-none">
      <CardHeader>
        <CardTitle>Декодер DTMF в текст</CardTitle>
        <CardDescription>Запишите или загрузите аудио с DTMF-тонами для декодирования в текст.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Button onClick={isRecording ? stopRecording : startRecording} className="w-full" disabled={isLoading}>
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
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="audio/*"
          />
        </div>
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
