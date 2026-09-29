const n = parseInt(require('fs').readFileSync(0, 'utf8')); const c = new Uint8Array(n + 1); let k = 0;
for (let i = 2; i <= n; i++) if (!c[i]) { k++; for (let j = i * i; j <= n; j += i) c[j] = 1; }
console.log(k);
