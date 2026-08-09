// Optional embedding client for semantic memory search.
// Credentials come from the environment or an explicit config command; absence
// degrades search to BM25 without storing secrets on disk.

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  endpoint: string;
  apiKeyCommand?: string;
}

const DEFAULTS: EmbeddingConfig = {
  model: "text-embedding-3-small",
  dimensions: 1536,
  endpoint: "https://api.openai.com/v1/embeddings",
};

let configCache: EmbeddingConfig | undefined;
let apiKeyResolved = false;
let apiKeyCache: string | null = null;

function configPath(): string {
  if (process.env.MEMORY_EMBEDDINGS_CONFIG) return path.resolve(process.env.MEMORY_EMBEDDINGS_CONFIG);
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configHome, "memory-vault", "embeddings.json");
}

export function getEmbeddingConfig(): EmbeddingConfig {
  if (configCache) return configCache;
  let fromFile: Partial<EmbeddingConfig> = {};
  const filename = configPath();
  try {
    if (fs.existsSync(filename)) fromFile = JSON.parse(fs.readFileSync(filename, "utf-8"));
  } catch (error) {
    console.error(`[memory-vault] ignoring invalid ${filename}: ${error}`);
  }
  configCache = { ...DEFAULTS, ...fromFile };
  return configCache;
}

export function resolveApiKey(config = getEmbeddingConfig()): string | null {
  if (apiKeyResolved) return apiKeyCache;
  apiKeyResolved = true;

  const fromEnv = process.env.OPENAI_API_KEY?.trim();
  if (fromEnv) return apiKeyCache = fromEnv;

  if (config.apiKeyCommand) {
    try {
      return apiKeyCache = execSync(config.apiKeyCommand, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || null;
    } catch (error) {
      console.error(`[memory-vault] embedding key command failed; vector search disabled: ${error}`);
    }
  }
  return apiKeyCache = null;
}

export function hasEmbeddingCredentials(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim() || getEmbeddingConfig().apiKeyCommand);
}

export async function embedTexts(texts: string[]): Promise<Float32Array[] | null> {
  if (texts.length === 0) return [];
  const config = getEmbeddingConfig();
  const key = resolveApiKey(config);
  if (!key) return null;

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, input: texts, dimensions: config.dimensions }),
    });
    if (!response.ok) {
      console.error(`[memory-vault] embedding API ${response.status}: ${await response.text()}`);
      return null;
    }
    const json = await response.json() as { data: { embedding: number[] }[] };
    return json.data.map((item) => Float32Array.from(item.embedding));
  } catch (error) {
    console.error(`[memory-vault] embedding request failed; vector search disabled: ${error}`);
    return null;
  }
}

export async function embedQuery(query: string): Promise<Float32Array | null> {
  const vectors = await embedTexts([query]);
  return vectors?.[0] ?? null;
}
