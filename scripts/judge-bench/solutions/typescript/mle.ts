import { readFileSync } from 'node:fs';
const n: number = parseInt(readFileSync(0, 'utf8')); const c: Float64Array = new Float64Array(n + 1); let k: number = 0;
for (let i = 2; i <= n; i++) if (!c[i]) { k++; for (let j = i * i; j <= n; j += i) c[j] = 1; }
console.log(k);
