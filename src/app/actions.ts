"use server";

import { decodeDtmfAudio, DecodeDtmfAudioInput } from "@/ai/flows/dtmf-audio-decoder";
import { dtmfTextEncoder, DtmfTextEncoderInput } from "@/ai/flows/dtmf-text-encoder";

export async function encodeTextAction(input: DtmfTextEncoderInput) {
  try {
    const result = await dtmfTextEncoder(input);
    return { success: true, data: result };
  } catch (error) {
    console.error("Error encoding text:", error);
    return { success: false, error: "Не удалось закодировать текст." };
  }
}

export async function decodeAudioAction(input: DecodeDtmfAudioInput) {
  try {
    const result = await decodeDtmfAudio(input);
    if (result.success) {
      return { success: true, data: result };
    }
    return { success: false, error: "Не удалось декодировать аудио." };
  } catch (error) {
    console.error("Error decoding audio:", error);
    return { success: false, error: "Произошла непредвиденная ошибка при декодировании." };
  }
}
