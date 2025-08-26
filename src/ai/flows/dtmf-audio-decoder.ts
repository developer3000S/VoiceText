'use server';

/**
 * @fileOverview AI-агент для декодирования аудио DTMF.
 *
 * - decodeDtmfAudio - Функция, которая обрабатывает процесс декодирования аудио DTMF.
 * - DecodeDtmfAudioInput - Тип входных данных для функции decodeDtmfAudio.
 * - DecodeDtmfAudioOutput - Тип возвращаемого значения для функции decodeDtmfAudio.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DecodeDtmfAudioInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "Аудиозапись тонов DTMF в виде URI данных, который должен включать MIME-тип и использовать кодировку Base64. Ожидаемый формат: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type DecodeDtmfAudioInput = z.infer<typeof DecodeDtmfAudioInputSchema>;

const DecodeDtmfAudioOutputSchema = z.object({
  decodedText: z
    .string()
    .describe('Текст, декодированный из аудио DTMF, в случае успеха.'),
  success: z.boolean().describe('Было ли декодирование успешным.'),
});
export type DecodeDtmfAudioOutput = z.infer<typeof DecodeDtmfAudioOutputSchema>;

export async function decodeDtmfAudio(input: DecodeDtmfAudioInput): Promise<DecodeDtmfAudioOutput> {
  return decodeDtmfAudioFlow(input);
}

const prompt = ai.definePrompt({
  name: 'decodeDtmfAudioPrompt',
  input: {schema: DecodeDtmfAudioInputSchema},
  output: {schema: DecodeDtmfAudioOutputSchema},
  prompt: `You are an expert in decoding DTMF (Dual-Tone Multi-Frequency) audio signals into text. Your output MUST be a valid JSON object.

You will be given an audio recording of DTMF tones. Your task is to analyze the audio and convert the DTMF tones into a readable text message.

The character mapping for the phone keys is as follows:
- 1: . , ? !
- 2: А Б В Г A B C
- 3: Д Е Ж З D E F
- 4: И Й К Л G H I
- 5: М Н О П J K L
- 6: Р С Т У M N O
- 7: Ф Х Ц Ч P Q R S
- 8: Ш Щ Ъ Ы T U V
- 9: Ь Э Ю Я W X Y Z
- 0: Space
- *: Case switch (uppercase/lowercase)
- #: For symbols not on the keypad.

- Each digit corresponds to a key press. Pauses between tones separate presses for a single character. For example, the tone sequence for 'В' would be "2,2,2". For 'C' - "2,2,2,2,2,2".
- Analyze the provided audio signal to identify the sequence of DTMF tones.
- Convert the identified tones into their corresponding text characters.
- If the audio contains no recognizable DTMF tones or is silent, you MUST indicate that the decoding was not successful.

Here is the audio data: {{media url=audioDataUri}}

Please return the decoded text and a boolean indicating if the decoding was successful.
`,
});

const decodeDtmfAudioFlow = ai.defineFlow(
  {
    name: 'decodeDtmfAudioFlow',
    inputSchema: DecodeDtmfAudioInputSchema,
    outputSchema: DecodeDtmfAudioOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
