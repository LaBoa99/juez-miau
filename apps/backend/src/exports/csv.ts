// RFC 4180: comillas si hay coma, comilla o salto de línea. BOM para que Excel lea UTF-8 (acentos)
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
    const escape = (value: string | number | null) => {
        const text = value === null ? '' : String(value)
        return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text
    }
    return '﻿' + [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n') + '\r\n'
}
