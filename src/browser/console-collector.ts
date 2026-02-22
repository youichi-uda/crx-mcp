import type { CDPSession, Page } from 'puppeteer-core';
import type { ConsoleEntry, ConsoleLevel, ConsoleSource } from '../types.js';

const MAX_ENTRIES = 1000;

const LEVEL_MAP: Record<string, ConsoleLevel> = {
  log: 'log',
  info: 'info',
  warn: 'warn',
  warning: 'warn',
  error: 'error',
  debug: 'debug',
  verbose: 'debug',
  dir: 'log',
  table: 'log',
  trace: 'debug',
  assert: 'error',
};

function toLevel(raw: string): ConsoleLevel {
  return LEVEL_MAP[raw] ?? 'log';
}

export class ConsoleCollector {
  private entries: ConsoleEntry[] = [];

  add(source: ConsoleSource, level: ConsoleLevel, text: string, url?: string): void {
    this.entries.push({ timestamp: Date.now(), source, level, text, url });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
  }

  attachToPage(page: Page, source: ConsoleSource): void {
    page.on('console', (msg) => {
      this.add(source, toLevel(msg.type()), msg.text(), page.url());
    });
    page.on('pageerror', ((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.add(source, 'error', message, page.url());
    }) as any);
  }

  attachToWorker(cdp: CDPSession, source: ConsoleSource, url?: string): void {
    cdp.on('Runtime.consoleAPICalled', (event: any) => {
      const level = toLevel(event.type as string);
      const text = event.args
        .map((arg: any) => arg.value ?? arg.description ?? '')
        .join(' ');
      this.add(source, level, text, url);
    });
    cdp.on('Runtime.exceptionThrown', (event: any) => {
      const desc =
        event.exceptionDetails?.exception?.description ??
        event.exceptionDetails?.text ??
        'Unknown error';
      this.add(source, 'error', desc, url);
    });
    cdp.send('Runtime.enable').catch(() => {});
  }

  getEntries(opts?: {
    source?: ConsoleSource;
    level?: ConsoleLevel;
    limit?: number;
    clear?: boolean;
    since?: number;
  }): ConsoleEntry[] {
    let result = this.entries;
    if (opts?.since) {
      result = result.filter((e) => e.timestamp >= opts.since!);
    }
    if (opts?.source) {
      result = result.filter((e) => e.source === opts.source);
    }
    if (opts?.level) {
      const levels = levelAndAbove(opts.level);
      result = result.filter((e) => levels.includes(e.level));
    }
    if (opts?.limit && opts.limit > 0) {
      result = result.slice(-opts.limit);
    }
    if (opts?.clear) {
      this.entries = [];
    }
    return result;
  }

  clear(): void {
    this.entries = [];
  }
}

function levelAndAbove(level: ConsoleLevel): ConsoleLevel[] {
  const order: ConsoleLevel[] = ['debug', 'log', 'info', 'warn', 'error'];
  const idx = order.indexOf(level);
  return idx >= 0 ? order.slice(idx) : order;
}
