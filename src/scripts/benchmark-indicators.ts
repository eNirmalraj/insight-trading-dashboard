// Benchmark script for Task 7.4
const iterations = 1000;

console.time('Legacy SMA');
for (let i = 0; i < iterations; i++) {
    // legacyCalculateSMA(candles, 20);
}
console.timeEnd('Legacy SMA');

console.time('Registry SMA');
for (let i = 0; i < iterations; i++) {
    // registryCalculateSMA(candles, 20);
}
console.timeEnd('Registry SMA');
