import { Logger } from '@nestjs/common';
import { Language } from '../../../languages/entities/language.entity.js';
import type { Seeder } from '../seeder.interface.js';

const logger = new Logger('LanguageSeeder')

// Convenciones que asume el worker:
// - El código se guarda como Main.<file_ext> en el directorio de trabajo del contenedor
// - `flags` se agrega al final de `compile_cmd`
// - Los lenguajes interpretados usan compile_cmd como chequeo de sintaxis (falla = CE)
// Imágenes según docs/design/judge-evaluation.md. Las define la imagen del backend (JUDGE_IMAGE_*,
// se cambian en deploy/.env) y el worker las descarga al arrancar; sin esas variables (desarrollo)
// se usan estos valores
const IMAGES = {
    gcc: ['JUDGE_IMAGE_GCC', 'gcc:14'],
    dotnet: ['JUDGE_IMAGE_DOTNET', 'mcr.microsoft.com/dotnet/sdk:8.0'],
    java: ['JUDGE_IMAGE_JAVA', 'eclipse-temurin:21-jdk'],
    node: ['JUDGE_IMAGE_NODE', 'node:24-slim'],
    python: ['JUDGE_IMAGE_PYTHON', 'python:3.12-slim'],
} as const

type Image = keyof typeof IMAGES

function imageRef(image: Image): string {
    const [variable, fallback] = IMAGES[image]
    return process.env[variable]?.trim() || fallback
}

const LANGUAGES: (Omit<Language, 'id' | 'active' | 'image_ref'> & { image: Image })[] = [
    {
        code: 'c',
        image: 'gcc',
        compile_cmd: 'gcc Main.c -o main',
        run_cmd: './main',
        compiler_version: 'GCC 14',
        flags: '-O2 -std=gnu17 -lm',
        file_ext: 'c',
        time_multiplier: 1,
    },
    {
        code: 'cpp',
        image: 'gcc',
        compile_cmd: 'g++ Main.cpp -o main',
        run_cmd: './main',
        compiler_version: 'GCC 14',
        flags: '-O2 -std=gnu++20',
        file_ext: 'cpp',
        time_multiplier: 1,
    },
    {
        code: 'csharp',
        image: 'dotnet',
        // .NET 8 no compila un .cs suelto: se arma un csproj mínimo al vuelo
        compile_cmd: `printf '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><AssemblyName>Main</AssemblyName></PropertyGroup></Project>' > Main.csproj && dotnet build Main.csproj -c Release -o out --nologo -v q`,
        run_cmd: 'dotnet out/Main.dll',
        compiler_version: '.NET 8.0',
        flags: '',
        file_ext: 'cs',
        time_multiplier: 2,
    },
    {
        code: 'java',
        image: 'java',
        compile_cmd: 'javac -encoding UTF-8 Main.java',
        // Sin MaxRAMPercentage la JVM usa solo 1/4 del límite del contenedor como heap
        run_cmd: 'java -Xss64m -XX:+UseSerialGC -XX:MaxRAMPercentage=75 Main',
        compiler_version: 'OpenJDK 21',
        flags: '',
        file_ext: 'java',
        time_multiplier: 2,
    },
    {
        code: 'javascript',
        image: 'node',
        compile_cmd: 'node --check Main.js',
        run_cmd: 'node Main.js',
        compiler_version: 'Node.js 24',
        flags: '',
        file_ext: 'js',
        time_multiplier: 2,
    },
    {
        code: 'typescript',
        image: 'node',
        // `node --check` no entiende tipos; stripTypeScriptTypes falla con errores de sintaxis
        // y con sintaxis no borrable (enum, namespace), igual que al ejecutar con type-stripping
        compile_cmd: `node --disable-warning=ExperimentalWarning -e "require('node:module').stripTypeScriptTypes(require('node:fs').readFileSync('Main.ts', 'utf8'))"`,
        run_cmd: 'node Main.ts',
        compiler_version: 'Node.js 24',
        flags: '',
        file_ext: 'ts',
        time_multiplier: 2,
    },
    {
        code: 'python',
        image: 'python',
        compile_cmd: 'python3 -m py_compile Main.py',
        run_cmd: 'python3 Main.py',
        compiler_version: 'Python 3.12',
        flags: '',
        file_ext: 'py',
        // CPython es el más lento de todos; falta calibrarlo con scripts/judge-bench
        time_multiplier: 3,
    },
]

export const languageSeeder: Seeder = {
    name: 'base/language',
    async run({ manager }) {
        for (const { image, ...language } of LANGUAGES) {
            const ref = imageRef(image)
            const existing = await manager.findOneBy(Language, { code: language.code })
            if (!existing) {
                await manager.insert(Language, { ...language, image_ref: ref })
                logger.log(`${language.code} creado`)
            } else if (existing.image_ref !== ref) {
                // Solo la imagen: "active" lo maneja el staff desde el panel y no se toca
                await manager.update(Language, { id: existing.id }, { image_ref: ref })
                logger.log(`${language.code}: imagen ${existing.image_ref} → ${ref}`)
            }
        }
    },
}
