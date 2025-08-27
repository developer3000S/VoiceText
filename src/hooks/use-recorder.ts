
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
            // Запрос разрешения заставит браузер или WebView показать диалог пользователю
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Нам не нужно держать стрим открытым, только получить разрешение
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            console.error("Ошибка запроса разрешений:", error);
            const err = error as DOMException;
            toast({
                variant: "destructive",
                title: "Доступ к микрофону запрещен",
                description: `Пожалуйста, предоставьте доступ к микрофону в настройках. Ошибка: ${err.message}`,
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
            
            // Пытаемся указать mimeType, чтобы получить WAV, если возможно
            const options = { mimeType: 'audio/wav' };
            let mediaRecorder;
            try {
                mediaRecorder = new MediaRecorder(stream, options);
            } catch (e) {
                console.warn('audio/wav не поддерживается, используем формат по умолчанию.');
                mediaRecorder = new MediaRecorder(stream);
            }

            mediaRecorderRef.current = mediaRecorder;
            recordedChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start();
            setIsRecording(true);
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
        return new Promise((resolve) => {
            if (!mediaRecorderRef.current || !isRecording) {
                resolve(null);
                return;
            }

            mediaRecorderRef.current.onstop = () => {
                const recordedBlob = new Blob(recordedChunksRef.current, {
                    type: mediaRecorderRef.current?.mimeType || 'audio/wav'
                });
                setIsRecording(false);
                mediaRecorderRef.current = null;
                resolve(recordedBlob);
            };

            if (mediaRecorderRef.current.state === "recording") {
                 mediaRecorderRef.current.stop();
            }
        });
    }, [isRecording]);

    return { isRecording, startRecording, stopRecording, requestPermission };
};
