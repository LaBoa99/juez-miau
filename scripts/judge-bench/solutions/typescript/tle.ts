import { readFileSync } from 'node:fs';
const n: number = parseInt(readFileSync(0, 'utf8')); let k: number = 0;
for (let i = 2; i <= n; i++) { let p: boolean = true; for (let d = 2; d * d <= i; d++) if (i % d === 0) { p = false; break; } if (p) k++; }
console.log(k);
