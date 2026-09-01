import { expect } from "vitest";

export function requireValue<T>(
  value: T | null | undefined,
  message = "Expected value to be present",
): T {
  expect(value).toBeDefined();
  if (value === undefined || value === null) throw new Error(message);
  return value;
}
