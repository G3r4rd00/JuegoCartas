import fs from "node:fs/promises";
import path from "node:path";

const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const SIZE = process.env.OPENAI_IMAGE_SIZE || "1024x1024";
const OUTPUT_DIR = path.resolve("assets/cards");
const KEY_FILE = path.resolve("scripts/openai-key.txt");

async function resolveApiKey() {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
    return process.env.OPENAI_API_KEY.trim();
  }

  try {
    const keyFromFile = (await fs.readFile(KEY_FILE, "utf8")).trim();
    if (keyFromFile) {
      return keyFromFile;
    }
  } catch {
    // Ignore missing file; handled below.
  }

  console.error("Falta la key de OpenAI.");
  console.error("Opciones:");
  console.error("1) Crear scripts/openai-key.txt con la key");
  console.error("2) Definir OPENAI_API_KEY en entorno");
  process.exit(1);
}

const OPENAI_API_KEY = await resolveApiKey();

const CARDS = [
  {
    key: "milicia",
    prompt:
      "Fantasy TCG illustration of medieval militia swordsmen with short swords and round shields in close combat line, warm cinematic light, painterly style, high detail"
  },
  {
    key: "lanceros",
    prompt:
      "Fantasy TCG illustration of disciplined pikemen lancers with long pikes and blue banners on a battlefield, dynamic composition, warm cinematic light, high detail"
  },
  {
    key: "guardia",
    prompt:
      "Fantasy TCG illustration of elite royal guard with massive defensive shield crest, fortress background, heroic defensive pose, warm cinematic light, high detail"
  },
  {
    key: "caballeria",
    prompt:
      "Fantasy TCG illustration of heavy armored cavalry charge, horses and riders, dust and motion, dramatic warm sunset light, high detail"
  },
  {
    key: "veteranos",
    prompt:
      "Fantasy TCG illustration of veteran soldiers with red standards, scarred armor, disciplined line, gritty but heroic mood, warm cinematic light, high detail"
  },
  {
    key: "tesoro-menor",
    prompt:
      "Fantasy TCG illustration of a small treasure chest with scattered gold coins and warm glow, detailed environment, warm cinematic light, high detail"
  },
  {
    key: "tesoro-mayor",
    prompt:
      "Fantasy TCG illustration of a grand treasure vault with massive ornate chest overflowing with gems, crowns and gold, radiant magical glow, warm cinematic light, high detail"
  },
  {
    key: "ariete",
    prompt:
      "Fantasy TCG illustration of a massive siege ram reinforced with iron and guarded by armored troops, dramatic battlefield smoke, warm cinematic light, high detail"
  }
];

const STYLE_GUARDRAILS =
  "No text, no letters, no symbols, no logos, no watermark, no signature, no frame text.";

function parseCardsArg() {
  const arg = process.argv.find((value) => value.startsWith("--cards="));
  if (!arg) {
    return null;
  }
  const keys = arg
    .slice("--cards=".length)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return new Set(keys);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateImageBase64(prompt) {
  const body = {
    model: MODEL,
    prompt: `${prompt}. ${STYLE_GUARDRAILS}`,
    size: SIZE
  };

  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    if (response.ok) {
      const json = await response.json();
      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) {
        throw new Error("La API respondio sin data[0].b64_json");
      }
      return b64;
    }

    const errorText = await response.text();
    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      const waitMs = 1200 * attempt;
      console.warn(`Reintento ${attempt}/${maxRetries - 1} tras error ${response.status}...`);
      await sleep(waitMs);
      continue;
    }

    throw new Error(`Error API (${response.status}): ${errorText}`);
  }

  throw new Error("No se pudo generar la imagen tras varios reintentos");
}

async function run() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const requestedKeys = parseCardsArg();
  const cardsToGenerate = requestedKeys
    ? CARDS.filter((card) => requestedKeys.has(card.key))
    : CARDS;

  if (cardsToGenerate.length === 0) {
    console.error("No hay cartas para generar con el filtro recibido.");
    process.exit(1);
  }

  const failed = [];

  for (const card of cardsToGenerate) {
    console.log(`Generando ${card.key}...`);
    try {
      const b64 = await generateImageBase64(card.prompt);
      const outputPath = path.join(OUTPUT_DIR, `${card.key}.png`);
      await fs.writeFile(outputPath, Buffer.from(b64, "base64"));
      console.log(`OK ${card.key}: ${outputPath}`);
    } catch (err) {
      const message = err?.message || String(err);
      failed.push({ key: card.key, message });
      console.error(`ERROR ${card.key}: ${message}`);
    }
    await sleep(300);
  }

  if (failed.length > 0) {
    console.error("Generacion completada con errores:");
    failed.forEach((entry) => {
      console.error(`- ${entry.key}: ${entry.message}`);
    });
    process.exit(1);
  }

  console.log("Generacion completada sin errores.");
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
