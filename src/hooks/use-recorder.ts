"use client";

import { useState, useRef, useCallback } from 'react';
import { useToast } from './use-toast';
import { Capacitor } from '@capacitor/core';

// This function provides a reliable way to request microphone permission on native platforms.
async function requestMicrophonePermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      // On web, the browser will handle the permission prompt automatically with getUserMedia.
      return true;
    }
    
    // For native platforms, we directly ask the user for permission.
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // If we get here, permission was granted. We must stop the track immediately
        // because we are not actually recording yet, just checking permission.
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (error) {
        console.error("Native permission request failed:", error);
        // The user likely denied the permission.
        return false;
    }
}


export const useRecorder = () => {
    const { toast } = useToast();
    const [isRecording, setIsRecording] = useState(false);
    
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const stopPromiseResolver = useRef<{ resolve: (blob: Blob) => void } | null>(null);
    
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
            // First, ensure we have permission. This is the crucial step.
            const hasPermission = await requestMicrophonePermission();

            if (!hasPermission) {
                toast({
                  variant: "destructive",
                  title: "Доступ к микрофону запрещен",
                  description: "Пожалуйста, предоставьте доступ к микрофону в настройках вашего устройства/браузера.",
                });
                return;
            }

            // If permission is granted, get the stream again to start recording.
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
                stream.getTracks().forEach(track => track.stop());
                if (stopPromiseResolver.current) {
                    stopPromiseResolver.current.resolve(blob);
                    stopPromiseResolver.current = null;
                }
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);

        } catch (err) {
            console.error("Error during recording setup:", err);
            let description = "Не удалось начать запись. Проверьте разрешения.";
            if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
                description = "Вы не предоставили доступ к микрофону. Пожалуйста, разрешите доступ в настройках."
            }
            toast({
              variant: "destructive",
              title: "Ошибка микрофона",
              description: description,
            })
            setIsRecording(false);
        }
    }, [toast]);
    
    const stopRecording = useCallback((): Promise<Blob> => {
        return new Promise((resolve) => {
             if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                stopPromiseResolver.current = { resolve };
                mediaRecorderRef.current.stop();
                setIsRecording(false);
            } else {
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
