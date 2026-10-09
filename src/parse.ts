import { isAbsolute, resolve } from 'node:path';

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

export function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

export function nullableText(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  return text(value, label);
}

export function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be true or false`);
  return value;
}

export function stringList(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} must be a list of strings`);
  }
  return value.map(item => item.trim());
}

export function pathFrom(base: string, value: string): string {
  return isAbsolute(value) ? value : resolve(base, value);
}
