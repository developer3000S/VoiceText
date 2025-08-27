
"use client";

import { useState, useCallback, useRef } from 'react';
import { useToast } from './use-toast';
import { VoiceRecorder } from 'capacitor-voice-recorder';
import { Capacitor } from '@capacitor/core';

export const useRecorder = () => {
    const { toast } = useToast();
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    // --- Native (Capacitor) Implementation ---

    const checkNativePermission = async (): Promise<boolean> => {
        try {
            const { value: status } = await VoiceRecorder.getAudioRecordingPermissionStatus();
            return status === 'granted';
        } catch (error) {
            console.error("Ошибка проверки разрешений (native):", error);
            return false;
        }
    };
    
    const requestNativePermission = async (): Promise<boolean> => {
        try {
            const result = await VoiceRecorder.requestAudioRecordingPermission();
            if (!result) {
                 toast({ variant: "destructive", title: "Доступ к микрофону запрещен" });
            }
            return result;
        } catch (error) {
            console.error("Ошибка запроса разрешений (native):", error);
            return false;
        }
    };

    const startNativeRecording = async () => {
        let hasPermission = await checkNativePermission();
        if (!hasPermission) {
            hasPermission = await requestNativePermission();
        }
        if (!hasPermission) return;

        try {
            await VoiceRecorder.startRecording();
            setIsRecording(true);
        } catch (error) {
            toast({ variant: "destructive", title: "Ошибка записи", description: `Не удалось начать запись: ${(error as Error).message}` });
        }
    };

    const stopNativeRecording = async (): Promise<{ blob: Blob, audioUrl: string } | null> => {
        try {
            const result = await VoiceRecorder.stopRecording();
            if (result.value && result.value.recordDataBase64) {
                 const base64Sound = result.value.recordDataBase64;
                 const mimeType = result.value.mimeType || 'audio/wav';
                 const blob = new Blob(
                    [Uint8Array.from(atob(base64Sound), c => c.charCodeAt(0))], 
                    { type: mimeType }
                 );
                 const audioUrl = URL.createObjectURL(blob);
                 return { blob, audioUrl };
            }
            return null;
        } finally {
            setIsRecording(false);
        }
    };

    // --- Web API Implementation ---

    const startWebRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/wav' });
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data);
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);

        } catch (err) {
            console.error("Ошибка запроса разрешений (web):", err);
            toast({ variant: 'destructive', title: 'Ошибка доступа', description: 'Не удалось получить доступ к микрофону.'});
        }
    };

    const stopWebRecording = async (): Promise<{ blob: Blob, audioUrl: string } | null> => {
        return new Promise(resolve => {
            if (!mediaRecorderRef.current) {
                resolve(null);
                return;
            }
            
            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                const audioUrl = URL.createObjectURL(blob);
                
                // Stop all tracks to turn off the microphone indicator
                mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());

                resolve({ blob, audioUrl });
            };
            
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        });
    };

    // --- Unified Interface ---

    const startRecording = useCallback(async () => {
        if (Capacitor.isNativePlatform()) {
            await startNativeRecording();
        } else {
            await startWebRecording();
        }
    }, []);
    
    const stopRecording = useCallback(async (): Promise<{ blob: Blob, audioUrl: string } | null> => {
        if (!isRecording) return null;
        
        if (Capacitor.isNativePlatform()) {
            return await stopNativeRecording();
        } else {
            return await stopWebRecording();
        }
    }, [isRecording]);

    return { isRecording, startRecording, stopRecording };
};
