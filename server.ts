import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-4-hydrogen';

function getAIClient() {
  const rawKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  const apiKey = rawKey.trim().replace(/^["']|["']$/g, '');
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const err = new Error(
      'Δεν έχει οριστεί έγκυρο GEMINI_API_KEY. Επιλέξτε ή ελέγξτε το API key σας στο Settings > Secrets.'
    ) as Error & { status?: number };
    err.status = 401;
    throw err;
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

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as { status?: number }).status)
          : 0;
      const isRetryable = status === 429 || status >= 500 || status === 0;
      if (!isRetryable || attempt === retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

function mapGeminiError(error: unknown): { status: number; message: string } {
  const errObj = error as { status?: number; message?: string };
  const rawMessage = errObj?.message || 'Σφάλμα επικοινωνίας με την υπηρεσία AI.';
  const status = errObj?.status || 500;

  if (
    status === 401 ||
    status === 403 ||
    rawMessage.includes('PERMISSION_DENIED') ||
    rawMessage.includes('API_KEY_INVALID') ||
    rawMessage.includes('API key not valid')
  ) {
    return {
      status: 401,
      message:
        'Το Gemini API key δεν είναι έγκυρο ή δεν έχει οριστεί. Ελέγξτε ή επιλέξτε ένα έγκυρο κλειδί στο Settings > Secrets.',
    };
  }
  if (status === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message:
        'Υπέρβαση ορίου αιτημάτων (quota). Δοκιμάστε ξανά σε λίγο ή ελέγξτε το κλειδί σας στο Settings > Secrets.',
    };
  }
  return {
    status: status >= 400 && status < 600 ? status : 500,
    message: rawMessage,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/analyze', async (req, res) => {
    try {
      const { headers, computedColStats, sample, rowCount, sheetName, fileName } = req.body ?? {};
      if (!Array.isArray(headers) || headers.length === 0) {
        res.status(400).json({ error: 'Απαιτούνται έγκυρες στήλες δεδομένων για ανάλυση.' });
        return;
      }

      const ai = getAIClient();
      const slideCount = Math.min(10, Math.max(5, headers.length + 2));

      const prompt = `Είσαι ανώτερος Αναλυτής Δεδομένων και Στατιστικολόγος.
Αρχείο: ${fileName || 'Dataset'} | Φύλλο: ${sheetName || 'Sheet1'} | Συνολικές γραμμές: ${rowCount || 0}
Στήλες: ${headers.slice(0, 20).join(', ')}

Πραγματικά στατιστικά στοιχεία που υπολογίστηκαν τοπικά με ακρίβεια:
${JSON.stringify(computedColStats, null, 2)}

Δείγμα γραμμών:
${JSON.stringify(sample, null, 2)}

Οδηγίες:
1. Γράψε μια εμπεριστατωμένη, σαφή και επαγγελματική "summary" στα Ελληνικά (2-3 παράγραφοι) αναφέροντας συγκεκριμένες αριθμητικές τιμές από τα παραπάνω στατιστικά (μέσους όρους, διάμεσους, εύρη, τυπικές αποκλίσεις, ασυμμετρία, κυρίαρχες κατηγορίες και πιθανές ακραίες τιμές).
2. Πρόσθεσε 3-5 σύντομα, πρακτικά "keyFindings" (βασικά ευρήματα) με αριθμητική τεκμηρίωση.
3. Στον πίνακα "statistics", συμπερίλαβε κάθε στήλη από τα υπολογισμένα στατιστικά με τις ακριβείς τιμές της και ένα ουσιαστικό "description" στα Ελληνικά που ερμηνεύει τι δείχνουν τα στατιστικά για τη στήλη.
4. Πρότεινε 3-4 χρήσιμα γραφήματα στο "suggestedCharts" χρησιμοποιώντας ΑΥΣΤΗΡΑ ακριβή ονόματα στηλών από τη λίστα: ${headers.slice(0, 20).join(', ')}.
   - Αν οι στήλες αντιπροσωπεύουν χρονικές περιόδους (π.χ. έτη όπως 2019, 2020, 2021, μήνες, τρίμηνα) ή συγκρίσιμες μεταβλητές σε οριζόντια διάταξη, ΠΡΕΠΕΙ να προτείνεις τουλάχιστον 2 γραφήματα με "orientation": "columns", όπου "xColumns" είναι η λίστα των στηλών-ετών/μεταβλητών στον άξονα X, και "seriesMode": "multi" (σύγκριση γραμμών), "sum" ή "avg".
   - Για τυπικά κάθετα γραφήματα ("orientation": "rows"), ο άξονας yAxis ΠΡΕΠΕΙ να είναι αριθμητική στήλη (και για scatter και οι δύο άξονες ΠΡΕΠΕΙ να είναι αριθμητικές στήλες).
5. Δημιούργησε "presentationOutline" με ακριβώς ${slideCount} διαφάνειες στα Ελληνικά, με 3-4 ουσιαστικά bullet points ανά διαφάνεια που αναφέρουν πραγματικά νούμερα. Σύνδεσε σχετικά γραφήματα με το πεδίο "chartIndex" (0-based index του suggestedCharts, ή παράλειψέ το αν η διαφάνεια δεν χρειάζεται γράφημα).`;

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                keyFindings: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                statistics: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      column: { type: Type.STRING },
                      type: { type: Type.STRING },
                      count: { type: Type.NUMBER },
                      mean: { type: Type.NUMBER },
                      median: { type: Type.NUMBER },
                      stdDev: { type: Type.NUMBER },
                      min: { type: Type.NUMBER },
                      max: { type: Type.NUMBER },
                      topValues: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            value: { type: Type.STRING },
                            count: { type: Type.NUMBER },
                          },
                          required: ['value', 'count'],
                        },
                      },
                      description: { type: Type.STRING },
                    },
                    required: ['column', 'type', 'count', 'description'],
                  },
                },
                suggestedCharts: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      type: { type: Type.STRING },
                      orientation: { type: Type.STRING },
                      title: { type: Type.STRING },
                      xAxis: { type: Type.STRING },
                      yAxis: { type: Type.STRING },
                      xColumns: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      seriesMode: { type: Type.STRING },
                      description: { type: Type.STRING },
                    },
                    required: ['type', 'title', 'xAxis', 'yAxis', 'description'],
                  },
                },
                presentationOutline: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    slides: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          title: { type: Type.STRING },
                          content: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                          },
                          chartIndex: { type: Type.INTEGER },
                        },
                        required: ['title', 'content'],
                      },
                    },
                  },
                  required: ['title', 'slides'],
                },
              },
              required: ['summary', 'keyFindings', 'statistics', 'suggestedCharts', 'presentationOutline'],
            },
          },
        })
      );

      const text = response.text;
      if (!text) {
        res.status(502).json({ error: 'Κενή απάντηση από το μοντέλο AI.' });
        return;
      }

      const parsed = JSON.parse(text);
      res.json(parsed);
    } catch (error) {
      console.error('Error in /api/analyze:', error);
      const mapped = mapGeminiError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/ask', async (req, res) => {
    try {
      const { question, headers, computedColStats, sample, rowCount, history } = req.body ?? {};
      if (!question || typeof question !== 'string' || !question.trim()) {
        res.status(400).json({ error: 'Παρακαλώ εισάγετε μια ερώτηση.' });
        return;
      }

      const ai = getAIClient();
      const recentHistory = Array.isArray(history)
        ? history
            .slice(-6)
            .map((m: { role: string; text: string }) => `${m.role === 'user' ? 'Χρήστης' : 'Αναλυτής'}: ${m.text}`)
            .join('\n')
        : '';

      const prompt = `Είσαι έμπειρος Αναλυτής Δεδομένων. Απάντησε στα Ελληνικά, με σαφήνεια, συντομία και απόλυτη ακρίβεια, βασιζόμενος ΑΠΟΚΛΕΙΣΤΙΚΑ στα παρακάτω πραγματικά δεδομένα και στατιστικά. Αν κάτι δεν προκύπτει από τα δεδομένα, δήλωσέ το ξεκάθαρα.

Συνολικές γραμμές: ${rowCount || 0}
Στήλες: ${(headers || []).slice(0, 20).join(', ')}
Υπολογισμένα Στατιστικά:
${JSON.stringify(computedColStats, null, 2)}

Δείγμα γραμμών:
${JSON.stringify(sample, null, 2)}

${recentHistory ? `Προηγούμενη συνομιλία:\n${recentHistory}\n` : ''}
Ερώτηση χρήστη: ${question.trim()}`;

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: {
            systemInstruction:
              'Απάντησε σε καθαρά, φυσικά Ελληνικά χωρίς markdown σύμβολα κώδικα. Χρησιμοποίησε ακριβή νούμερα από τα υπολογισμένα στατιστικά και δομημένες σύντομες παραγράφους.',
          },
        })
      );

      res.json({ answer: response.text || 'Δεν ήταν δυνατή η δημιουργία απάντησης.' });
    } catch (error) {
      console.error('Error in /api/ask:', error);
      const mapped = mapGeminiError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DataInsight Pro server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
