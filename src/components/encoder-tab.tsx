
"use client";

import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlayCircle, Volume2, Download, CircleDashed, PlusCircle } from 'lucide-react';
import { playDtmfSequence, renderDtmfSequenceToAudioBuffer, textToDtmfSequence } from '@/lib/dtmf';
import { bufferToWave } from '@/lib/wav';
import * as Tone from 'tone';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLog } from '@/context/log-context';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';


const FormSchema = z.object({
  text: z.string().min(1, "Сообщение не может быть пустым.").max(100, "Сообще-ние слишком длинное."),
});

const templates = ["Привет!", "Пока!", "Как дела?"];

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error("Failed to convert blob to base64"));
      }
    };
    reader.readAsDataURL(blob);
  });
};


export function EncoderTab() {
  const [isLoading, setIsLoading] = useState(false);
  const [dtmfSequence, setDtmfSequence] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const { toast } = useToast();
  const { addLog } = useLog();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: { text: '' },
  });
  
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  const startAudioContext = async () => {
    if (Tone.context.state !== 'running') {
      await Tone.start();
      addLog('Аудиоконтекст успешно инициализирован.');
    }
  };


  async function onSubmit(data: z.infer<typeof FormSchema>) {
    await startAudioContext(); 
    setIsLoading(true);
    setDtmfSequence(null);
    
    try {
      const sequence = textToDtmfSequence(data.text, addLog);
      setDtmfSequence(sequence);
    } catch (error) {
       const errorMessage = error instanceof Error ? error.message : String(error);
       toast({
        variant: 'destructive',
        title: 'Ошибка кодирования',
        description: errorMessage,
      });
      addLog(`Ошибка кодирования: ${errorMessage}`, 'error');
    }

    setIsLoading(false);
  }

  async function handlePlay() {
    if (!dtmfSequence) return;
    
    await startAudioContext();
    
    setIsPlaying(true);
    addLog('Воспроизведение DTMF последовательности...');
    try {
      await playDtmfSequence(dtmfSequence);
      addLog('Воспроизведение завершено.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Playback error:", error);
      toast({
        variant: "destructive",
        title: "Ошибка воспроизведения",
        description: "Не удалось воспроизвести тоны.",
      });
      addLog(`Ошибка воспроизведения: ${errorMessage}`, 'error');
    }
    setIsPlaying(false);
  }

  async function handleSaveNative(wavBlob: Blob) {
    addLog('Нативная платформа обнаружена. Попытка сохранить в файловую систему.');
    const fileName = `dtmf_sequence_${Date.now()}.wav`;
    
    try {
        const base64Data = await blobToBase64(wavBlob);

        // 1. Проверить разрешения
        let permStatus = await Filesystem.checkPermissions();
        addLog(`Статус разрешений на запись: ${permStatus.publicStorage}`);

        if (permStatus.publicStorage !== 'granted') {
            addLog('Разрешение не предоставлено. Запрашиваю...');
            permStatus = await Filesystem.requestPermissions();
        }

        if (permStatus.publicStorage === 'granted') {
             // 2. Сохранить в общую папку Download
            const result = await Filesystem.writeFile({
                path: fileName,
                data: base64Data,
                directory: Directory.Downloads,
            });
            addLog(`Файл успешно сохранен в папку Download. Путь: ${result.uri}`);
            toast({ title: "Успешно", description: `Файл сохранен в Download/${fileName}` });
        } else {
            // 3. Фоллбэк: сохранить во внутреннее хранилище
            addLog('Разрешение на запись в общую папку не получено. Сохраняю во внутреннее хранилище.', 'warning');
             const result = await Filesystem.writeFile({
                path: fileName,
                data: base64Data,
                directory: Directory.Data, // Внутреннее хранилище, доступно только приложению
            });
            addLog(`Файл сохранен во внутреннее хранилище. Путь: ${result.uri}`);
            toast({ variant: "default", title: "Сохранено", description: `Файл сохранен во внутреннем хранилище.` });
        }

    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        addLog(`Ошибка сохранения файла на устройстве: ${errorMsg}`, 'error');
        toast({ variant: 'destructive', title: 'Ошибка сохранения', description: errorMsg });
    }
}


  async function handleSave() {
    if (!dtmfSequence) return;
    setIsSaving(true);
    addLog('Сохранение аудиофайла...');

    try {
      const audioBuffer = await renderDtmfSequenceToAudioBuffer(dtmfSequence);
      const wavBlob = bufferToWave(audioBuffer, audioBuffer.length);
      
      if (isNative) {
        await handleSaveNative(wavBlob);
      } else {
        // Стандартный веб-метод для скачивания
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dtmf_sequence_${Date.now()}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addLog('Файл успешно сохранен (веб-метод).');
      }

    } catch (error) {
       const errorMessage = error instanceof Error ? error.message : String(error);
       console.error("Save error:", error);
       toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Не удалось сгенерировать аудиофайл.",
      });
      addLog(`Ошибка генерации файла: ${errorMessage}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader>
        <CardTitle>Кодировщик текста в DTMF</CardTitle>
        <CardDescription>Преобразуйте ваше текстовое сообщение в последовательность воспроизводимых тонов DTMF.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="text"
              render={({ field }) => (
                <FormItem>
                  <div className="flex justify-between items-center">
                    <FormLabel>Ваше сообщение</FormLabel>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={startAudioContext}>
                          <PlusCircle className="mr-2 h-4 w-4" />
                          Шаблоны
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {templates.map((template, index) => (
                          <DropdownMenuItem
                            key={index}
                            onSelect={() => {
                              form.setValue('text', template);
                              addLog(`Вставлен шаблон: "${template}"`);
                            }}
                          >
                            {template}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <FormControl>
                    <Textarea placeholder="Введите ваше секретное сообщение..." {...field} onClick={startAudioContext} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Закодировать сообщение
            </Button>
          </form>
        </Form>
        {dtmfSequence && (
          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle className="text-lg">Закодированная последовательность</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="font-mono text-sm break-all bg-background p-3 rounded-md">{dtmfSequence}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Button onClick={handlePlay} disabled={isPlaying || isSaving} className="w-full" variant="secondary">
                  {isPlaying ? (
                    <>
                      <Volume2 className="mr-2 h-4 w-4 animate-pulse" /> Воспроизведение...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="mr-2 h-4 w-4" /> Воспроизвести тоны
                    </>
                  )}
                </Button>
                <Button 
                  onClick={handleSave} 
                  disabled={isSaving || isPlaying} 
                  className="w-full" 
                  variant="outline"
                >
                 {isSaving ? (
                   <>
                     <CircleDashed className="mr-2 h-4 w-4 animate-spin" /> Сохранение...
                   </>
                 ) : (
                   <>
                     <Download className="mr-2 h-4 w-4" /> Сохранить файл
                   </>
                 )}
               </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
