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
  prompt: `Вы — кодировщик DTMF. Ваша задача — преобразовать данное текстовое сообщение в последовательность тонов DTMF.

  Сопоставление символов с клавишами телефона следующее:
  - 1: . , ? ! 
  - 2: А Б В Г A B C
  - 3: Д Е Ж З D E F
  - 4: И Й К Л G H I
  - 5: М Н О П J K L
  - 6: Р С Т У M N O
  - 7: Ф Х Ц Ч P Q R S
  - 8: Ш Щ Ъ Ы T U V
  - 9: Ь Э Ю Я W X Y Z
  - 0: Пробел
  - *: Переключение регистра (большие/маленькие буквы)
  - #: Для символов, которых нет на клавиатуре.

  - Чтобы ввести букву, нажмите соответствующую цифровую клавишу один или несколько раз. Например, для 'В' нажмите '2' три раза. Результат: "2,2,2". Для 'C' нажмите '2' шесть раз. Результат: "2,2,2,2,2,2".
  - Разделяйте каждую последовательность нажатий клавиш для одного символа паузой (запятой).
  - Разделяйте каждый тон DTMF запятой. Например, "Привет" будет "*,7,7,7,7, 3,3, 4,4,4, 3, 8, #".

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
