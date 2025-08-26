"use client";

import { useState, useRef, useCallback } from 'react';
import { useToast } from './use-toast';
import { Capacitor } from '@capacitor/core';
import { Permissions } from '@capacitor/core';

export const useRecorder = () => {
    const { toast } = useToast();
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    
    // Promise resolvers for when the recording is stopped
    let stopResolver: ((blob: Blob) => void) | null = null;
    
    const requestNativePermissions = async (): Promise<boolean> => {
        try {
            const result = await Permissions.request({ name: 'microphone' });
            if (result.state === 'granted') {
                return true;
            }
            if (result.state === 'denied') {
                toast({
                    variant: "destructive",
                    title: "Доступ к микрофону запрещен",
                    description: "Пожалуйста, предоставьте разрешение в настройках вашего устройства.",
                });
            }
            return false;
        } catch(e) {
            // This can happen if the permissions plugin is not implemented on the platform.
            console.error("Could not request microphone permissions", e);
            // Fallback to old method for web or if plugin fails
            return await requestWebPermissions();
        }
    };
    
    const requestWebPermissions = async (): Promise<boolean> => {
         try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    
    const requestPermissions = async (): Promise<boolean> => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            toast({
              variant: 'destructive',
              title: 'Функция не поддерживается',
              description: 'Ваше устройство или браузер не поддерживают запись аудио.',
            });
            return false;
        }
        
        if (Capacitor.isNativePlatform()) {
            return await requestNativePermissions();
        } else {
            return await requestWebPermissions();
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
