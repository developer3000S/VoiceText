
"use client";

import { useState, useCallback, useRef } from 'react';
import { useToast } from './use-toast';

export const useRecorder = () => {
    const { toast } = useToast();
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);

    const requestPermission = useCallback(async (): Promise<boolean> => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Stop the tracks immediately after getting permission to avoid leaving the mic on.
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            console.error("Ошибка запроса разрешений:", error);
            toast({
                variant: "destructive",
                title: "Доступ к микрофону запрещен",
                description: "Пожалуйста, предоставьте доступ к микрофону в настройках вашего устройства или браузера.",
            });
            return false;
        }
    }, [toast]);

    const startRecording = useCallback(async () => {
        const hasPermission = await requestPermission();
        if (!hasPermission) {
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setIsRecording(true);
            recordedChunksRef.current = [];
            
            // Explicitly try to record in WAV format if possible, otherwise fall back.
            const mimeTypes = ['audio/wav', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus'];
            const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
            
            const options = supportedMimeType ? { mimeType: supportedMimeType } : undefined;
            const recorder = new MediaRecorder(stream, options);

            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunksRef.current.push(event.data);
                }
            };
            
            recorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
            };
            
            recorder.start();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("Ошибка начала записи:", errorMessage);
            toast({
              variant: "destructive",
              title: "Ошибка записи",
              description: `Не удалось начать запись: ${errorMessage}`,
            });
            setIsRecording(false);
        }
    }, [requestPermission, toast]);
    
    const stopRecording = useCallback(async (): Promise<Blob | null> => {
        if (!mediaRecorderRef.current || !isRecording) {
             return null;
        }

        return new Promise((resolve) => {
            if (mediaRecorderRef.current) {
                mediaRecorderRef.current.onstop = () => {
                    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/wav';
                    const blob = new Blob(recordedChunksRef.current, { type: mimeType });
                    recordedChunksRef.current = [];
                    setIsRecording(false);
                    mediaRecorderRef.current = null;
                    resolve(blob);
                };

                mediaRecorderRef.current.stop();
            }
        });
    }, [isRecording]);

    return { isRecording, startRecording, stopRecording, requestPermission };
};
