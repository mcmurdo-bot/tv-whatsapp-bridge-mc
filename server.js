import express from "express";
import OpenAI from "openai";
import twilio from "twilio";

const app = express();
app.use(express.json());

// --- ENV ---
const {
  OPENAI_API_KEY,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TV_WEBHOOK_SECRET,
  WHATSAPP_TO,
  TWILIO_WHATSAPP_FROM,
  PORT
} = process.env;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const tw = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// --- HEALTH (para UptimeRobot) ---
app.get("/health", (_, res) => res.status(200).json({ ok: true }));

// --- ROOT ---
app.get("/", (_, res) => res.status(200).send("OK"));

// --- TRADINGVIEW WEBHOOK ---
app.post("/tv", async (req, res) => {
  try {
    const d = req.body;

    if (!d || d.secret !== TV_WEBHOOK_SECRET) {
      return res.status(401).json({ ok: false, error: "Invalid secret" });
    }

    // Acepta varios nombres por si el Pine manda stop o sl
    const side   = d.side ?? "NA";
    const symbol = d.symbol ?? d.ticker ?? "NA";
    const tf     = d.tf ?? d.interval ?? "NA";
    const close  = Number(d.close ?? NaN);

    const stop = Number(d.stop ?? d.sl ?? d.stopLoss ?? NaN);

    const ema21  = d.ema21 ?? "";
    const ema50  = d.ema50 ?? "";
    const ema200 = d.ema200 ?? "";
    const adx    = d.adx ?? "";

    // Gestión simple de tamaño (opcional)
    const risk = 15; // USDT
    const dist = Number.isFinite(close) && Number.isFinite(stop) ? Math.abs(close - stop) : 0;
    const size = dist > 0 ? (risk / dist) : 0;

    const prompt = `
Respondé SOLO en este formato:

OK o NO OK
- razón 1
- razón 2
- razón 3
STOP: <precio>
SIZE: <tamaño>

Datos:
symbol=${symbol}
tf=${tf}
side=${side}
close=${Number.isFinite(close) ? close : "?"}
stop=${Number.isFinite(stop) ? stop : "?"}
ema21=${ema21} ema50=${ema50} ema200=${ema200}
adx=${adx}
risk_usdt=${risk}
size_sugerido=${size}
`.trim();

    const r = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: prompt
    });

    const text = (r.output_text || "NO OK\n- Sin respuesta\n- \n- \nSTOP: ?\nSIZE: ?").trim();

    // Enviar WhatsApp
    await tw.messages.create({
      from: TWILIO_WHATSAPP_FROM,   // ej: "whatsapp:+14155238886"
      to: WHATSAPP_TO,              // ej: "whatsapp:+541155962485"
      body: `📣 ${symbol} ${tf} ${side}\n${text}`
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error("TV webhook error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.listen(PORT || 3000, () => console.log("Listening"));
