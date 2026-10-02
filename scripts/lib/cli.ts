import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ValidationIssue } from '@sprout/schema';
import { errorMessage } from './io';

export function isMain(url: string): boolean {
  return !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(url);
}

export function runCli(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    console.error(`错误：${errorMessage(error)}`);
    process.exitCode = 1;
  });
}

export function printIssues(issues: readonly ValidationIssue[]): void {
  for (const issue of issues) {
    console.log(`[${issue.level === 'error' ? '错误' : '警告'}] ${issue.path || '.'}：${issue.message}`);
  }
}

export function failure(issues: readonly ValidationIssue[], strict = false): boolean {
  return issues.some((issue) => issue.level === 'error' || strict);
}
