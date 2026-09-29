const n = parseInt(require('fs').readFileSync(0, 'utf8')); let k = 0;
for (let i = 2; i <= n; i++) { let p = true; for (let d = 2; d * d <= i; d++) if (i % d === 0) { p = false; break; } if (p) k++; }
console.log(k);
