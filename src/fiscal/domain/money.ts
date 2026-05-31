import { Brand } from "./brands";

export type BRLCents = Brand<bigint, "BRLCents">;

export function brlCents(value: bigint): BRLCents {
  return value as BRLCents;
}

export function brlFromNumber(value: number): BRLCents {
  if (!Number.isFinite(value)) throw new Error("Invalid BRL value");
  return brlCents(BigInt(Math.round(value * 100)));
}

export function brlAdd(a: BRLCents, b: BRLCents): BRLCents {
  return brlCents((a as bigint) + (b as bigint));
}

export function brlSub(a: BRLCents, b: BRLCents): BRLCents {
  return brlCents((a as bigint) - (b as bigint));
}

export function brlToNumber(value: BRLCents): number {
  return Number(value as bigint) / 100;
}

