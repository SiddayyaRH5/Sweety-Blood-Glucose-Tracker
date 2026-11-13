import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { calculateReportSummary, SLOT_MAP } from '../src/utils/glucose.js';

const PRIMARY_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_TIMEOUT_MS = 8000;

async function withTimeout(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${GEMINI_TIMEOUT_MS / 1000}s. Please try again.`));
        }, GEMINI_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function formatGeminiError(err) {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) {
      return new Error(parsed.error.message);
    }
  } catch {
    // raw is not JSON
  }
  return err instanceof Error ? err : new Error(raw);
}

function isTransientError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('timed out')
  );
}

async function runWithResilience(operation, label) {
  const attempts = [
    { model: PRIMARY_MODEL, delayMs: 0 },
    { model: FALLBACK_MODEL, delayMs: 250 },
  ];

  let lastError;
  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await new Promise((r) => setTimeout(r, attempt.delayMs));
    }
    try {
      return await withTimeout(operation(attempt.model), label);
    } catch (err) {
      lastError = err;
      if (!isTransientError(err)) {
        throw formatGeminiError(err);
      }
    }
  }
  throw formatGeminiError(lastError);
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'Gemini API key is not configured. Please add GEMINI_API_KEY in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatReadingsContext(readings) {
  if (readings.length === 0) {
    return 'No blood glucose readings have been recorded yet.';
  }

  const recent = [...readings]
    .sort((a, b) => b.readingDate.localeCompare(a.readingDate))
    .slice(0, 60);

  const summary = calculateReportSummary(recent);
  const lines = recent.map((r) => {
    const label = SLOT_MAP[r.slot]?.label ?? r.slot;
    const notePart = r.note ? ` (note: ${r.note})` : '';
    return `- ${r.readingDate} | ${label}: ${r.value} mg/dL${notePart}`;
  });

  return [
    `Summary across ${summary.totalCount} recent readings: Average ${summary.averageFormatted} mg/dL, Lowest ${summary.lowest} mg/dL, Highest ${summary.highest} mg/dL, In-range rate ${summary.inRangePercent}%.`,
    'Recent readings (newest first):',
    ...lines,
  ].join('\n');
}

export async function generateGlucoseInsights(readings, periodLabel) {
  const ai = getGeminiClient();
  const context = formatReadingsContext(readings);

  const prompt = [
    `Analyze the user's blood glucose readings for the period: ${periodLabel}.`,
    context,
    'Provide a calm, encouraging, clinically grounded wellness summary in structured JSON.',
    'Do not diagnose medical conditions or prescribe medication adjustments.',
  ].join('\n\n');

  const response = await runWithResilience(
    (modelName) =>
      ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          thinkingConfig: {
            thinkingLevel:
              modelName === FALLBACK_MODEL ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
          },
          systemInstruction:
            'You are a careful, supportive diabetes wellness data analyst for the Sweety Blood Glucose Tracker. Summarize glucose patterns objectively using mg/dL units, highlight fasting vs post-meal trends when visible, give practical non-prescriptive lifestyle/meal-timing tips, and always include a concise medical disclaimer.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: {
                type: Type.STRING,
                description: 'Short 6-10 word summary headline of the period trend.',
              },
              summary: {
                type: Type.STRING,
                description: 'Two to three clear sentences summarizing overall glucose stability and range.',
              },
              patterns: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Two to four concise observations comparing fasting and post-meal slots.',
              },
              recommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Two to three practical, safe wellness habits (hydration, walking after meals, consistent logging).',
              },
              disclaimer: {
                type: Type.STRING,
                description: 'One sentence reminding the user to consult their clinician for medical decisions.',
              },
            },
            required: ['headline', 'summary', 'patterns', 'recommendations', 'disclaimer'],
          },
        },
      }),
    'Gemini insights request'
  );

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty insight response.');
  }

  return JSON.parse(rawText);
}

export async function sendCareAssistantMessage(message, history, readings) {
  const ai = getGeminiClient();
  const readingsContext = formatReadingsContext(readings);

  const systemInstruction = [
    'You are the Sweety Care Assistant, a calm, knowledgeable, empathetic health companion inside the Sweety Blood Glucose Tracker.',
    'You have read-only context of the user’s logged blood glucose readings below. Reference their actual numbers accurately when helpful.',
    'Reference targets for general orientation: Morning fasting ~70–130 mg/dL; 1–2 hours after meals ~70–180 mg/dL; below 70 mg/dL is low; 250+ mg/dL is high.',
    'Rules: Keep answers concise (2–4 short paragraphs or clear bullet points), warm, practical, and non-judgmental. Never diagnose disease, prescribe insulin/medication doses, or claim to replace a physician. Encourage urgent medical attention for severe hypoglycemia (<54 mg/dL) or persistent severe hyperglycemia (>300 mg/dL).',
    '',
    'USER GLUCOSE DATA:',
    readingsContext,
  ].join('\n');

  const formattedHistory = history.slice(-16).map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.content }],
  }));

  const response = await runWithResilience(
    (modelName) => {
      const chat = ai.chats.create({
        model: modelName,
        config: {
          thinkingConfig: {
            thinkingLevel:
              modelName === FALLBACK_MODEL ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
          },
          systemInstruction,
        },
        history: formattedHistory,
      });
      return chat.sendMessage({ message });
    },
    'Care Assistant chat request'
  );

  const reply = (response.text ?? '').trim();
  if (!reply) {
    throw new Error('Assistant returned an empty reply.');
  }
  return reply;
}
