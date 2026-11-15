import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/utils/runtime";
import { normalizeProfileData } from "@/utils/dataValidation";
import { sendMessage } from "@/utils/api";
import { buildCvExtractionPrompt } from "@/utils/systemPrompt";
import type { ApiConfig } from "@/stores/chatStore";
import type { ProfileData } from "@/types";

interface ImportedDocument {
  name: string;
  bytes: number[];
}

export interface PickedCvDocument {
  name: string;
  bytes: Uint8Array;
}

/** Upper bound for CV text sent to the model; longer CVs add noise. */
const MAX_CV_TEXT_CHARS = 30_000;

/**
 * Ask for a CV file. In Tauri the native dialog and the read happen in Rust;
 * in browser development a hidden file input is used.
 */
export async function pickCvDocument(): Promise<PickedCvDocument | null> {
  if (!isTauriRuntime()) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".pdf,.docx,.txt";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        void file.arrayBuffer().then((buffer) => {
          resolve({ name: file.name, bytes: new Uint8Array(buffer) });
        });
      };
      input.click();
    });
  }
  const picked = await invoke<ImportedDocument | null>("read_import_file");
  if (!picked) return null;
  return { name: picked.name, bytes: new Uint8Array(picked.bytes) };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/** Extract plain text locally; nothing leaves the machine until the user asks. */
export async function extractCvText(
  name: string,
  bytes: Uint8Array,
): Promise<string> {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  let text: string;

  if (extension === "txt") {
    text = new TextDecoder().decode(bytes);
  } else if (extension === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({
      arrayBuffer: toArrayBuffer(bytes),
    });
    text = result.value;
  } else if (extension === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const pdf = await pdfjs.getDocument({
      data: bytes,
    }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
      );
    }
    text = pages.join("\n\n");
  } else {
    throw new Error("Choose a PDF, DOCX or TXT file.");
  }

  const cleaned = text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) {
    throw new Error(
      "No text could be extracted. Scanned PDFs need to be copied and pasted instead.",
    );
  }
  return cleaned.slice(0, MAX_CV_TEXT_CHARS);
}

/** Parse the model's JSON, tolerating code fences and a little prose. */
export function parseCvProfileJson(content: string): ProfileData | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  const raw = fenced?.[1] ?? content;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    return normalizeProfileData(parsed);
  } catch {
    return null;
  }
}

/**
 * Send extracted CV text to the configured model and validate the returned
 * JSON against the profile normalizer. No tools are offered.
 */
export async function analyzeCvText(
  text: string,
  config: ApiConfig,
  signal?: AbortSignal,
): Promise<ProfileData> {
  const response = await sendMessage(
    [{ role: "user", content: text, timestamp: new Date().toISOString() }],
    { ...config, webSearchEnabled: false },
    buildCvExtractionPrompt(),
    { signal },
  );
  if (response.error) throw new Error(response.error);
  const profile = parseCvProfileJson(response.content);
  if (!profile) {
    throw new Error(
      "The assistant did not return usable profile data. Try again or paste the CV text manually.",
    );
  }
  return profile;
}
