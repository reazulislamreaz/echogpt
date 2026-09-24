export interface ProviderHealthResult {
  healthy: boolean;
  status: 'ok' | 'misconfigured' | 'unreachable' | 'unauthorized' | 'error';
  message: string;
  latencyMs: number | null;
}

const HEALTH_TIMEOUT_MS = 8000;

/**
 * Performs a lightweight connectivity check against a known provider API.
 * Never logs or returns the API key.
 */
export async function checkProviderConnectivity(params: {
  slug: string;
  baseUrl: string | null;
  apiKey: string | null;
}): Promise<ProviderHealthResult> {
  const { slug, baseUrl, apiKey } = params;

  if (!apiKey) {
    return {
      healthy: false,
      status: 'misconfigured',
      message: 'No API key is configured for this provider',
      latencyMs: null,
    };
  }

  if (!baseUrl) {
    return {
      healthy: false,
      status: 'misconfigured',
      message: 'No base URL is configured for this provider',
      latencyMs: null,
    };
  }

  const normalizedSlug = slug.toUpperCase();
  const started = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await requestHealthProbe(normalizedSlug, baseUrl, apiKey, controller.signal);
    } finally {
      clearTimeout(timeout);
    }

    const latencyMs = Date.now() - started;

    if (response.status === 401 || response.status === 403) {
      return {
        healthy: false,
        status: 'unauthorized',
        message: 'Provider rejected the configured credentials',
        latencyMs,
      };
    }

    if (!response.ok) {
      return {
        healthy: false,
        status: 'error',
        message: `Provider returned HTTP ${response.status}`,
        latencyMs,
      };
    }

    return {
      healthy: true,
      status: 'ok',
      message: 'Provider responded successfully',
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const aborted =
      error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'));

    return {
      healthy: false,
      status: 'unreachable',
      message: aborted ? 'Provider health check timed out' : 'Unable to reach provider endpoint',
      latencyMs,
    };
  }
}

async function requestHealthProbe(
  slug: string,
  baseUrl: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<Response> {
  const root = baseUrl.replace(/\/+$/, '');

  switch (slug) {
    case 'OPENAI':
      return fetch(`${root}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal,
      });

    case 'CLAUDE':
    case 'ANTHROPIC':
      return fetch(`${root}/models`, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal,
      });

    case 'GEMINI': {
      const separator = root.includes('?') ? '&' : '?';
      return fetch(`${root}/v1beta/models${separator}key=${encodeURIComponent(apiKey)}`, {
        method: 'GET',
        signal,
      });
    }

    default:
      // Generic probe: prefer an authenticated GET against the configured base URL
      return fetch(root, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal,
      });
  }
}
