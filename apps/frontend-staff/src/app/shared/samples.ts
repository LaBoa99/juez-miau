// Presentación de la entrada de un caso. Los datos viajan como JSON canónico ({"nums":[2,7],"k":9});
// al concursante y al juez se les muestra un parámetro por línea ("nums = [2,7]", "k = 9"), sin la
// estructura JSON. Se trabaja sobre el texto, sin parsear números, para no perder precisión en los long.
export function formatCaseInput(json: string): string {
  const text = json.trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return json;
  const lines: string[] = [];
  for (const member of splitTopLevel(text.slice(1, -1))) {
    const match = /^\s*"((?:[^"\\]|\\.)*)"\s*:\s*([\s\S]*)$/.exec(member);
    if (!match) return json;
    lines.push(`${match[1]} = ${match[2].trim()}`);
  }
  return lines.join('\n');
}

// Separa por comas de primer nivel, respetando cadenas, arreglos y objetos.
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  if (body.slice(start).trim()) parts.push(body.slice(start));
  return parts;
}
