import type { ScalarType, TypeRef } from '@concurso/shared-types'
import { quote, RESULT_PATH, type DriverBuilder, type DriverInput } from './driver.types.js'

// El participante escribe la función libre en Main.cpp. driver.cpp lo incluye en la misma
// unidad de compilación: la función puede recibir por valor, por referencia o por referencia
// constante, y un main() propio del participante no estorba.
// El lector y el escritor son plantillas definidas antes de incluir Main.cpp; los parámetros se
// declaran después, así un `#define int long long` del participante aplica a los dos lados

const SCALARS: Record<ScalarType, string> = {
    int: 'int',
    long: 'long long',
    float: 'double',
    bool: 'bool',
    string: 'std::string',
}

export function cppType(type: TypeRef): string {
    return type.type === 'array' ? 'std::vector<' + cppType(type.items) + '>' : SCALARS[type.type]
}

export const JUDGE_HPP = `#ifndef JUDGE_HPP
#define JUDGE_HPP

#include <string>
#include <vector>

#endif
`

const RUNTIME = `#include "judge.hpp"
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <type_traits>
#include <utility>

namespace jd {

static const char *p;
static std::string out;

[[noreturn]] static void fail(const char *what) {
    std::fprintf(stderr, "judge: invalid input (%s)\\n", what);
    std::exit(97);
}

static void ws() { while (*p && (unsigned char)*p <= ' ') p++; }

static void expect(char c) {
    ws();
    if (*p != c) fail("unexpected character");
    p++;
}

static bool tryc(char c) {
    ws();
    if (*p == c) { p++; return true; }
    return false;
}

template <class T>
typename std::enable_if<std::is_integral<T>::value && !std::is_same<T, bool>::value>::type rd(T &v) {
    char *end;
    ws();
    long long x = std::strtoll(p, &end, 10);
    if (end == p) fail("integer");
    p = end;
    v = (T)x;
}

template <class T>
typename std::enable_if<std::is_floating_point<T>::value>::type rd(T &v) {
    char *end;
    ws();
    double x = std::strtod(p, &end);
    if (end == p) fail("float");
    p = end;
    v = (T)x;
}

static void rd(bool &v) {
    ws();
    if (std::strncmp(p, "true", 4) == 0) { v = true; p += 4; }
    else if (std::strncmp(p, "false", 5) == 0) { v = false; p += 5; }
    else fail("bool");
}

static unsigned hex4() {
    unsigned v = 0;
    for (int i = 0; i < 4; i++) {
        char c = *p++;
        v <<= 4;
        if (c >= '0' && c <= '9') v |= (unsigned)(c - '0');
        else if (c >= 'a' && c <= 'f') v |= (unsigned)(c - 'a' + 10);
        else if (c >= 'A' && c <= 'F') v |= (unsigned)(c - 'A' + 10);
        else fail("\\\\u escape");
    }
    return v;
}

static void utf8(std::string &s, unsigned cp) {
    if (cp < 0x80) { s += (char)cp; return; }
    if (cp < 0x800) { s += (char)(0xC0 | (cp >> 6)); s += (char)(0x80 | (cp & 0x3F)); return; }
    if (cp < 0x10000) {
        s += (char)(0xE0 | (cp >> 12)); s += (char)(0x80 | ((cp >> 6) & 0x3F)); s += (char)(0x80 | (cp & 0x3F));
        return;
    }
    s += (char)(0xF0 | (cp >> 18)); s += (char)(0x80 | ((cp >> 12) & 0x3F));
    s += (char)(0x80 | ((cp >> 6) & 0x3F)); s += (char)(0x80 | (cp & 0x3F));
}

static void rd(std::string &v) {
    v.clear();
    expect('"');
    for (;;) {
        char c = *p++;
        if (c == 0) fail("string");
        if (c == '"') break;
        if (c != '\\\\') { v += c; continue; }
        c = *p++;
        switch (c) {
            case 'n': v += '\\n'; break;
            case 't': v += '\\t'; break;
            case 'r': v += '\\r'; break;
            case 'b': v += '\\b'; break;
            case 'f': v += '\\f'; break;
            case 'u': {
                unsigned cp = hex4();
                if (cp >= 0xD800 && cp < 0xDC00 && p[0] == '\\\\' && p[1] == 'u') {
                    p += 2;
                    cp = 0x10000 + ((cp - 0xD800) << 10) + (hex4() - 0xDC00);
                }
                utf8(v, cp);
                break;
            }
            default: v += c;
        }
    }
}

template <class T>
void rd(std::vector<T> &v) {
    v.clear();
    expect('[');
    if (!tryc(']')) {
        do {
            T x;
            rd(x);
            v.push_back(std::move(x));
        } while (tryc(','));
        expect(']');
    }
}

static void key(const char *k) {
    std::string got;
    rd(got);
    if (got != k) fail("key");
    expect(':');
}

template <class T>
typename std::enable_if<std::is_integral<T>::value && !std::is_same<T, bool>::value>::type wr(T v) {
    out += std::to_string(v);
}

template <class T>
typename std::enable_if<std::is_floating_point<T>::value>::type wr(T v) {
    if (!std::isfinite((double)v)) { out += "null"; return; }
    char t[32];
    std::snprintf(t, sizeof t, "%.17g", (double)v);
    out += t;
}

static void wr(bool v) { out += v ? "true" : "false"; }

static void wr(const char *v) {
    if (!v) { out += "null"; return; }
    out += '"';
    for (const unsigned char *c = (const unsigned char *)v; *c; c++) {
        switch (*c) {
            case '"': out += "\\\\\\""; break;
            case '\\\\': out += "\\\\\\\\"; break;
            case '\\n': out += "\\\\n"; break;
            case '\\r': out += "\\\\r"; break;
            case '\\t': out += "\\\\t"; break;
            default:
                if (*c < 0x20) { char t[8]; std::snprintf(t, sizeof t, "\\\\u%04x", *c); out += t; }
                else out += (char)*c;
        }
    }
    out += '"';
}

static void wr(const std::string &v) { wr(v.c_str()); }

template <class T>
void wr(const std::vector<T> &v) {
    out += '[';
    for (size_t i = 0; i < v.size(); i++) {
        if (i > 0) out += ',';
        wr(v[i]);
    }
    out += ']';
}

}  // namespace jd
`

// Generador: std::string caso(...) con los parámetros del problema; escribe en su propio búfer
function casoFunction(caseSignature: DriverInput['caseSignature']): string {
    if(!caseSignature) return ''
    const params = caseSignature.params.map((param, index) => cppType(param.type) + ' jd_a' + index).join(', ')
    const writes = caseSignature.params.map((param, index) =>
        '    jd::out += ' + quote((index > 0 ? ',' : '') + JSON.stringify(param.name) + ':') + ';\n    jd::wr(jd_a' + index + ');').join('\n')
    return `
static std::string caso(${params}) {
    std::string jd_saved;
    std::swap(jd_saved, jd::out);
    jd::out += '{';
${writes}
    jd::out += '}';
    std::swap(jd_saved, jd::out);
    return jd_saved;
}
`
}

export const buildCppProgram: DriverBuilder = ({ signature, source, flags, caseSignature }) => {
    const reads = signature.params.map((param, index) => [
        index > 0 ? '    jd::expect(\',\');' : null,
        '    ' + cppType(param.type) + ' p' + index + ';',
        '    jd::key(' + quote(param.name) + ');',
        '    jd::rd(p' + index + ');',
    ].filter(Boolean).join('\n')).join('\n')

    const args = signature.params.map((_, index) => 'p' + index).join(', ')

    const driver = `${RUNTIME}${casoFunction(caseSignature)}
#define main judge_user_main
#include "Main.cpp"
#undef main

// signed: un "#define int long long" del participante no lo cambia
signed main() {
    std::string jd_in;
    char jd_buf[1 << 16];
    size_t jd_got;
    while ((jd_got = std::fread(jd_buf, 1, sizeof jd_buf, stdin)) > 0) jd_in.append(jd_buf, jd_got);
    jd::p = jd_in.c_str();

    jd::expect('{');
${reads}
    jd::expect('}');

    jd::wr(${signature.functionName}(${args}));

    std::FILE *jd_f = std::fopen(${quote(RESULT_PATH)}, "wb");
    if (!jd_f) return 98;
    std::fwrite(jd::out.data(), 1, jd::out.size(), jd_f);
    std::fclose(jd_f);
    return 0;
}
`

    return {
        files: { 'Main.cpp': source, 'judge.hpp': JUDGE_HPP, 'driver.cpp': driver },
        compileCmd: ('g++ driver.cpp -o main ' + flags).trim(),
        runCmd: './main',
    }
}
