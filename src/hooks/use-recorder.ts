
"use client";

import { useState, useCallback, useRef } from 'react';
import { useToast } from './use-toast';
import { Capacitor } from '@capacitor/core';

export const useRecorder = () => {
    const { toast } = useToast();
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);

    const checkAndRequestPermissions = useCallback(async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                // On native, permissions are requested via the manifest and at runtime by the WebView.
                // We can try to trigger a request to be sure.
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                // We don't need the stream, just to trigger the permission prompt.
                stream.getTracks().forEach(track => track.stop());
                return true;
            } catch (error) {
                console.error("Permission error on native:", error);
                 toast({
                    variant: "destructive",
                    title: "Доступ к микрофону запрещен",
                    description: "Пожалуйста, предоставьте доступ к микрофону в настройках вашего устройства.",
                });
                return false;
            }
        }
        
        // For web
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            console.error("Permission error on web:", error);
            toast({
                variant: "destructive",
                title: "Доступ к микрофону запрещен",
                description: "Пожалуйста, предоставьте доступ к микрофону в настройках вашего браузера.",
            });
            return false;
        }
    }, [toast]);

    const startRecording = useCallback(async () => {
        const hasPermission = await checkAndRequestPermissions();
        if (!hasPermission) {
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setIsRecording(true);
            recordedChunksRef.current = [];
            const recorder = new MediaRecorder(stream);
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
            console.error("Error starting recording:", errorMessage);
            toast({
              variant: "destructive",
              title: "Ошибка записи",
              description: `Не удалось начать запись: ${errorMessage}`,
            });
            setIsRecording(false);
        }
    }, [toast, checkAndRequestPermissions]);
    
    const stopRecording = useCallback(async (): Promise<Blob> => {
        return new Promise((resolve) => {
            if (!mediaRecorderRef.current || !isRecording) {
                 resolve(new Blob());
                 return;
            }

            mediaRecorderRef.current.onstop = () => {
                const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
                const blob = new Blob(recordedChunksRef.current, { type: mimeType });
                recordedChunksRef.current = [];
                setIsRecording(false);
                mediaRecorderRef.current = null;
                resolve(blob);
            };

            mediaRecorderRef.current.stop();
        });
    }, [isRecording]);

    return { isRecording, startRecording, stopRecording };
};
