
"use client";

import { useState, useCallback, useRef } from 'react';
import { useToast } from './use-toast';

export const useRecorder = () => {
    const { toast } = useToast();
    const [isRecording, setIsRecording] = useState(false);
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);

    const requestPermission = useCallback(async (): Promise<boolean> => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            setHasPermission(true);
            return true;
        } catch (error) {
            console.error("Ошибка запроса разрешений:", error);
            setHasPermission(false);
            toast({
                variant: "destructive",
                title: "Доступ к микрофону запрещен",
                description: "Пожалуйста, предоставьте доступ к микрофону в настройках вашего устройства или браузера.",
            });
            return false;
        }
    }, [toast]);

    const startRecording = useCallback(async () => {
        const permissionGranted = await requestPermission();
        if (!permissionGranted) {
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setIsRecording(true);
            recordedChunksRef.current = [];
            
            const options = { mimeType: 'audio/webm;codecs=opus' };
            const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported(options.mimeType) ? options : undefined);

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
                    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
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

    return { isRecording, startRecording, stopRecording, hasPermission, requestPermission };
};
