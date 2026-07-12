export function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
  })[character]!);
}

export function wrapText(value: string, maxChars: number, maxLines: number) {
  const characters = Array.from(value.trim());
  const lines: string[] = [];
  while (characters.length && lines.length < maxLines) lines.push(characters.splice(0, maxChars).join(""));
  if (characters.length && lines.length) lines[lines.length - 1] = `${lines.at(-1)!.slice(0, -1)}…`;
  return lines;
}
