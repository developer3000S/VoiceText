
"use client";

import { useState, useCallback } from 'react';
import { useToast } from './use-toast';
import { VoiceRecorder } from 'capacitor-voice-recorder';

export const useRecorder = () => {
    const { toast } = useToast();
    const [isRecording, setIsRecording] = useState(false);

    const checkPermission = async (): Promise<boolean> => {
        try {
            const { value: status } = await VoiceRecorder.getAudioRecordingPermissionStatus();
            return status === 'granted';
        } catch (error) {
            console.error("Ошибка проверки разрешений:", error);
            toast({
                variant: "destructive",
                title: "Ошибка разрешений",
                description: "Не удалось проверить доступ к микрофону.",
            });
            return false;
        }
    };
    
    const requestPermission = async (): Promise<boolean> => {
        try {
            const permissionGranted = await VoiceRecorder.requestAudioRecordingPermission();
            if (!permissionGranted) {
                toast({
                    variant: "destructive",
                    title: "Доступ к микрофону запрещен",
                    description: "Пожалуйста, предоставьте доступ к микрофону в настройках приложения.",
                });
            }
            return permissionGranted;
        } catch (error) {
            console.error("Ошибка запроса разрешений:", error);
            toast({
                variant: "destructive",
                title: "Ошибка разрешений",
                description: "Не удалось запросить доступ к микрофону.",
            });
            return false;
        }
    };

    const startRecording = useCallback(async () => {
        let hasPermission = await checkPermission();
        if (!hasPermission) {
            hasPermission = await requestPermission();
        }

        if (!hasPermission) {
            return;
        }

        try {
            await VoiceRecorder.startRecording();
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
    }, [toast]);
    
    const stopRecording = useCallback(async (): Promise<{ blob: Blob, audioUrl: string } | null> => {
        if (!isRecording) {
            return null;
        }
        try {
            const result = await VoiceRecorder.stopRecording();
            setIsRecording(false);
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
        } catch (error) {
            console.error("Ошибка остановки записи:", error);
            setIsRecording(false);
            return null;
        }
    }, [isRecording]);

    return { isRecording, startRecording, stopRecording };
};
