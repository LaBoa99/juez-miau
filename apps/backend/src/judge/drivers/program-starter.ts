import type { IProblemSignature, ScalarType, TypeRef } from '@concurso/shared-types'
import { javaType } from './java.driver.js'
import { csharpType } from './csharp.driver.js'
import { cppType } from './cpp.driver.js'
import { outputHint } from './starter-notes.js'

// Plantilla de programa completo (docs/design/programa-completo.md §5): ya lee los parámetros en el orden de la
// firma con el formato de full-program.ts (un array es su cantidad y luego sus elementos). El participante solo
// escribe la lógica y la salida.

const KEEP = '───── NO TOCAR estas líneas ni cambiar su orden ─────'

// Dónde va la solución y qué imprimir. La primera línea la buscan las pruebas para meter código
function solveHere(comment: string, indent: string, out: string, returns: TypeRef, languageCode: string): string[] {
    return [
        indent + comment + ' ───── Escribe tu solución aquí ─────',
        indent + comment + ' ' + outputHint(returns, languageCode) + ' Usa ' + out + '.',
        indent + comment + ' Si antes imprimes mensajes no pasa nada: el juez solo revisa lo último que imprimas.',
    ]
}

// Lee un valor de `type` en la variable `name`. En una lista, `count` es la variable que ya tiene su cantidad (el int
// marcado como su tamaño); sin él, la lista empieza con su propia línea de cantidad, que se guarda en <name>Cantidad.
// La cantidad manda: un for con índice toma exactamente esos elementos y lo que sobre en la línea se ignora
type Reader = (type: TypeRef, name: string, indent: string, depth: number, count?: string) => string[]

type NumberOrBool = Exclude<ScalarType, 'string'>

// Array de números o bool: sus elementos van en una sola línea
const isFlat = (type: TypeRef) => type.type === 'array' && type.items.type !== 'array' && type.items.type !== 'string'
const itemName = (depth: number) => 'elemento' + (depth === 0 ? '' : depth + 1)
const loopVar = (depth: number) => 'ijklmn'[depth]
const IN = '    '

// ─── Python ─────────────────────────────────────────────────

const PY_SCALAR: Record<ScalarType, string> = {
    int: 'int(input())',
    long: 'int(input())',
    float: 'float(input())',
    bool: 'input() == "true"',
    string: 'input()',
}
const PY_ITEM: Record<NumberOrBool, (text: string) => string> = {
    int: (text) => 'int(' + text + ')',
    long: (text) => 'int(' + text + ')',
    float: (text) => 'float(' + text + ')',
    bool: (text) => text + ' == "true"',
}

const python: Reader = (type, name, indent, depth, count) => {
    if(type.type !== 'array') return [indent + name + ' = ' + PY_SCALAR[type.type]]
    const total = count ?? name + 'Cantidad'
    const v = loopVar(depth)
    const lines = count ? [] : [indent + total + ' = int(input())']
    if(isFlat(type)){
        return [
            ...lines,
            indent + name + 'Partes = input().split()',
            indent + name + ' = []',
            indent + 'for ' + v + ' in range(' + total + '):',
            indent + IN + name + '.append(' + PY_ITEM[type.items.type as NumberOrBool](name + 'Partes[' + v + ']') + ')',
        ]
    }
    const item = itemName(depth)
    return [
        ...lines,
        indent + name + ' = []',
        indent + 'for ' + v + ' in range(' + total + '):',
        ...python(type.items, item, indent + IN, depth + 1),
        indent + IN + name + '.append(' + item + ')',
    ]
}

// ─── JavaScript / TypeScript ────────────────────────────────

const JS_SCALAR: Record<ScalarType, string> = {
    int: 'Number(leer())',
    long: 'BigInt(leer())',
    float: 'Number(leer())',
    bool: "leer() === 'true'",
    string: 'leer()',
}

const TS_SCALARS: Record<ScalarType, string> = { int: 'number', long: 'bigint', float: 'number', bool: 'boolean', string: 'string' }
const tsType = (type: TypeRef): string => type.type === 'array' ? tsType(type.items) + '[]' : TS_SCALARS[type.type]

const JS_ITEM: Record<NumberOrBool, (text: string) => string> = {
    int: (text) => 'Number(' + text + ')',
    long: (text) => 'BigInt(' + text + ')',
    float: (text) => 'Number(' + text + ')',
    bool: (text) => text + " === 'true'",
}

function javascript(typed: boolean): Reader {
    const reader: Reader = (type, name, indent, depth, count) => {
        if(type.type !== 'array') return [indent + 'const ' + name + ' = ' + JS_SCALAR[type.type]]
        const total = count ?? name + 'Cantidad'
        const v = loopVar(depth)
        const lines = [
            ...(count ? [] : [indent + 'const ' + total + ' = Number(leer())']),
            ...(isFlat(type) ? [indent + 'const ' + name + 'Partes = leer().trim().split(/\\s+/)'] : []),
            indent + 'const ' + name + (typed ? ': ' + tsType(type) : '') + ' = []',
            indent + 'for (let ' + v + ' = 0; ' + v + ' < ' + total + '; ' + v + '++) {',
        ]
        if(isFlat(type)){
            return [...lines, indent + IN + name + '.push(' + JS_ITEM[type.items.type as NumberOrBool](name + 'Partes[' + v + ']') + ')', indent + '}']
        }
        const item = itemName(depth)
        return [...lines, ...reader(type.items, item, indent + IN, depth + 1), indent + IN + name + '.push(' + item + ')', indent + '}']
    }
    return reader
}

// ─── Java y C# (línea por línea) ────────────────────────────

interface LineLanguage {
    type: (type: TypeRef) => string
    line: string
    parse: (scalar: ScalarType, text: string) => string
    trim: string
    split: string
}

const JAVA: LineLanguage = {
    type: javaType,
    line: 'entrada.readLine()',
    parse: (scalar, text) => ({
        int: 'Integer.parseInt(' + text + ')',
        long: 'Long.parseLong(' + text + ')',
        float: 'Double.parseDouble(' + text + ')',
        bool: text + '.equals("true")',
        string: text,
    })[scalar],
    trim: '.trim()',
    split: '.trim().split(" +")',
}

const CSHARP: LineLanguage = {
    type: csharpType,
    line: 'Console.ReadLine()',
    parse: (scalar, text) => ({
        int: 'int.Parse(' + text + ')',
        long: 'long.Parse(' + text + ')',
        float: 'double.Parse(' + text + ', CultureInfo.InvariantCulture)',
        bool: text + ' == "true"',
        string: text,
    })[scalar],
    trim: '.Trim()',
    split: ".Split(' ', StringSplitOptions.RemoveEmptyEntries)",
}

function lineReader(lang: LineLanguage): Reader {
    const reader: Reader = (type, name, indent, depth, count) => {
        if(type.type !== 'array'){
            const text = type.type === 'string' ? lang.line : lang.line + lang.trim
            return [indent + lang.type(type) + ' ' + name + ' = ' + lang.parse(type.type, text) + ';']
        }
        const total = count ?? name + 'Cantidad'
        const v = loopVar(depth)
        const loop = indent + 'for (int ' + v + ' = 0; ' + v + ' < ' + total + '; ' + v + '++)'
        const lines = [
            ...(count ? [] : [indent + 'int ' + total + ' = ' + lang.parse('int', lang.line + lang.trim) + ';']),
            // int[][] → new int[cantidad][]
            indent + lang.type(type) + ' ' + name + ' = new ' + lang.type(type).replace('[]', '[' + total + ']') + ';',
        ]
        if(isFlat(type)){
            return [
                ...lines,
                indent + lang.type({ type: 'array', items: { type: 'string' } }) + ' ' + name + 'Partes = ' + lang.line + lang.split + ';',
                loop + ' ' + name + '[' + v + '] = ' + lang.parse(type.items.type as ScalarType, name + 'Partes[' + v + ']') + ';',
            ]
        }
        const item = itemName(depth)
        return [
            ...lines,
            loop + ' {',
            ...reader(type.items, item, indent + IN, depth + 1),
            indent + IN + name + '[' + v + '] = ' + item + ';',
            indent + '}',
        ]
    }
    return reader
}

// ─── C++ y C (por palabras) ─────────────────────────────────

// getline (C++) y leerLinea (C) consumen el fin de su línea; cin >> y scanf lo dejan pendiente. Un string y un array
// siempre terminan su línea: el array salta el resto tras su cantidad y tras sus elementos (lo que sobre se ignora, y
// la línea de un array vacío viene vacía). Antes de un string, o de un array sin línea de cantidad, se salta el fin
// de la línea del escalar anterior
const hasString = (type: TypeRef): boolean => type.type === 'string' || (type.type === 'array' && hasString(type.items))
const endsLine = (type: TypeRef): boolean => type.type === 'string' || type.type === 'array'
// Saltan lo que quede de la línea (también un \r o espacios al final), no solo un carácter
const CPP_SKIP = "cin.ignore(numeric_limits<streamsize>::max(), '\\n');"
const C_SKIP = 'scanf("%*[^\\n]"); getchar();'

function cpp(): Reader {
    const reader: Reader = (type, name, indent, depth, count) => {
        switch(type.type){
            case 'bool':
                return [indent + 'string ' + name + 'Texto;', indent + 'cin >> ' + name + 'Texto;', indent + 'bool ' + name + ' = ' + name + 'Texto == "true";']
            case 'string':
                return [indent + 'string ' + name + ';', indent + 'getline(cin, ' + name + ');']
            case 'array': {
                const item = itemName(depth)
                const v = loopVar(depth)
                const total = count ?? name + 'Cantidad'
                return [
                    ...(count ? [] : [indent + 'int ' + total + ';', indent + 'cin >> ' + total + ';', indent + CPP_SKIP]),
                    indent + cppType(type).replaceAll('std::', '') + ' ' + name + '(' + total + ');',
                    indent + 'for (int ' + v + ' = 0; ' + v + ' < ' + total + '; ' + v + '++) {',
                    ...reader(type.items, item, indent + IN, depth + 1),
                    indent + IN + name + '[' + v + '] = ' + item + ';',
                    indent + '}',
                    ...(isFlat(type) ? [indent + CPP_SKIP] : []),
                ]
            }
            default:
                return [indent + cppType(type).replaceAll('std::', '') + ' ' + name + ';', indent + 'cin >> ' + name + ';']
        }
    }
    return reader
}

const C_SCALAR: Record<ScalarType, string> = { int: 'int', long: 'long long', float: 'double', bool: 'int', string: 'char *' }
const C_FORMAT: Record<NumberOrBool, string> = { int: '%d', long: '%lld', float: '%lf', bool: '' }
const cType = (type: TypeRef): string => type.type === 'array' ? cType(type.items).trimEnd() + ' *' : C_SCALAR[type.type]
const cDeclare = (type: TypeRef, name: string) => (cType(type).endsWith('*') ? cType(type) : cType(type) + ' ') + name

const C_READ_LINE = [
    '// Lee una línea completa, de cualquier largo, sin el salto de línea',
    'char *leerLinea(void) {',
    IN + 'int largo = 0, capacidad = 16, letra;',
    IN + 'char *linea = malloc(capacidad);',
    IN + "while ((letra = getchar()) != EOF && letra != '\\n') {",
    IN + IN + 'if (largo + 1 == capacidad) {',
    IN + IN + IN + 'capacidad *= 2;',
    IN + IN + IN + 'linea = realloc(linea, capacidad);',
    IN + IN + '}',
    IN + IN + 'linea[largo++] = letra;',
    IN + '}',
    IN + "linea[largo] = '\\0';",
    IN + 'return linea;',
    '}',
    '',
]

// shortcut: en arrays de arrays solo se guarda la cantidad de cada fila (nameCantidades); con 3 niveles o más se
// pierden las del nivel más interno. Suficiente para matrices; si hace falta, guardar un arreglo de cantidades por nivel
function c(): Reader {
    const reader: Reader = (type, name, indent, depth, count) => {
        switch(type.type){
            case 'bool':
                return [indent + 'char ' + name + 'Texto[6];', indent + 'scanf("%5s", ' + name + 'Texto);', indent + 'int ' + name + ' = strcmp(' + name + 'Texto, "true") == 0;']
            case 'string':
                return [indent + 'char *' + name + ' = leerLinea();']
            case 'array': {
                const item = itemName(depth)
                const v = loopVar(depth)
                const rows = type.items.type === 'array'
                const total = count ?? name + 'Cantidad'
                return [
                    ...(count ? [] : [indent + 'int ' + total + ';', indent + 'scanf("%d", &' + total + ');', indent + C_SKIP]),
                    indent + cDeclare(type, name) + ' = malloc(' + total + ' * sizeof(' + cType(type.items).trimEnd() + '));',
                    ...(rows ? [indent + 'int *' + name + 'Cantidades = malloc(' + total + ' * sizeof(int));'] : []),
                    indent + 'for (int ' + v + ' = 0; ' + v + ' < ' + total + '; ' + v + '++) {',
                    ...reader(type.items, item, indent + IN, depth + 1),
                    indent + IN + name + '[' + v + '] = ' + item + ';',
                    ...(rows ? [indent + IN + name + 'Cantidades[' + v + '] = ' + item + 'Cantidad;'] : []),
                    indent + '}',
                    ...(isFlat(type) ? [indent + C_SKIP] : []),
                ]
            }
            default:
                return [indent + cDeclare(type, name) + ';', indent + 'scanf("' + C_FORMAT[type.type] + '", &' + name + ');']
        }
    }
    return reader
}

// C y C++: un string, o un array cuya cantidad ya se leyó (su tamaño), que sigue a un parámetro leído por palabras
// salta antes el fin de esa línea
function wordReads(read: Reader, skip: string, signature: IProblemSignature, indent: string): string[] {
    return signature.params.flatMap((param, index) => {
        const lines = read(param.type, param.name, indent, 0, param.size)
        const before = signature.params[index - 1]
        const startsLine = param.type.type === 'string' || param.size !== undefined
        return startsLine && before && !endsLine(before.type) ? [indent + skip, ...lines] : lines
    })
}

// ─── Plantillas ─────────────────────────────────────────────

function reads(reader: Reader, signature: IProblemSignature, indent: string): string[] {
    return signature.params.flatMap((param) => reader(param.type, param.name, indent, 0, param.size))
}

export function programStarterCode(languageCode: string, signature: IProblemSignature): string | null {
    switch(languageCode){
        case 'python':
            return ['# ' + KEEP, ...reads(python, signature, ''), '', ...solveHere('#', '', 'print', signature.returns, languageCode), '', ''].join('\n')
        case 'javascript':
        case 'typescript': {
            const typed = languageCode === 'typescript'
            return [
                "import { readFileSync } from 'node:fs'",
                '',
                "const lineas = readFileSync(0, 'utf8').split(/\\r?\\n/)",
                'let linea = 0',
                'const leer = ()' + (typed ? ': string' : '') + ' => lineas[linea++]',
                '',
                '// ' + KEEP,
                ...reads(javascript(typed), signature, ''),
                '',
                ...solveHere('//', '', 'console.log', signature.returns, languageCode),
                '',
                '',
            ].join('\n')
        }
        case 'java':
            return [
                'import java.io.*;',
                '',
                'public class Main {',
                IN + 'public static void main(String[] args) throws IOException {',
                IN + IN + 'BufferedReader entrada = new BufferedReader(new InputStreamReader(System.in));',
                '',
                IN + IN + '// ' + KEEP,
                ...reads(lineReader(JAVA), signature, IN + IN),
                '',
                ...solveHere('//', IN + IN, 'System.out.println', signature.returns, languageCode),
                '',
                IN + '}',
                '}',
                '',
            ].join('\n')
        case 'csharp':
            return [
                'using System;',
                'using System.Globalization;',
                '',
                'class Programa',
                '{',
                IN + 'static void Main()',
                IN + '{',
                IN + IN + '// ' + KEEP,
                ...reads(lineReader(CSHARP), signature, IN + IN),
                '',
                ...solveHere('//', IN + IN, 'Console.WriteLine', signature.returns, languageCode),
                '',
                IN + '}',
                '}',
                '',
            ].join('\n')
        case 'cpp':
            return [
                '#include <bits/stdc++.h>',
                'using namespace std;',
                '',
                'int main() {',
                IN + '// ' + KEEP,
                ...wordReads(cpp(), CPP_SKIP, signature, IN),
                '',
                ...solveHere('//', IN, 'cout', signature.returns, languageCode),
                '',
                IN + 'return 0;',
                '}',
                '',
            ].join('\n')
        case 'c':
            return [
                '#include <stdio.h>',
                '#include <stdlib.h>',
                '#include <string.h>',
                '',
                ...(signature.params.some((param) => hasString(param.type)) ? C_READ_LINE : []),
                'int main(void) {',
                IN + '// ' + KEEP,
                ...wordReads(c(), C_SKIP, signature, IN),
                '',
                ...solveHere('//', IN, 'printf', signature.returns, languageCode),
                '',
                IN + 'return 0;',
                '}',
                '',
            ].join('\n')
        default:
            return null
    }
}
