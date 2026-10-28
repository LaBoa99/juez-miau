import type { ScalarType, TypeRef } from '@concurso/shared-types'
import { collectTypes, quote, RESULT_PATH, typeKey, type DriverBuilder } from './driver.types.js'

// El participante escribe `class Main` con un método estático; el driver es otra clase.
// Lee y escribe JSON con código generado para los tipos de la firma, sin dependencias

const SCALARS: Record<ScalarType, string> = {
    int: 'int',
    long: 'long',
    float: 'double',
    bool: 'boolean',
    string: 'String',
}

export function javaType(type: TypeRef): string {
    return type.type === 'array' ? javaType(type.items) + '[]' : SCALARS[type.type]
}

function readExpr(type: TypeRef): string {
    return type.type === 'array' ? 'r' + typeKey(type) + '(r)' : 'r.r' + typeKey(type) + '()'
}

// new int[8], new int[8][], new String[8][][]
function allocate(items: TypeRef, size: string): string {
    const element = javaType(items)
    const firstBracket = element.indexOf('[')
    return firstBracket < 0
        ? 'new ' + element + '[' + size + ']'
        : 'new ' + element.slice(0, firstBracket) + '[' + size + ']' + element.slice(firstBracket)
}

function arrayFunctions(type: Extract<TypeRef, { type: 'array' }>): string {
    const key = typeKey(type)
    const java = javaType(type)
    const items = typeKey(type.items)
    return `
    static ${java} r${key}(R r) {
        r.expect('[');
        ${java} a = ${allocate(type.items, '8')};
        int n = 0;
        if (!r.tryc(']')) {
            do {
                if (n == a.length) a = Arrays.copyOf(a, n * 2);
                a[n++] = ${readExpr(type.items)};
            } while (r.tryc(','));
            r.expect(']');
        }
        return Arrays.copyOf(a, n);
    }

    static void w${key}(StringBuilder o, ${java} a) {
        if (a == null) { o.append("null"); return; }
        o.append('[');
        for (int i = 0; i < a.length; i++) {
            if (i > 0) o.append(',');
            w${items}(o, a[i]);
        }
        o.append(']');
    }
`
}

const RUNTIME = `
    static final class R {
        final String s;
        int p;

        R(String s) { this.s = s; }

        void ws() { while (p < s.length() && s.charAt(p) <= ' ') p++; }

        void expect(char c) {
            ws();
            if (p >= s.length() || s.charAt(p) != c) throw new IllegalStateException("judge: expected " + c + " at " + p);
            p++;
        }

        boolean tryc(char c) {
            ws();
            if (p < s.length() && s.charAt(p) == c) { p++; return true; }
            return false;
        }

        String num() {
            ws();
            int a = p;
            while (p < s.length() && "+-0123456789.eE".indexOf(s.charAt(p)) >= 0) p++;
            return s.substring(a, p);
        }

        int rI() { return Integer.parseInt(num()); }
        long rL() { return Long.parseLong(num()); }
        double rD() { return Double.parseDouble(num()); }

        boolean rB() {
            ws();
            if (s.startsWith("true", p)) { p += 4; return true; }
            if (s.startsWith("false", p)) { p += 5; return false; }
            throw new IllegalStateException("judge: expected bool at " + p);
        }

        String rS() {
            expect('"');
            StringBuilder b = new StringBuilder();
            while (true) {
                char c = s.charAt(p++);
                if (c == '"') break;
                if (c != '\\\\') { b.append(c); continue; }
                char e = s.charAt(p++);
                switch (e) {
                    case 'n': b.append('\\n'); break;
                    case 't': b.append('\\t'); break;
                    case 'r': b.append('\\r'); break;
                    case 'b': b.append('\\b'); break;
                    case 'f': b.append('\\f'); break;
                    case 'u': b.append((char) Integer.parseInt(s.substring(p, p + 4), 16)); p += 4; break;
                    default: b.append(e);
                }
            }
            return b.toString();
        }

        void key(String k) {
            if (!rS().equals(k)) throw new IllegalStateException("judge: expected key " + k);
            expect(':');
        }
    }

    static void wI(StringBuilder o, int v) { o.append(v); }
    static void wL(StringBuilder o, long v) { o.append(v); }
    static void wB(StringBuilder o, boolean v) { o.append(v); }

    static void wD(StringBuilder o, double v) {
        if (Double.isNaN(v) || Double.isInfinite(v)) o.append("null");
        else o.append(Double.toString(v));
    }

    static void wS(StringBuilder o, String v) {
        if (v == null) { o.append("null"); return; }
        o.append('"');
        for (int i = 0; i < v.length(); i++) {
            char c = v.charAt(i);
            switch (c) {
                case '"': o.append("\\\\\\""); break;
                case '\\\\': o.append("\\\\\\\\"); break;
                case '\\n': o.append("\\\\n"); break;
                case '\\r': o.append("\\\\r"); break;
                case '\\t': o.append("\\\\t"); break;
                default:
                    if (c < 0x20) o.append(String.format("\\\\u%04x", (int) c));
                    else o.append(c);
            }
        }
        o.append('"');
    }
`

export const buildJavaProgram: DriverBuilder = ({ signature, source }) => {
    const arrays = collectTypes(signature)
        .filter((type): type is Extract<TypeRef, { type: 'array' }> => type.type === 'array')
        .map(arrayFunctions)
        .join('')

    const reads = signature.params.map((param, index) => [
        index > 0 ? '        r.expect(\',\');' : null,
        '        r.key(' + quote(param.name) + ');',
        '        ' + javaType(param.type) + ' p' + index + ' = ' + readExpr(param.type) + ';',
    ].filter(Boolean).join('\n')).join('\n')

    const args = signature.params.map((_, index) => 'p' + index).join(', ')

    const driver = `import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;

public class JudgeDriver {
${RUNTIME}${arrays}
    public static void main(String[] args) throws Exception {
        R r = new R(new String(System.in.readAllBytes(), StandardCharsets.UTF_8));
        r.expect('{');
${reads}
        r.expect('}');
        StringBuilder o = new StringBuilder();
        w${typeKey(signature.returns)}(o, Main.${signature.functionName}(${args}));
        Files.write(Paths.get(${quote(RESULT_PATH)}), o.toString().getBytes(StandardCharsets.UTF_8));
    }
}
`

    return {
        files: { 'Main.java': source, 'JudgeDriver.java': driver },
        compileCmd: 'javac -encoding UTF-8 Main.java JudgeDriver.java',
        // Sin MaxRAMPercentage la JVM usa solo 1/4 del límite del contenedor como heap
        runCmd: 'java -Xss64m -XX:+UseSerialGC -XX:MaxRAMPercentage=75 JudgeDriver',
    }
}
