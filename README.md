# Aravind IT Brain 🧠

Mobile-friendly AI assistant for desktop support / IT engineers.
Troubleshooting plans, ticket notes, user replies, commands, day plan, screenshot (up to 50) analysis,
voice input, spoken answers, and live web search in Deep mode (🔬).

Free & open source (MIT). Runs on Vercel (free Hobby plan) + Google Gemini API (free tier).

## Deploy (Vercel)

1. **Free AI key:** https://aistudio.google.com/apikey -> Create API key -> copy it.
2. **GitHub:** create a new repository and upload all these files (keep the `api` folder).
3. **Vercel:** https://vercel.com -> Add New -> Project -> import that repository -> before Deploy open
   *Environment Variables* and add:
   - `GEMINI_API_KEY` = your key
   - `APP_PASSWORD` = any password you choose (stops strangers using your free quota)
   - (optional) `GEMINI_MODEL` = a different Gemini model name (default `gemini-2.5-flash`)
4. Click **Deploy**. Open the `.vercel.app` link on your phone -> browser menu -> **Add to Home screen**.

Using the Vercel CLI instead: `npm i -g vercel`, then `vercel` and `vercel --prod` inside this folder.

## Notes
- The API key lives only on the server (Vercel env vars), never in the browser.
- Photos are shrunk in the browser; total upload is capped around 4 MB (Vercel limit), so 50 small screenshots usually fit.
- Free-tier limits and model names change over time: check https://ai.google.dev/gemini-api/docs/pricing
- Chat history is stored only in your phone's browser (localStorage).
