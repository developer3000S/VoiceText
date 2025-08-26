"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { encodeTextAction } from '@/app/actions';
import { Loader2, PlayCircle, Volume2 } from 'lucide-react';
import { playDtmfSequence } from '@/lib/dtmf';

const FormSchema = z.object({
  text: z.string().min(1, "Сообщение не может быть пустым.").max(100, "Сообщение слишком длинное."),
});

export function EncoderTab() {
  const [isLoading, setIsLoading] = useState(false);
  const [dtmfSequence, setDtmfSequence] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: { text: '' },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setIsLoading(true);
    setDtmfSequence(null);
    const result = await encodeTextAction({ text: data.text });
    setIsLoading(false);

    if (result.success) {
      setDtmfSequence(result.data.dtmfSequence);
    } else {
      toast({
        variant: 'destructive',
        title: 'Ошибка кодирования',
        description: result.error,
      });
    }
  }

  async function handlePlay() {
    if (!dtmfSequence) return;
    setIsPlaying(true);
    try {
      await playDtmfSequence(dtmfSequence);
    } catch (error) {
      console.error("Playback error:", error);
      toast({
        variant: "destructive",
        title: "Ошибка воспроизведения",
        description: "Не удалось воспроизвести тоны. Убедитесь, что ваш браузер поддерживает Web Audio.",
      });
    }
    setIsPlaying(false);
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
                  <FormLabel>Ваше сообщение</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Введите ваше секретное сообщение..." {...field} />
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
              <Button onClick={handlePlay} disabled={isPlaying} className="w-full" variant="secondary">
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
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
