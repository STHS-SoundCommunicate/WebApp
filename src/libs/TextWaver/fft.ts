import FFT from 'fft.js';

export function nextPowerOfTwo(n: number): number {// 0埋め
    return 1 << Math.ceil(Math.log2(n)); // 1 << (32 - Math.clz32(n - 1));
}

export function fft(f: Float32Array): number[] {
    const N: number = nextPowerOfTwo(f.length);
    const fft = new FFT(N);
    const input = new Array(N);
    input.fill(0);
    f.forEach((v: number, i: number): number => input[i] = v);
    const out: number[] = fft.createComplexArray();
    fft.realTransform(out, input);
    fft.completeSpectrum(out);
    return out; // [real, image, real, image, ...]
}

export function scoreOnFFT(fft_array: number[], freq: number, sampleRate: number): number {
    const N: number = fft_array.length / 2; // fft.length must be 2N
    const bin: number = Math.round((freq * N) / sampleRate);
    if (bin < 0 || bin >= N / 2) return 0; // TODO: binを1つしか見てないからgoertzelより悪い？
    const real: number = fft_array[bin * 2];
    const imag: number = fft_array[bin * 2 + 1];
    return (real * real) + (imag * imag); // ほんとの振幅強度はルート
}

export function getNormalizedSpectrum(fft_array: number[]): number[] { // 周波数ごとの0~1のデータ
    const N: number = fft_array.length / 2;
    const normalized: number[] = new Array(N);
    for (let i: number = 0; i < N; i++) {
        const real: number = fft_array[i * 2];
        const imag: number = fft_array[i * 2 + 1];
        // normalized[i] = Math.sqrt(real * real + imag * imag) / (N / 2); // 正確な振幅強度はいらない
        normalized[i] = (real * real) + (imag * imag);
    }
    return normalized;
}