#!/usr/bin/env node
/**
 * Workaround manual de detección de highlights (sin proveedor LLM configurado).
 *
 * Uso:
 *   node scripts/manual-highlights.cjs dump  "<userEmail>" "<videoTitle|videoId>"
 *   node scripts/manual-highlights.cjs apply "<userEmail>" "<videoTitle|videoId>" [highlights.json]
 *
 * Flujo (human-in-the-loop): `dump` imprime el transcript alineado por tiempo;
 * una persona/LLM produce el JSON de momentos; `apply` lo inserta como
 * HighlightSet DONE (model "manual", costUsd 0). Es un puente temporal: para
 * automatizar, configura un proveedor (Ollama/API) y usa el panel de generación.
 *
 * Forma de cada momento (mismo contrato que la generación on-demand):
 *   { "title", "reason", "score",
 *     "start", "end"           // corte simple, O BIEN:
 *     "segments": [{start,end}, …]   // clip cosido / línea de pensamiento
 *     "summary": true          // opcional: marca el clip resumen
 *   }
 * Con `segments`, start/end se calculan como envolvente automáticamente.
 *
 * DATABASE_URL se toma del .env raíz (Node >=20.12) o del entorno.
 */
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.join(__dirname, "..");
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  /* usa process.env si no hay .env */
}

// Silencia el log de queries de Prisma para no ensuciar el stdout del dump.
process.env.NODE_ENV = "production";
const { prisma } = require(path.join(ROOT, "packages/db/dist/index.js"));
const { generationConfigSchema } = require(
  path.join(ROOT, "packages/contracts/dist/index.js"),
);

// Config "manual" = defaults del contrato (para consistencia con el panel).
const MANUAL_CONFIG = generationConfigSchema.parse({});
const BUCKET_SECONDS = 12;

function fmt(s) {
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findVideo(userEmail, ref) {
  const user = await prisma.user.findUnique({ where: { email: userEmail.toLowerCase() } });
  if (!user) throw new Error(`Usuario no encontrado: ${userEmail}`);

  const where = UUID_RE.test(ref)
    ? { userId: user.id, id: ref }
    : { userId: user.id, title: { contains: ref, mode: "insensitive" } };
  const matches = await prisma.video.findMany({
    where,
    include: { transcript: true, highlightSet: true },
    orderBy: { createdAt: "desc" },
  });
  if (matches.length === 0) throw new Error(`Video no encontrado para "${ref}" (usuario ${userEmail})`);
  if (matches.length > 1) {
    const list = matches.map((v) => `  ${v.id}  "${v.title}"  (${v.status})`).join("\n");
    throw new Error(`Varios videos coinciden con "${ref}". Especifica por id:\n${list}`);
  }
  return matches[0];
}

async function dump(userEmail, ref) {
  const v = await findVideo(userEmail, ref);
  console.error(`videoId: ${v.id}`);
  console.error(`title:   ${v.title}`);
  console.error(`status:  ${v.status} | duration: ${v.durationSec}s | transcript: ${v.transcript?.status} | highlights: ${v.highlightSet?.status ?? "none"}`);
  if (v.transcript?.status !== "DONE") throw new Error("La transcripción no está DONE; no hay texto que analizar.");

  const words = Array.isArray(v.transcript.words) ? v.transcript.words : [];
  console.error(`language: ${v.transcript.language} | words: ${words.length}`);
  console.error("--- transcript (alineado por tiempo) ---");
  let cur = 0, buf = [], start = 0;
  for (const w of words) {
    if (w.start >= (cur + 1) * BUCKET_SECONDS) {
      if (buf.length) console.log(`[${fmt(start)}-${fmt(w.start)}] ${buf.join("").trim()}`);
      cur = Math.floor(w.start / BUCKET_SECONDS); buf = []; start = w.start;
    }
    buf.push(w.w);
  }
  if (buf.length) console.log(`[${fmt(start)}-end] ${buf.join("").trim()}`);
}

function normSeg(s, ctx) {
  if (typeof s.start !== "number" || typeof s.end !== "number" || s.end <= s.start)
    throw new Error(`Tramo inválido (start/end): ${ctx}`);
  return { start: s.start, end: s.end };
}

function readHighlights(fileArg) {
  const raw = fileArg ? fs.readFileSync(fileArg, "utf8") : fs.readFileSync(0, "utf8");
  const items = JSON.parse(raw);
  if (!Array.isArray(items)) throw new Error("El JSON debe ser un array de momentos.");
  return items.map((h) => {
    const ctx = JSON.stringify(h);
    if (typeof h.score !== "number" || typeof h.title !== "string" || typeof h.reason !== "string")
      throw new Error(`Momento inválido (score/title/reason): ${ctx}`);

    const segments =
      Array.isArray(h.segments) && h.segments.length > 0
        ? h.segments.map((s) => normSeg(s, ctx))
        : null;

    let start, end;
    if (segments) {
      start = Math.min(...segments.map((s) => s.start));
      end = Math.max(...segments.map((s) => s.end));
    } else {
      if (typeof h.start !== "number" || typeof h.end !== "number" || h.end <= h.start)
        throw new Error(`Momento inválido (falta start/end o segments): ${ctx}`);
      start = h.start;
      end = h.end;
    }

    const item = { start, end, score: h.score, title: h.title, reason: h.reason };
    if (segments && segments.length > 1) item.segments = segments; // multi-segmento
    if (h.summary === true) item.summary = true;
    return item;
  });
}

async function apply(userEmail, ref, fileArg) {
  const v = await findVideo(userEmail, ref);
  const items = readHighlights(fileArg);
  const set = await prisma.highlightSet.upsert({
    where: { videoId: v.id },
    create: {
      videoId: v.id, status: "DONE", model: "manual", localModel: "manual",
      promptHash: "manual", contentHash: v.transcript?.contentHash ?? null,
      config: MANUAL_CONFIG, items, costUsd: 0,
    },
    update: {
      status: "DONE", model: "manual", localModel: "manual", promptHash: "manual",
      contentHash: v.transcript?.contentHash ?? null,
      config: MANUAL_CONFIG, items, costUsd: 0, failReason: null,
    },
  });
  console.error(`OK: HighlightSet ${set.status} para "${v.title}" (${v.id}) con ${items.length} highlights.`);
}

async function main() {
  const [cmd, userEmail, ref, fileArg] = process.argv.slice(2);
  if (!cmd || !userEmail || !ref) {
    console.error('Uso: manual-highlights.cjs <dump|apply> "<userEmail>" "<videoTitle|videoId>" [highlights.json]');
    process.exit(2);
  }
  if (cmd === "dump") await dump(userEmail, ref);
  else if (cmd === "apply") await apply(userEmail, ref, fileArg);
  else throw new Error(`Comando desconocido: ${cmd}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(String(e.message ?? e));
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
