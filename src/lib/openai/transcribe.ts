import 'server-only';

import type OpenAI from 'openai';

import { getOpenAIClient } from '@/lib/openai/server';

export async function transcribeAudio(params: {
  bytes: Uint8Array;
  filename: string;
  mimeType?: string | null;
  model?: string;
}): Promise<{ text: string }> {
  const client = getOpenAIClient();
  const model = params.model ?? process.env.OPENAI_TRANSCRIBE_MODEL ?? 'whisper-1';

  const file = new File([params.bytes], params.filename, {
    type: params.mimeType ?? 'application/octet-stream',
  });

  const resp = await (client as OpenAI).audio.transcriptions.create({
    model,
    file,
  } as any);

  const text = (resp as any)?.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Transcription returned empty text.');
  }
  return { text };
}

