"use server";

import { decodeDtmfAudio, DecodeDtmfAudioInput } from "@/ai/flows/dtmf-audio-decoder";
import { dtmfTextEncoder, DtmfTextEncoderInput } from "@/ai/flows/dtmf-text-encoder";

export async function encodeTextAction(input: DtmfTextEncoderInput) {
  console.log("Запуск кодирования текста для:", input.text);
  try {
    const result = await dtmfTextEncoder(input);
    console.log("Кодирование успешно завершено. Результат:", result.dtmfSequence);
    return { success: true, data: result };
  } catch (error) {
    console.error("Произошла ошибка при кодировании текста:", error);
    return { success: false, error: "Не удалось закодировать текст." };
  }
}

export async function decodeAudioAction(input: DecodeDtmfAudioInput) {
  console.log("Запуск декодирования аудио...");
  try {
    const result = await decodeDtmfAudio(input);
    if (result && result.success) {
      console.log("Декодирование успешно завершено. Результат:", result.decodedText);
      return { success: true, data: result };
    } else {
      const errorMessage = result?.decodedText || "Не удалось декодировать аудио.";
      console.warn("Не удалось декодировать аудио. Причина от AI:", errorMessage);
      return { success: false, error: errorMessage };
    }
  } catch (error) {
    console.error("Произошла непредвиденная ошибка при декодировании аудио:", error);
    const errorMessage = error instanceof Error ? error.message : "Произошла непредвиденная ошибка при декодировании.";
    return { success: false, error: errorMessage };
  }
}
