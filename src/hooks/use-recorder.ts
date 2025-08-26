"use client";

import { useState, useRef, useCallback } from 'react';
import { useToast } from './use-toast';

export const useRecorder = () => {
    const { toast } = useToast();
    const [isRecording, setIsRecording] = useState(false);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const startRecording = useCallback(async () => {
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
                    setAudioBlob(blob);
                    stream.getTracks().forEach(track => track.stop()); // Stop the microphone access
                };

                mediaRecorderRef.current.start();
                setIsRecording(true);
                setAudioBlob(null);
            } catch (err) {
                console.error("Error accessing microphone:", err);
                toast({
                  variant: "destructive",
                  title: "Microphone Error",
                  description: "Could not access microphone. Please check your browser permissions.",
                })
            }
        } else {
           toast({
              variant: "destructive",
              title: "Unsupported Browser",
              description: "Your browser does not support audio recording.",
            })
        }
    }, [toast]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    }, []);

    return { isRecording, audioBlob, startRecording, stopRecording };
};
