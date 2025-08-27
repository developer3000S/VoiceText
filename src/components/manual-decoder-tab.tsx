
"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Wand2, FileText } from 'lucide-react';
import { useLog } from '@/context/log-context';
import { decodeSequenceFromTones, DecodedResult as DecodedResultV1 } from '@/lib/dtmf-decoder';
import { decodeVtpFromSequence, DecodedResult as DecodedResultV2 } from '@/lib/variant2-decoder';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';

const FormSchema = z.object({
  sequence: z.string().min(1, "Последовательность не может быть пустой."),
  decodingType: z.enum(['v1', 'v2']),
  password: z.string().optional(),
}).refine(data => {
  if (data.decodingType === 'v1') {
    return /^[0-9A-D#*,\s]+$/.test(data.sequence);
  }
  if (data.decodingType === 'v2') {
    return /^[01,\s]+$/.test(data.sequence);
  }
  return true;
}, {
  message: "Неверный формат последовательности.",
  path: ['sequence']
});


export function ManualDecoderTab() {
  const [isLoading, setIsLoading] = useState(false);
  const [decodedResult, setDecodedResult] = useState<DecodedResultV1 | DecodedResultV2 | null>(null);
  const { toast } = useToast();
  const { addLog } = useLog();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: { sequence: '', decodingType: 'v1', password: '' },
  });

  const handleDecodeV1 = (sequence: string, password?: string) => {
    const tones = sequence.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    addLog(`Ручной декодер (V1): запуск для последовательности "${tones.join(',')}"`);
    const result = decodeSequenceFromTones(tones, addLog, password);
    setDecodedResult(result);
     if (result.text !== null) {
        addLog(`Ручное декодирование (V1) успешно. Результат: "${result.text}"`);
      } else if(result.requiresPassword) {
        addLog('Требуется пароль для V1', 'warning');
      } else {
        const errorMsg = result.error || 'Не удалось распознать DTMF тоны или сообщение неполное.';
        toast({ variant: 'destructive', title: 'Ошибка декодирования', description: errorMsg });
        addLog(errorMsg, 'error');
      }
  }

  const handleDecodeV2 = (sequence: string, password?: string) => {
    addLog(`Ручной декодер (V2): запуск для битовой последовательности...`);
    const bits = sequence.replace(/[^01]/g, '').split('').map(b => parseInt(b, 10));
    
    const result = decodeVtpFromSequence(bits, addLog, password);
    setDecodedResult(result);

    if (result.text !== null) {
        addLog(`Ручное декодирование (V2) успешно.`);
      } else if(result.requiresPassword) {
        addLog('Требуется пароль для V2', 'warning');
      } else {
        const errorMsg = result.error || 'Не удалось обработать V2 последовательность.';
        toast({ variant: 'destructive', title: 'Ошибка декодирования V2', description: errorMsg });
        addLog(errorMsg, 'error');
      }
  }

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setIsLoading(true);
    setDecodedResult(null);
    try {
        if (data.decodingType === 'v1') {
            handleDecodeV1(data.sequence, data.password);
        } else {
            handleDecodeV2(data.sequence, data.password);
        }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        variant: 'destructive',
        title: 'Ошибка',
        description: 'Не удалось обработать последовательность.',
      });
      addLog(`Критическая ошибка при ручном декодировании: ${errorMessage}`, 'error');
    }
    setIsLoading(false);
  }

  const currentType = form.watch('decodingType');

  return (
    <Card className="border-0 shadow-none">
      <CardHeader>
        <CardTitle>Ручной декодер</CardTitle>
        <CardDescription>Введите последовательность вручную, чтобы декодировать ее в текст. Полезно для отладки.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            <FormField
              control={form.control}
              name="decodingType"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Выберите тип последовательности</FormLabel>
                   <FormControl>
                    <RadioGroup
                      onValueChange={(value) => {
                          field.onChange(value);
                          form.setValue('sequence', ''); // Clear input on type change
                          form.clearErrors('sequence');
                      }}
                      value={field.value}
                      className="flex space-x-4"
                    >
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <RadioGroupItem value="v1" id="manual_v1" />
                        </FormControl>
                        <Label htmlFor="manual_v1">Вариант 1 (Символы DTMF)</Label>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <RadioGroupItem value="v2" id="manual_v2" />
                        </FormControl>
                         <Label htmlFor="manual_v2">Вариант 2 (Биты 0/1)</Label>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sequence"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Последовательность (без преамбулы, * и #)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={currentType === 'v1' 
                        ? "0,0,D,0,1,D,..." 
                        : "1,0,1,0,1,0,0,0,..."}
                      {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Пароль (если требуется)</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Введите пароль для расшифровки" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Wand2 className="mr-2 h-4 w-4" /> Декодировать
            </Button>
          </form>
        </Form>
        {(isLoading || decodedResult) && (
          <Card className="bg-muted/50 mt-4">
            <CardHeader>
              <CardTitle className="text-lg">Декодированное сообщение</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                  <div className="flex justify-center items-center p-6">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
              ) : decodedResult?.text ? (
                 <div className="flex items-start space-x-3 bg-background p-4 rounded-md">
                    <FileText className="h-5 w-5 mt-1 text-primary"/>
                    <p className="font-mono text-left flex-1 break-words">{decodedResult.text}</p>
                 </div>
              ) : decodedResult?.requiresPassword ? (
                <p className="text-muted-foreground">Сообщение зашифровано. Введите пароль и попробуйте снова.</p>
              ) : (
                 <p className="text-destructive">Не удалось декодировать. {decodedResult?.error || ''}</p>
              )}
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
