// Client Anthropic pour l'app : la clé est celle saisie dans les Réglages (stockée sur l'appareil),
// et l'appel part directement du téléphone vers l'API (navigateur autorisé explicitement).
import Anthropic from '@anthropic-ai/sdk';

export * from '@anthropic-ai/sdk';

export default class LocalAnthropic extends Anthropic {
  constructor(options = {}) {
    super({ apiKey: globalThis.__peculeEnv?.ANTHROPIC_API_KEY, dangerouslyAllowBrowser: true, maxRetries: 1, ...options });
  }
}
