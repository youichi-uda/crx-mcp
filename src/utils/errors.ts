export class CrxMcpError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'CrxMcpError';
  }
}

export class BrowserNotLaunchedError extends CrxMcpError {
  constructor() {
    super(
      'Browser not launched. Call extension_load first.',
      'BROWSER_NOT_LAUNCHED',
    );
  }
}

export class ExtensionNotLoadedError extends CrxMcpError {
  constructor() {
    super(
      'Extension not loaded. Call extension_load first.',
      'EXTENSION_NOT_LOADED',
    );
  }
}

export class ServiceWorkerNotFoundError extends CrxMcpError {
  constructor() {
    super(
      'Service Worker not found or inactive.',
      'SW_NOT_FOUND',
    );
  }
}

export function formatError(error: unknown): string {
  if (error instanceof CrxMcpError) {
    return `[${error.code}] ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
