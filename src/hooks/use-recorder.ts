"use client";

import { useState, useRef, useCallback } from 'react';
import { useToast } from './use-toast';
import { Capacitor } from '@capacitor/core';
// Do not import VoiceRecorder statically, as it causes build issues.

export const useRecorder = () => {
    const { toast } = useToast();
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    
    // Promise resolvers for when the recording is stopped
    let stopResolver: ((blob: Blob) => void) | null = null;
    
    const requestPermissions = async (): Promise<boolean> => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            toast({
              variant: 'destructive',
              title: 'Функция не поддерживается',
              description: 'Ваше устройство или браузер не поддерживают запись аудио.',
            });
            return false;
        }
        
        try {
            // This single call handles permissions for both web and native (via Capacitor)
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // We need to immediately stop the stream so the red "recording" icon doesn't stay on
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch(err) {
            console.error("Permission denied:", err);
            toast({
                variant: "destructive",
                title: "Доступ к микрофону запрещен",
                description: "Пожалуйста, предоставьте разрешение на использование микрофона в настройках вашего браузера или устройства.",
            });
            return false;
        }
    }

    const startRecording = useCallback(async () => {
        const hasPermission = await requestPermissions();
        if (!hasPermission) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data);
            };

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
                stream.getTracks().forEach(track => track.stop()); // Stop the microphone access
                if (stopResolver) {
                    stopResolver(blob);
                    stopResolver = null;
                }
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Error accessing microphone:", err);
            toast({
              variant: "destructive",
              title: "Ошибка микрофона",
              description: "Не удалось начать запись. Попробуйте перезапустить приложение.",
            })
        }
    }, [toast]);

    const stopRecording = useCallback((): Promise<Blob> => {
        return new Promise(async (resolve) => {
             if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                stopResolver = resolve;
                mediaRecorderRef.current.stop();
                setIsRecording(false);
            } else {
                resolve(new Blob()); // Resolve with empty blob if not recording
            }
        })
    }, []);
    
    const getAudioBlob = useCallback((): Blob | null => {
        if(audioChunksRef.current.length > 0) {
            return new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        }
        return null;
    }, [])

    return { isRecording, startRecording, stopRecording, getAudioBlob };
};
