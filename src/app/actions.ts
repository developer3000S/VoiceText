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
    if (result.success) {
      console.log("Декодирование успешно завершено. Результат:", result.decodedText);
      return { success: true, data: result };
    } else {
      console.warn("Не удалось декодировать аудио. Причина от AI:", result.decodedText);
      return { success: false, error: "Не удалось декодировать аудио." };
    }
  } catch (error) {
    console.error("Произошла непредвиденная ошибка при декодировании аудио:", error);
    return { success: false, error: "Произошла непредвиденная ошибка при декодировании." };
  }
}
