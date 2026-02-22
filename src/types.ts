import type { Browser, Page, Target } from 'puppeteer-core';

export interface CLIOptions {
  extensionPath?: string;
  chromePath?: string;
  userDataDir?: string;
  noSandbox?: boolean;
  verbose?: boolean;
}

export interface ConsoleEntry {
  timestamp: number;
  source: ConsoleSource;
  level: ConsoleLevel;
  text: string;
  url?: string;
}

export type ConsoleSource = 'page' | 'service-worker' | 'popup' | 'sidepanel' | 'content-script';
export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface NetworkEntry {
  timestamp: number;
  method: string;
  url: string;
  status?: number;
  mimeType?: string;
  size?: number;
}

export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  manifestPath: string;
}
