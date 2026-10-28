import type { ScalarType, TypeRef } from '@concurso/shared-types'
import { collectTypes, quote, RESULT_PATH, typeKey, type DriverBuilder } from './driver.types.js'

// El participante escribe `class Main` (sin namespace) con un método estático; el driver es
// otra clase y el csproj la marca como punto de entrada, así un Main() del participante no estorba

const SCALARS: Record<ScalarType, string> = {
    int: 'int',
    long: 'long',
    float: 'double',
    bool: 'bool',
    string: 'string',
}

export function csharpType(type: TypeRef): string {
    return type.type === 'array' ? csharpType(type.items) + '[]' : SCALARS[type.type]
}

function readExpr(type: TypeRef): string {
    return type.type === 'array' ? 'R' + typeKey(type) + '(r)' : 'r.R' + typeKey(type) + '()'
}

function arrayFunctions(type: Extract<TypeRef, { type: 'array' }>): string {
    const key = typeKey(type)
    const items = csharpType(type.items)
    return `
    static ${csharpType(type)} R${key}(Reader r)
    {
        r.Expect('[');
        var a = new List<${items}>();
        if (!r.Try(']'))
        {
            do { a.Add(${readExpr(type.items)}); } while (r.Try(','));
            r.Expect(']');
        }
        return a.ToArray();
    }

    static void W${key}(StringBuilder o, ${csharpType(type)} a)
    {
        if (a == null) { o.Append("null"); return; }
        o.Append('[');
        for (int i = 0; i < a.Length; i++)
        {
            if (i > 0) o.Append(',');
            W${typeKey(type.items)}(o, a[i]);
        }
        o.Append(']');
    }
`
}

const RUNTIME = `
    sealed class Reader
    {
        readonly string s;
        int p;

        public Reader(string s) { this.s = s; }

        void Ws() { while (p < s.Length && s[p] <= ' ') p++; }

        public void Expect(char c)
        {
            Ws();
            if (p >= s.Length || s[p] != c) throw new FormatException("judge: expected " + c + " at " + p);
            p++;
        }

        public bool Try(char c)
        {
            Ws();
            if (p < s.Length && s[p] == c) { p++; return true; }
            return false;
        }

        string Num()
        {
            Ws();
            int a = p;
            while (p < s.Length && "+-0123456789.eE".IndexOf(s[p]) >= 0) p++;
            return s.Substring(a, p - a);
        }

        public int RI() => int.Parse(Num(), CultureInfo.InvariantCulture);
        public long RL() => long.Parse(Num(), CultureInfo.InvariantCulture);
        public double RD() => double.Parse(Num(), NumberStyles.Float, CultureInfo.InvariantCulture);

        public bool RB()
        {
            Ws();
            if (string.CompareOrdinal(s, p, "true", 0, 4) == 0) { p += 4; return true; }
            if (string.CompareOrdinal(s, p, "false", 0, 5) == 0) { p += 5; return false; }
            throw new FormatException("judge: expected bool at " + p);
        }

        public string RS()
        {
            Expect('"');
            var b = new StringBuilder();
            while (true)
            {
                char c = s[p++];
                if (c == '"') break;
                if (c != '\\\\') { b.Append(c); continue; }
                char e = s[p++];
                switch (e)
                {
                    case 'n': b.Append('\\n'); break;
                    case 't': b.Append('\\t'); break;
                    case 'r': b.Append('\\r'); break;
                    case 'b': b.Append('\\b'); break;
                    case 'f': b.Append('\\f'); break;
                    case 'u': b.Append((char)Convert.ToInt32(s.Substring(p, 4), 16)); p += 4; break;
                    default: b.Append(e); break;
                }
            }
            return b.ToString();
        }

        public void Key(string k)
        {
            if (RS() != k) throw new FormatException("judge: expected key " + k);
            Expect(':');
        }
    }

    static void WI(StringBuilder o, int v) => o.Append(v.ToString(CultureInfo.InvariantCulture));
    static void WL(StringBuilder o, long v) => o.Append(v.ToString(CultureInfo.InvariantCulture));
    static void WB(StringBuilder o, bool v) => o.Append(v ? "true" : "false");

    static void WD(StringBuilder o, double v)
    {
        if (double.IsNaN(v) || double.IsInfinity(v)) o.Append("null");
        else o.Append(v.ToString("R", CultureInfo.InvariantCulture));
    }

    static void WS(StringBuilder o, string v)
    {
        if (v == null) { o.Append("null"); return; }
        o.Append('"');
        foreach (char c in v)
        {
            switch (c)
            {
                case '"': o.Append("\\\\\\""); break;
                case '\\\\': o.Append("\\\\\\\\"); break;
                case '\\n': o.Append("\\\\n"); break;
                case '\\r': o.Append("\\\\r"); break;
                case '\\t': o.Append("\\\\t"); break;
                default:
                    if (c < 0x20) o.Append("\\\\u").Append(((int)c).ToString("x4"));
                    else o.Append(c);
                    break;
            }
        }
        o.Append('"');
    }
`

const CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>disable</Nullable>
    <AssemblyName>Main</AssemblyName>
    <StartupObject>JudgeDriver</StartupObject>
    <InvariantGlobalization>true</InvariantGlobalization>
  </PropertyGroup>
</Project>
`

export const buildCSharpProgram: DriverBuilder = ({ signature, source }) => {
    const arrays = collectTypes(signature)
        .filter((type): type is Extract<TypeRef, { type: 'array' }> => type.type === 'array')
        .map(arrayFunctions)
        .join('')

    const reads = signature.params.map((param, index) => [
        index > 0 ? '        r.Expect(\',\');' : null,
        '        r.Key(' + quote(param.name) + ');',
        '        ' + csharpType(param.type) + ' p' + index + ' = ' + readExpr(param.type) + ';',
    ].filter(Boolean).join('\n')).join('\n')

    const args = signature.params.map((_, index) => 'p' + index).join(', ')

    const driver = `using System.Globalization;
using System.Text;

public static class JudgeDriver
{
${RUNTIME}${arrays}
    static void Run()
    {
        using var input = new MemoryStream();
        Console.OpenStandardInput().CopyTo(input);
        var r = new Reader(Encoding.UTF8.GetString(input.ToArray()));
        r.Expect('{');
${reads}
        r.Expect('}');
        var o = new StringBuilder();
        W${typeKey(signature.returns)}(o, global::Main.${signature.functionName}(${args}));
        File.WriteAllText(${quote(RESULT_PATH)}, o.ToString(), new UTF8Encoding(false));
    }

    // Hilo con stack de 256 MB, como -Xss64m en Java: la recursión profunda no truena antes de tiempo.
    // Una excepción sin atrapar en el hilo termina el proceso con código distinto de 0 (RE)
    public static void Main()
    {
        var thread = new Thread(Run, 256 * 1024 * 1024);
        thread.Start();
        thread.Join();
    }
}
`

    return {
        files: { 'Main.cs': source, 'JudgeDriver.cs': driver, 'Main.csproj': CSPROJ },
        compileCmd: 'dotnet build Main.csproj -c Release -o out --nologo -v q',
        runCmd: 'dotnet out/Main.dll',
    }
}
