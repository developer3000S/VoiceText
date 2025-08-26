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
  prompt: `Вы - эксперт в декодировании аудиосигналов DTMF (двухтональный многочастотный) в текст.

Вы получите аудиозапись тонов DTMF. Ваша задача - проанализировать аудио и преобразовать тоны DTMF в читаемое текстовое сообщение. Каждый тон должен интерпретироваться как символ.

- Проанализируйте предоставленный аудиосигнал, чтобы определить последовательность тонов DTMF.
- Преобразуйте определенные тоны в соответствующие им текстовые символы.
- Если аудио не содержит распознаваемых тонов DTMF или является тихим, вы должны указать, что декодирование не удалось.

Вот аудиоданные: {{media url=audioDataUri}}

Пожалуйста, верните декодированный текст и логическое значение, указывающее, было ли декодирование успешным.
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
