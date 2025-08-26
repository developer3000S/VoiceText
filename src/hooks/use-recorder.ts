"use client";

import { useState, useRef, useCallback } from 'react';
import { useToast } from './use-toast';

export const useRecorder = () => {
    const { toast } = useToast();
    const [isRecording, setIsRecording] = useState(false);
    
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    let stopResolver: ((blob: Blob) => void) | null = null;
    
    const startRecording = useCallback(async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            toast({
              variant: 'destructive',
              title: 'Функция не поддерживается',
              description: 'Ваше устройство или браузер не поддерживают запись аудио.',
            });
            return;
        }
        try {
            // Запрашиваем доступ к микрофону. На Android это вызовет системный запрос разрешений.
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data);
            };

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
                // Останавливаем все треки, чтобы индикатор записи погас
                stream.getTracks().forEach(track => track.stop());
                if (stopResolver) {
                    stopResolver(blob);
                    stopResolver = null;
                }
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Error accessing microphone:", err);
            let description = "Не удалось начать запись. Проверьте разрешения для браузера или приложения.";
            if (err instanceof DOMException && err.name === 'NotAllowedError') {
                description = "Вы не предоставили доступ к микрофону. Пожалуйста, разрешите доступ в настройках."
            }
            toast({
              variant: "destructive",
              title: "Ошибка микрофона",
              description: description,
            })
        }
    }, [toast]);
    
    const stopRecording = useCallback((): Promise<Blob> => {
        return new Promise((resolve) => {
             if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                stopResolver = resolve;
                mediaRecorderRef.current.stop();
                setIsRecording(false);
            } else {
                // Если запись уже была остановлена, возвращаем пустой Blob
                resolve(new Blob());
            }
        })
    }, []);
    
    const getAudioBlob = useCallback((): Blob | null => {
        if(audioChunksRef.current.length > 0) {
            return new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
        }
        return null;
    }, [])

    return { isRecording, startRecording, stopRecording, getAudioBlob };
};
