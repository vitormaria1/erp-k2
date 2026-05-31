export type Brand<K, T> = K & { readonly __brand: T };

export type Uuid = Brand<string, "Uuid">;

export function asUuid(value: string): Uuid {
  return value as Uuid;
}

