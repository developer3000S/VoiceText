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
import { decodeAudioAction } from '@/app/actions';
import { Loader2, Wand2, FileText } from 'lucide-react';
import { renderDtmfSequenceToAudioBuffer } from '@/lib/dtmf';
import { bufferToWave } from '@/lib/wav';

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(new Error("Read aborted"));
    reader.readAsDataURL(blob);
  });
}

const FormSchema = z.object({
  sequence: z.string().min(1, "Sequence cannot be empty.").regex(/^[0-9#*]+(,\s*[0-9#*]+)*$/, 'Invalid DTMF sequence format. Use numbers, *, # separated by commas.'),
});

export function ManualDecoderTab() {
  const [isLoading, setIsLoading] = useState(false);
  const [decodedText, setDecodedText] = useState<string | null>(null);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: { sequence: '' },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setIsLoading(true);
    setDecodedText(null);
    try {
      const audioBuffer = await renderDtmfSequenceToAudioBuffer(data.sequence);
      const wavBlob = bufferToWave(audioBuffer, audioBuffer.length);
      const audioDataUri = await blobToDataURL(new Blob([wavBlob], { type: 'audio/wav' }));

      const result = await decodeAudioAction({ audioDataUri });
      if (result.success) {
        setDecodedText(result.data.decodedText);
      } else {
        toast({
          variant: 'destructive',
          title: 'Decoding Error',
          description: result.error,
        });
        setDecodedText('Failed to decode sequence.');
      }
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not process sequence.',
      });
      setDecodedText('Error processing sequence.');
    }
    setIsLoading(false);
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader>
        <CardTitle>Manual DTMF Decoder</CardTitle>
        <CardDescription>Enter a DTMF sequence manually to decode it into text. Useful for debugging.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="sequence"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>DTMF Sequence</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 1,2,3,#,*,0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Wand2 className="mr-2 h-4 w-4" /> Decode Sequence
            </Button>
          </form>
        </Form>
        {(isLoading || decodedText) && (
          <Card className="bg-muted/50 mt-4">
            <CardHeader>
              <CardTitle className="text-lg">Decoded Message</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                  <div className="flex justify-center items-center p-6">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
              ) : (
                 <div className="flex items-start space-x-3 bg-background p-4 rounded-md">
                    <FileText className="h-5 w-5 mt-1 text-primary"/>
                    <p className="font-mono text-left flex-1 break-words">{decodedText || "No text decoded."}</p>
                 </div>
              )}
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
