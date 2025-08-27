
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
import { Loader2, PlayCircle, Volume2, Download, CircleDashed, PlusCircle, LockKeyhole } from 'lucide-react';
import { playDtmfSequence, renderDtmfSequenceToAudioBuffer, textToDtmfSequence } from '@/lib/dtmf';
import { textToVtpPacket } from '@/lib/variant2-encoder';
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
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Toast as CapacitorToast } from '@capacitor/toast';
import { Input } from './ui/input';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';


const FormSchema = z.object({
  text: z.string().min(1, "Сообщение не может быть пустым.").max(255, "Сообщение слишком длинное (макс. 255 байт)."),
  password: z.string().optional(),
  encodingType: z.enum(['v1', 'v2']),
});

const templates = ["Привет!", "Как дела?", "Встречаемся в 15:00."];

export function EncoderTab() {
  const [isLoading, setIsLoading] = useState(false);
  const [generatedSequence, setGeneratedSequence] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const { toast } = useToast();
  const { addLog } = useLog();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: { text: '', password: '', encodingType: 'v1' },
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
    setGeneratedSequence(null);
    
    try {
      let sequence: string;
      if (data.encodingType === 'v1') {
        sequence = textToDtmfSequence(data.text, addLog, data.password);
      } else {
        sequence = textToVtpPacket(data.text, addLog);
      }
      setGeneratedSequence(sequence);
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
    if (!generatedSequence) return;
    
    await startAudioContext();
    
    setIsPlaying(true);
    addLog('Воспроизведение последовательности...');
    try {
      await playDtmfSequence(generatedSequence);
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
    addLog('Запуск сохранения файла на мобильном устройстве...');
    try {
      const reader = new FileReader();
      reader.readAsDataURL(wavBlob);
      reader.onloadend = async () => {
        const base64Data = reader.result as string;
        const fileName = `sequence_${Date.now()}.wav`;

        try {
            const result = await Filesystem.writeFile({
                path: fileName,
                data: base64Data,
                directory: Directory.Download, 
            });
            addLog(`Файл успешно сохранен в папку Download: ${result.uri}`);
            await CapacitorToast.show({
                text: `Файл сохранен: ${fileName}`,
                duration: 'long'
            });
        } catch (e) {
            addLog(`Не удалось сохранить в папку Download, пробуем внутреннее хранилище. Ошибка: ${(e as Error).message}`, 'warning');
            const result = await Filesystem.writeFile({
                path: fileName,
                data: base64Data,
                directory: Directory.Data,
            });
            addLog(`Файл сохранен во внутреннюю папку приложения: ${result.uri}`);
            await CapacitorToast.show({
                text: 'Файл сохранен во внутреннюю папку',
                duration: 'long'
            });
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Native save error:", error);
      addLog(`Ошибка сохранения файла на устройстве: ${errorMessage}`, 'error');
      toast({
          variant: "destructive",
          title: "Ошибка сохранения",
          description: "Не удалось сохранить файл на устройстве.",
      });
    }
  }

  async function handleSaveWeb(wavBlob: Blob) {
      addLog('Запуск сохранения файла в браузере...');
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sequence_${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addLog('Файл успешно сохранен (веб-метод).');
  }

  async function handleSave() {
    if (!generatedSequence) return;
    setIsSaving(true);
    
    try {
      const audioBuffer = await renderDtmfSequenceToAudioBuffer(generatedSequence);
      const wavBlob = bufferToWave(audioBuffer, audioBuffer.length);
      
      if (isNative) {
        await handleSaveNative(wavBlob);
      } else {
        await handleSaveWeb(wavBlob);
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
        <CardTitle>Кодировщик текста в аудио</CardTitle>
        <CardDescription>Преобразуйте ваше текстовое сообщение в последовательность аудиотонов.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="encodingType"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Выберите вариант кодирования</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="grid grid-cols-1 md:grid-cols-2 gap-4"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="v1" />
                        </FormControl>
                        <FormLabel className="font-normal flex flex-col">
                          <span>Вариант 1: DTMF</span>
                          <span className="text-xs text-muted-foreground">Быстро, с шифрованием.</span>
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="v2" />
                        </FormControl>
                         <FormLabel className="font-normal flex flex-col">
                          <span>Вариант 2: VTP (DTMF)</span>
                           <span className="text-xs text-muted-foreground">Надежно, с проверкой ошибок.</span>
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
            {form.watch('encodingType') === 'v1' && (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Пароль (только для Варианта 1)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input type="password" placeholder="Введите пароль для шифрования" {...field} className="pl-9"/>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Закодировать сообщение
            </Button>
          </form>
        </Form>
        {generatedSequence && (
          <Card className="bg-muted/50 mt-6">
            <CardHeader>
              <CardTitle className="text-lg">Закодированная последовательность</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="font-mono text-sm break-all bg-background p-3 rounded-md">
                {generatedSequence}
              </p>
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
