export type SupportedLang = "fr" | "nl";

const MYMEMORY_URL = "https://api.mymemory.translated.net/get";

async function translateOne(text: string, target: SupportedLang): Promise<string> {
  if (!text.trim()) return text;
  try {
    const url = `${MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=en|${target}`;
    const res = await fetch(url);
    if (!res.ok) return text;
    const json = await res.json();
    if (json.responseStatus === 200 && json.responseData?.translatedText) {
      return json.responseData.translatedText as string;
    }
    return text;
  } catch {
    return text;
  }
}

async function pLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

export interface TranslationMap {
  fr: Record<string, string>;
  nl: Record<string, string>;
}

export async function translateAll(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<TranslationMap> {
  const unique = Array.from(new Set(texts.filter((t) => t.trim().length > 0)));
  const total = unique.length * 2;
  let done = 0;

  const frMap: Record<string, string> = {};
  const nlMap: Record<string, string> = {};

  const frTasks = unique.map((text) => async () => {
    frMap[text] = await translateOne(text, "fr");
    done++;
    onProgress?.(done, total);
  });
  const nlTasks = unique.map((text) => async () => {
    nlMap[text] = await translateOne(text, "nl");
    done++;
    onProgress?.(done, total);
  });

  await Promise.all([pLimit(frTasks, 4), pLimit(nlTasks, 4)]);
  return { fr: frMap, nl: nlMap };
}
