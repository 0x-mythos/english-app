// Транскрипція в даних буває з /…/, […] або без них; показуємо завжди як /…/.
export function formatIpa(raw: string): string {
  const core = raw.trim().replace(/^[/[\]\s]+|[/[\]\s]+$/g, "");
  return core ? `/${core}/` : "";
}
