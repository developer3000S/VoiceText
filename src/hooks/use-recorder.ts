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
        if (Capacitor.isNativePlatform()) {
             toast({
                variant: "destructive",
                title: "Функция не поддерживается",
                description: "Запись с микрофона на мобильном устройстве временно отключена из-за технических проблем.",
             });
             return false;
        }
        // For web, permission is requested by getUserMedia
        return true;
    }

    const startRecording = useCallback(async () => {
        const hasPermission = await requestPermissions();
        if (!hasPermission) return;

        if (Capacitor.isNativePlatform()) {
            toast({
                variant: "destructive",
                title: "Запись недоступна",
                description: "Не удалось начать запись на этом устройстве.",
            });
            return;
        }

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
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
                  description: "Не удалось получить доступ к микрофону. Проверьте разрешения в браузере или настройках.",
                })
            }
        } else {
           toast({
              variant: "destructive",
              title: "Браузер не поддерживается",
              description: "Ваш браузер не поддерживает запись аудио.",
            })
        }
    }, [toast]);

    const stopRecording = useCallback((): Promise<Blob> => {
        return new Promise(async (resolve) => {
             if (Capacitor.isNativePlatform()) {
                 toast({
                    variant: "destructive",
                    title: "Запись недоступна",
                    description: "Не удалось остановить запись на этом устройстве.",
                 });
                 resolve(new Blob());
                 return;
             }

             if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                stopResolver = resolve;
                mediaRecorderRef.current.stop();
                setIsRecording(false);
            } else {
                resolve(new Blob()); // Resolve with empty blob if not recording
            }
        })
    }, [toast]);
    
    const getAudioBlob = useCallback((): Blob | null => {
        if(audioChunksRef.current.length > 0) {
            return new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        }
        return null;
    }, [])

    return { isRecording, startRecording, stopRecording, getAudioBlob };
};
