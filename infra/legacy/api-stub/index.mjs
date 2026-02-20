import express from "express";
import cors from "cors";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Заглушки под будущее (чтобы фронт не падал)
app.all("/api/*", (_req, res) => res.status(501).json({ ok: false, error: "Not implemented yet" }));

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => console.log(`[api] listening on :${PORT}`));
