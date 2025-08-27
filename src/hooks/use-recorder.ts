
"use client";

import { useState, useCallback, useRef } from 'react';
import { useToast } from './use-toast';
import { Capacitor, PermissionState } from '@capacitor/core';
import { Permissions } from '@capacitor/core';

export const useRecorder = () => {
    const { toast } = useToast();
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);

    const checkAndRequestPermission = useCallback(async (): Promise<boolean> => {
        if (!Capacitor.isNativePlatform()) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
                setHasPermission(true);
                return true;
            } catch (error) {
                console.error("Ошибка запроса разрешений в вебе:", error);
                 toast({
                    variant: "destructive",
                    title: "Доступ к микрофону запрещен",
                    description: `Пожалуйста, предоставьте доступ к микрофону в настройках браузера.`,
                });
                setHasPermission(false);
                return false;
            }
        }
        
        try {
            let permissionStatus = await Permissions.query({ name: 'microphone' as any });

            if (permissionStatus.state === 'granted') {
                setHasPermission(true);
                return true;
            }

            if (permissionStatus.state === 'prompt') {
                permissionStatus = await Permissions.request({ name: 'microphone' as any });
            }

            if (permissionStatus.state === 'granted') {
                setHasPermission(true);
                return true;
            }
            
            toast({
                variant: "destructive",
                title: "Доступ к микрофону запрещен",
                description: `Пожалуйста, предоставьте доступ к микрофону в настройках приложения.`,
            });
            setHasPermission(false);
            return false;

        } catch (error) {
            console.error("Ошибка запроса разрешений:", error);
            const err = error as DOMException;
            toast({
                variant: "destructive",
                title: "Ошибка разрешений",
                description: `Не удалось запросить доступ к микрофону. ${err.message}`,
            });
            setHasPermission(false);
            return false;
        }
    }, [toast]);

    const startRecording = useCallback(async () => {
        const permissionGranted = await checkAndRequestPermission();
        if (!permissionGranted) {
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
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
    }, [checkAndRequestPermission, toast]);
    
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

    return { isRecording, startRecording, stopRecording, hasPermission };
};
