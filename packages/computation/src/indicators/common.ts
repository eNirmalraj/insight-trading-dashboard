
/**
 * Crossover
 * Returns true if `seriesA` crosses above `seriesB`.
 */
export function crossover(seriesA: number[] | Float64Array, seriesB: number[] | Float64Array): boolean[] {
    const result = new Array(seriesA.length).fill(false);
    for (let i = 1; i < seriesA.length; i++) {
        if (seriesA[i - 1] <= seriesB[i - 1] && seriesA[i] > seriesB[i]) result[i] = true;
    }
    return result;
}

/**
 * Crossunder
 * Returns true if `seriesA` crosses below `seriesB`.
 */
export function crossunder(seriesA: number[] | Float64Array, seriesB: number[] | Float64Array): boolean[] {
    const result = new Array(seriesA.length).fill(false);
    for (let i = 1; i < seriesA.length; i++) {
        if (seriesA[i - 1] >= seriesB[i - 1] && seriesA[i] < seriesB[i]) result[i] = true;
    }
    return result;
}
