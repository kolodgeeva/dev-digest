import { eq } from 'drizzle-orm';
import {
  FEATURE_MODELS,
  FeatureModelChoice,
  type FeatureModelId,
  type LLMProvider,
  type Provider,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConfigError } from '../../platform/errors.js';
import * as t from '../../db/schema.js';
import { rowsToSettings } from './helpers.js';

/**
 * Per-feature model configuration.
 *
 * System LLM features (onboarding, intent, risk brief, conformance, conventions)
 * read their provider/model from the workspace's Settings instead of a hardcoded
 * module constant. When the workspace hasn't chosen one, we fall back to the
 * registry default in `FEATURE_MODELS` — which mirrors each module's old
 * constant, so behaviour is unchanged until a model is explicitly picked.
 */

const DEFAULTS = Object.fromEntries(
  FEATURE_MODELS.map((f) => [f.id, { provider: f.defaultProvider, model: f.defaultModel }]),
) as Record<FeatureModelId, FeatureModelChoice>;

/** The registry default (provider+model) for a feature — no DB read. */
export function defaultFeatureModel(id: FeatureModelId): FeatureModelChoice {
  return DEFAULTS[id];
}

/**
 * The workspace's override for `id`, or `undefined` when unset/invalid. Callers
 * that keep their own dynamic default (e.g. conventions) use this directly so
 * that default is preserved; callers with a static default use
 * `resolveFeatureModel` instead.
 */
export async function getFeatureModelOverride(
  container: Container,
  workspaceId: string,
  id: FeatureModelId,
): Promise<FeatureModelChoice | undefined> {
  const rows = await container.db
    .select({ key: t.settings.key, value: t.settings.value })
    .from(t.settings)
    .where(eq(t.settings.workspaceId, workspaceId));
  const fm = (rowsToSettings(rows) as { feature_models?: Record<string, unknown> }).feature_models;
  const parsed = FeatureModelChoice.safeParse(fm?.[id]);
  return parsed.success ? parsed.data : undefined;
}

/** Resolve `id` to a concrete provider+model: workspace override, else registry default. */
export async function resolveFeatureModel(
  container: Container,
  workspaceId: string,
  id: FeatureModelId,
): Promise<FeatureModelChoice> {
  return (await getFeatureModelOverride(container, workspaceId, id)) ?? DEFAULTS[id];
}

/**
 * Provider tried when the resolved feature-model provider has no key configured,
 * in preference order, each with a known-good default model for that provider.
 * Lets a system feature run on WHATEVER provider the user actually configured a
 * key for instead of hard-failing on the registry default's provider.
 */
const PROVIDER_FALLBACKS: { provider: Provider; model: string }[] = [
  { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
  { provider: 'anthropic', model: 'claude-3-5-sonnet-latest' },
  { provider: 'openai', model: 'gpt-4.1' },
];

/**
 * Resolve a feature to an LLM provider INSTANCE + model, guaranteeing the
 * provider's API key is configured. Tries the resolved feature-model provider
 * first (keeping its model); on a missing-key `ConfigError`, falls back to the
 * first other provider whose key IS configured (with that provider's default
 * model). Throws a clear `ConfigError` only when NO provider key exists.
 *
 * `container.llm()` returns a test-injected mock before any key lookup, so this
 * stays correct under `overrides.llm`.
 */
export async function resolveAvailableLlm(
  container: Container,
  workspaceId: string,
  id: FeatureModelId,
): Promise<{ llm: LLMProvider; model: string }> {
  const chosen = await resolveFeatureModel(container, workspaceId, id);
  try {
    return { llm: await container.llm(chosen.provider), model: chosen.model };
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
  }
  for (const fallback of PROVIDER_FALLBACKS) {
    if (fallback.provider === chosen.provider) continue;
    try {
      return { llm: await container.llm(fallback.provider), model: fallback.model };
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err;
    }
  }
  throw new ConfigError(
    'No LLM provider key configured. Add an OpenAI, Anthropic, or OpenRouter key in Settings → API Keys.',
  );
}
