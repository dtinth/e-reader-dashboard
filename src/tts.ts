import { getOrCreate } from "@thai/get-or-create";
import { createHash } from "crypto";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { StorageBlob } from "./storage";

const speechConfig = sdk.SpeechConfig.fromSubscription(
  Bun.env["AZURE_SPEECH_KEY"]!,
  Bun.env["AZURE_SPEECH_REGION"]!
);
speechConfig.speechSynthesisVoiceName = "en-US-JennyMultilingualNeural";
speechConfig.speechSynthesisOutputFormat =
  sdk.SpeechSynthesisOutputFormat.Audio48Khz192KBitRateMonoMp3;

export async function generateSpeech(text: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    synthesizer.speakTextAsync(
      text,
      (result) => {
        // console.log(result);
        const { audioData } = result;
        synthesizer.close();
        resolve(audioData);
      },
      (error) => {
        synthesizer.close();
        reject(error);
      }
    );
  });
}

export async function generateSpeechUrl(text: string): Promise<string> {
  const hash = createHash("sha256").update(text).digest("hex");
  const key = `tts-output/${hash}.mp3`;
  const blob = new StorageBlob(key);
  if (await blob.exists()) return blob.getUrl();
  const data = await generateSpeech(text);
  await blob.upload(Buffer.from(data));
  return blob.getUrl();
}

const speechStateMap = new Map<string, SpeechState>();

interface SpeechState {
  status: "pending" | "done" | "error";
  started: number;
  url?: string;
  error?: string;
}

export function getSpeechState(text: string) {
  const hash = createHash("sha256").update(text).digest("hex");
  return getOrCreate(speechStateMap, hash, () => {
    const state: SpeechState = { status: "pending", started: Date.now() };
    const work = async () => {
      try {
        state.url = await generateSpeechUrl(text);
        state.status = "done";
      } catch (error: any) {
        console.error(error);
        state.error = `${error}`;
        state.status = "error";
      }
    };
    work();
    return state;
  });
}
