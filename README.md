# DataInsight Pro

Έξυπνη εφαρμογή καθαρισμού δεδομένων, στατιστικής ανάλυσης, διαδραστικών γραφημάτων, AI Insights και αυτόματης δημιουργίας παρουσιάσεων PowerPoint (`.pptx`), Word (`.docx`) και Excel (`.xlsx`) από αρχεία Excel/CSV.

## Τοπική εκτέλεση (Run Locally)

**Προαπαιτούμενα:** Node.js >= 20

1. Εγκατάσταση εξαρτήσεων:
   ```bash
   npm install
   ```
2. Δημιουργία αρχείου `.env.local` (με βάση το `.env.example`) και προσθήκη του Gemini API key:
   ```env
   GEMINI_API_KEY="ΤΟ_API_KEY_ΣΟΥ"
   ```
3. Εκκίνηση σε development mode:
   ```bash
   npm run dev
   ```
4. Άνοιγμα στον browser: `http://localhost:3000`

### Production build τοπικά

```bash
npm run build
NODE_ENV=production npm start
```

## Deploy στο Cloud

### 1. Deploy στο Render (1-Click Blueprint)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/DXenos1954/datainsight-pro)

1. Πάτησε το κουμπί **Deploy to Render** (ή σύνδεσε το `DXenos1954/datainsight-pro` από το Render Dashboard -> **New +** -> **Blueprint**).
2. Όρισε τη μεταβλητή περιβάλλοντος `GEMINI_API_KEY` με το κλειδί σου από το Google AI Studio.
3. Το `render.yaml` ρυθμίζει αυτόματα build, start command και health check (`/api/health`).

### 2. Deploy στο Railway

1. Δημιούργησε νέο project στο Railway από το GitHub repo `DXenos1954/datainsight-pro`.
2. Το Railway ανιχνεύει αυτόματα το `Dockerfile`.
3. Πρόσθεσε το `GEMINI_API_KEY` στις **Variables** της υπηρεσίας.

### 3. Deploy στο Google Cloud Run

```bash
gcloud run deploy datainsight-pro \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY="ΤΟ_API_KEY_ΣΟΥ"
```
