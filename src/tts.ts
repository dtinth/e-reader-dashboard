import { getOrCreate } from "@thai/get-or-create";
import consola from "consola";
import { createHash } from "crypto";
import JSZip from "jszip";
import { FetchError, ofetch } from "ofetch";
import { StorageBlob } from "./storage";

const defaultVoiceName = "en-US-CoraMultilingualNeural";

export async function generateSpeech(
  text: string,
  voiceName = defaultVoiceName
) {
  // Use the batch synthesis API instead
  const baseURL = `https://${Bun.env["AZURE_SPEECH_REGION"]}.api.cognitive.microsoft.com`;
  const api = ofetch.create({
    baseURL,
    headers: {
      "Ocp-Apim-Subscription-Key": Bun.env["AZURE_SPEECH_KEY"]!,
    },
  });

  // Calculate the hash to uniquely identify this text
  const hash = createHash("sha256")
    .update(text)
    .update(voiceName)
    .update("v3")
    .digest("hex");

  // Create a new batch synthesis job
  const createResponse = await api(
    `texttospeech/batchsyntheses/${hash}?api-version=2024-04-01`,
    {
      method: "PUT",
      body: {
        description: "Bookmark " + hash,
        inputKind: "PlainText",
        inputs: [{ content: text }],
        properties: {
          outputFormat: "audio-48khz-192kbitrate-mono-mp3",
          wordBoundaryEnabled: true,
          sentenceBoundaryEnabled: true,
          concatenateResult: true,
        },
        synthesisConfig: { voice: voiceName },
      },
    }
  ).catch((e) => {
    if (e instanceof FetchError && e.status === 409) {
      // Already exists
      return;
    }
    throw e;
  });
  consola.debug("generateSpeech: createResponse", createResponse);

  // Poll the job until it's done
  for (;;) {
    const getResponse = await api<{
      status: "NotStarted" | "Running" | "Succeeded" | "Failed";
      outputs?: { result: string };
    }>(`texttospeech/batchsyntheses/${hash}?api-version=2024-04-01`);
    if (getResponse.status === "Succeeded") {
      consola.debug("generateSpeech: getResponse", getResponse);
      return processBatchOutput(getResponse.outputs!.result);
    } else if (getResponse.status === "Failed") {
      throw new Error(
        "Speech synthesis failed: " + JSON.stringify(getResponse)
      );
    } else {
      consola.debug("generateSpeech: status is", getResponse.status);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

export async function processBatchOutput(zipUrl: string) {
  const zip = await ofetch(zipUrl, { responseType: "arrayBuffer" });
  const zipFile = new JSZip();
  await zipFile.loadAsync(zip);
  const result = zipFile.file("0001.mp3")!;
  const sentences = JSON.parse(
    await zipFile.file("0001.sentence.json")!.async("text")
  );
  return {
    audio: await result.async("arraybuffer"),
    zip: zip,
    sentences,
  };
}

export interface GenerateSpeechBlobResult {
  audio: StorageBlob;
  sentences: StorageBlob;
}

export async function generateSpeechBlobs(
  text: string,
  voiceName = defaultVoiceName
): Promise<GenerateSpeechBlobResult> {
  const hash = createHash("sha256")
    .update(text)
    .update(voiceName)
    .update("v2")
    .digest("hex");
  const audioBlob = new StorageBlob(`tts-output/${hash}.mp3`);
  const sentencesBlob = new StorageBlob(`tts-output/${hash}.sentences.json`);
  if (await audioBlob.exists()) {
    return { audio: audioBlob, sentences: sentencesBlob };
  }
  const data = await generateSpeech(text);
  const zipBlob = new StorageBlob(`tts-output/${hash}.zip`);
  await Promise.all([
    audioBlob.upload(Buffer.from(data.audio)),
    zipBlob.upload(Buffer.from(data.zip)),
    sentencesBlob.upload(Buffer.from(JSON.stringify(data.sentences))),
  ]);
  return { audio: audioBlob, sentences: sentencesBlob };
}

const speechStateMap = new Map<string, SpeechState>();

interface SpeechState {
  status: "pending" | "done" | "error";
  started: number;
  result?: GenerateSpeechBlobResult;
  error?: string;
}

export function getSpeechState(text: string) {
  const hash = createHash("sha256").update(text).digest("hex");
  return getOrCreate(speechStateMap, hash, () => {
    const state: SpeechState = { status: "pending", started: Date.now() };
    const work = async () => {
      try {
        state.result = await generateSpeechBlobs(text);
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
