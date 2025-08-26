'use server';

/**
 * @fileOverview Поток для кодирования текстовых сообщений в тоны DTMF для передачи во время телефонного звонка.
 *
 * - dtmfTextEncoder - Функция, которая обрабатывает процесс кодирования текста в DTMF.
 * - DtmfTextEncoderInput - Тип входных данных для функции dtmfTextEncoder.
 * - DtmfTextEncoderOutput - Тип возвращаемого значения для функции dtmfTextEncoder.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DtmfTextEncoderInputSchema = z.object({
  text: z.string().describe('Текстовое сообщение для кодирования в тоны DTMF.'),
});
export type DtmfTextEncoderInput = z.infer<typeof DtmfTextEncoderInputSchema>;

const DtmfTextEncoderOutputSchema = z.object({
  dtmfSequence: z.string().describe('Последовательность DTMF, представляющая закодированное текстовое сообщение.'),
});
export type DtmfTextEncoderOutput = z.infer<typeof DtmfTextEncoderOutputSchema>;

export async function dtmfTextEncoder(input: DtmfTextEncoderInput): Promise<DtmfTextEncoderOutput> {
  return dtmfTextEncoderFlow(input);
}

const prompt = ai.definePrompt({
  name: 'dtmfTextEncoderPrompt',
  input: {schema: DtmfTextEncoderInputSchema},
  output: {schema: DtmfTextEncoderOutputSchema},
  prompt: `Вы - кодировщик DTMF. Ваша задача - преобразовать данное текстовое сообщение в последовательность тонов DTMF.

  Клавиатура DTMF имеет следующую раскладку:
  1   2   3
  4   5   6
  7   8   9
  *   0   #

  Каждый символ должен быть представлен соответствующим тоном DTMF. Если символ отсутствует на клавиатуре, используйте клавишу "#" для его представления. Разделяйте каждый тон DTMF запятой.

  Текстовое сообщение: {{{text}}}
  `,
});

const dtmfTextEncoderFlow = ai.defineFlow(
  {
    name: 'dtmfTextEncoderFlow',
    inputSchema: DtmfTextEncoderInputSchema,
    outputSchema: DtmfTextEncoderOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
