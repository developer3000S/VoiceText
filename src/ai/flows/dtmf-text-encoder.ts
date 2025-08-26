'use server';

/**
 * @fileOverview A flow to encode text messages into DTMF tones for transmission over a phone call.
 *
 * - dtmfTextEncoder - A function that handles the text to DTMF encoding process.
 * - DtmfTextEncoderInput - The input type for the dtmfTextEncoder function.
 * - DtmfTextEncoderOutput - The return type for the dtmfTextEncoder function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DtmfTextEncoderInputSchema = z.object({
  text: z.string().describe('The text message to encode into DTMF tones.'),
});
export type DtmfTextEncoderInput = z.infer<typeof DtmfTextEncoderInputSchema>;

const DtmfTextEncoderOutputSchema = z.object({
  dtmfSequence: z.string().describe('The DTMF sequence representing the encoded text message.'),
});
export type DtmfTextEncoderOutput = z.infer<typeof DtmfTextEncoderOutputSchema>;

export async function dtmfTextEncoder(input: DtmfTextEncoderInput): Promise<DtmfTextEncoderOutput> {
  return dtmfTextEncoderFlow(input);
}

const prompt = ai.definePrompt({
  name: 'dtmfTextEncoderPrompt',
  input: {schema: DtmfTextEncoderInputSchema},
  output: {schema: DtmfTextEncoderOutputSchema},
  prompt: `You are a DTMF encoder. Your task is to convert the given text message into a sequence of DTMF tones.

  The DTMF keypad has the following layout:
  1   2   3
  4   5   6
  7   8   9
  *   0   #

  Each character should be represented by the corresponding DTMF tone. If a character is not present on the keypad, use the "#" key to represent it. Separate each DTMF tone with a comma.

  Text message: {{{text}}}
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
