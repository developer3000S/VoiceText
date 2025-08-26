"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { decodeAudioAction } from '@/app/actions';
import { Loader2, Mic, Square, FileText } from 'lucide-react';
import { useRecorder } from '@/hooks/use-recorder';

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(new Error("Read aborted"));
    reader.readAsDataURL(blob);
  });
}

export function DecoderTab() {
  const [isLoading, setIsLoading] = useState(false);
  const [decodedText, setDecodedText] = useState<string | null>(null);
  const { toast } = useToast();
  const { isRecording, audioBlob, startRecording, stopRecording } = useRecorder();

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
          title: 'Decoding Error',
          description: result.error,
        });
        setDecodedText('Failed to decode.');
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not process audio file.',
      });
      setDecodedText('Error processing audio.');
    }
    setIsLoading(false);
  }, [toast]);
  
  useEffect(() => {
    if (audioBlob) {
      handleDecode(audioBlob);
    }
  }, [audioBlob, handleDecode]);

  return (
    <Card className="border-0 shadow-none">
      <CardHeader>
        <CardTitle>DTMF to Text Decoder</CardTitle>
        <CardDescription>Record DTMF tones from your microphone and decode them into text.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        <Button onClick={isRecording ? stopRecording : startRecording} className="w-full" disabled={isLoading}>
          {isRecording ? (
            <>
              <Square className="mr-2 h-4 w-4 animate-pulse fill-current" /> Stop Recording
            </>
          ) : (
            <>
              <Mic className="mr-2 h-4 w-4" /> Start Recording
            </>
          )}
        </Button>
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
