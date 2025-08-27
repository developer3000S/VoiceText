
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
import { decodeSequenceFromTones } from '@/lib/dtmf-decoder';
import { decodeVtpFromAudio } from '@/lib/variant2-decoder';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';


const FormSchemaV1 = z.object({
  sequence: z.string().min(1, "Последовательность не может быть пустой.").regex(/^[0-9#*,\s]+$/, 'Неверный формат последовательности DTMF. Используйте цифры, *, #, разделенные запятыми.'),
  decodingType: z.literal('v1'),
});

const FormSchemaV2 = z.object({
  sequence: z.string().min(1, "Последовательность не может быть пустой.").regex(/^[01,\s]+$/, 'Неверный формат битовой последовательности. Используйте только 0 и 1, разделенные запятыми или без них.'),
  decodingType: z.literal('v2'),
});

const FormSchema = z.discriminatedUnion("decodingType", [FormSchemaV1, FormSchemaV2]);

function bitsToBytes(bits: number[]): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
        let byte = 0;
        for (let j = 0; j < 8; j++) {
            const bitIndex = i * 8 + j;
            if (bitIndex < bits.length && bits[bitIndex] === 1) {
                byte |= (1 << j);
            }
        }
        bytes[i] = byte;
    }
    return bytes;
}

function crc8(data: Uint8Array): number {
    let crc = 0x00;
    const poly = 0x07;
    for (const byte of data) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) {
            if (crc & 0x80) {
                crc = (crc << 1) ^ poly;
            } else {
                crc <<= 1;
            }
        }
    }
    return crc & 0xFF;
}


export function ManualDecoderTab() {
  const [isLoading, setIsLoading] = useState(false);
  const [decodedText, setDecodedText] = useState<string | null>(null);
  const [decodingType, setDecodingType] = useState<'v1' | 'v2'>('v1');
  const { toast } = useToast();
  const { addLog } = useLog();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: { sequence: '', decodingType: 'v1' },
  });

  const handleDecodeV1 = (sequence: string) => {
    const tones = sequence.split(',').map(s => s.trim()).filter(Boolean);
    addLog(`Ручной декодер (V1): запуск для последовательности "${tones.join(',')}"`);
    const result = decodeSequenceFromTones(tones, addLog);
     if (result.text !== null) {
        setDecodedText(result.text);
        addLog(`Ручное декодирование (V1) успешно. Результат: "${result.text}"`);
      } else {
        const errorMsg = result.error || 'Не удалось распознать DTMF тоны или сообщение неполное.';
        toast({ variant: 'destructive', title: 'Ошибка декодирования', description: errorMsg });
        setDecodedText(null);
        addLog(errorMsg, 'error');
      }
  }

  const handleDecodeV2 = (sequence: string) => {
    addLog(`Ручной декодер (V2): запуск для битовой последовательности...`);
    
    // Allow sequence with or without commas
    const cleanedSequence = sequence.replace(/[^01]/g, '');
    const bits = cleanedSequence.split('').map(bit => parseInt(bit, 10));

    if(bits.length < 16 + 16 + 8) { // Preamble + Header + CRC
        addLog('Последовательность слишком короткая для V2.', 'error');
        toast({ variant: 'destructive', title: 'Ошибка', description: 'Последовательность слишком короткая.'});
        return;
    }

    const preamble = bits.slice(0, 16);
    const headerBits = bits.slice(16, 16 + 16);
    
    const headerBytes = bitsToBytes(headerBits);
    const dataLength = headerBytes[0];
    const packetType = headerBytes[1];

    if (32 + dataLength * 8 + 8 > bits.length) {
        addLog(`Ожидаемая длина (${32 + dataLength * 8 + 8}) превышает фактическую (${bits.length}).`, 'error');
        toast({ variant: 'destructive', title: 'Ошибка', description: 'Неполные данные в последовательности.'});
        return;
    }

    const dataBits = bits.slice(32, 32 + dataLength * 8);
    const dataBytes = bitsToBytes(dataBits);

    const crcBits = bits.slice(32 + dataLength * 8, 32 + dataLength * 8 + 8);
    const receivedCrc = bitsToBytes(crcBits)[0];

    const dataToVerify = new Uint8Array([...headerBytes, ...dataBytes]);
    const calculatedCrc = crc8(dataToVerify);

    if (receivedCrc !== calculatedCrc) {
        const err = `Ошибка CRC! Ожидалось 0x${calculatedCrc.toString(16)}, получено 0x${receivedCrc.toString(16)}. Данные повреждены.`;
        addLog(err, 'error');
        toast({ variant: 'destructive', title: 'Ошибка CRC', description: err });
        setDecodedText(null);
        return;
    }
    
    const text = new TextDecoder('utf-8').decode(dataBytes);
    setDecodedText(text);
    addLog(`Ручное декодирование (V2) успешно. Результат: "${text}"`);
  }

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setIsLoading(true);
    setDecodedText(null);
    try {
        if (data.decodingType === 'v1') {
            handleDecodeV1(data.sequence);
        } else {
            handleDecodeV2(data.sequence);
        }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        variant: 'destructive',
        title: 'Ошибка',
        description: 'Не удалось обработать последовательность.',
      });
      setDecodedText(null);
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
                          setDecodingType(value as 'v1' | 'v2');
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
                        <Label htmlFor="manual_v1">Вариант 1 (DTMF)</Label>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <RadioGroupItem value="v2" id="manual_v2" />
                        </FormControl>
                         <Label htmlFor="manual_v2">Вариант 2 (Биты)</Label>
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
                  <FormLabel>Последовательность</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={currentType === 'v1' 
                        ? "*,1,6,3,..." 
                        : "1,0,1,0,1,0,1,0,..."}
                      {...field} />
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
