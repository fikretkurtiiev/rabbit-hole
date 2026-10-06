import { chatgptAdapter } from './chatgpt';
import { claudeAdapter } from './claude';
import { genericAdapter } from './generic';
import type { SiteAdapter } from './types';

export const SITE_ADAPTERS: SiteAdapter[] = [chatgptAdapter, claudeAdapter];

export function adapterForUrl(url: URL): SiteAdapter | null {
  return SITE_ADAPTERS.find((adapter) => adapter.matches(url)) ?? null;
}

/**
 * Wraps a site adapter so any thrown error or empty result falls back to the generic adapter.
 * Host selectors change often; the extension must degrade, never crash.
 */
export function withFallback(adapter: SiteAdapter): SiteAdapter {
  const safe =
    <K extends keyof SiteAdapter>(key: K, isEmpty: (value: unknown) => boolean = (v) => v === null) =>
    (...args: unknown[]) => {
      const primary = adapter[key] as ((...a: unknown[]) => unknown) | undefined;
      const fallback = genericAdapter[key] as ((...a: unknown[]) => unknown) | undefined;
      try {
        const value = primary?.apply(adapter, args);
        if (!isEmpty(value)) return value;
      } catch (error) {
        console.debug(`[rabbit-hole] ${adapter.id}.${String(key)} failed, using generic`, error);
      }
      return fallback?.apply(genericAdapter, args) ?? null;
    };

  return {
    ...adapter,
    getContentRoot: safe('getContentRoot') as SiteAdapter['getContentRoot'],
    findMessageElement: safe('findMessageElement') as SiteAdapter['findMessageElement'],
    listAssistantMessages: safe('listAssistantMessages', (v) => !Array.isArray(v) || v.length === 0) as SiteAdapter['listAssistantMessages'],
    getMessageRole: safe('getMessageRole') as SiteAdapter['getMessageRole'],
    isStreaming: safe('isStreaming', (v) => typeof v !== 'boolean') as SiteAdapter['isStreaming'],
    getMessageMarkdown: safe('getMessageMarkdown', (v) => typeof v !== 'string') as SiteAdapter['getMessageMarkdown'],
    getPrecedingUserMessage: safe('getPrecedingUserMessage', () => false) as SiteAdapter['getPrecedingUserMessage'],
    getThemeHint: safe('getThemeHint', () => false) as SiteAdapter['getThemeHint'],
  };
}
