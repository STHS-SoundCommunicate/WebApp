// https://qiita.com/hiro-hiro/items/9879a297cf5b30c474e2

// const TITLE: string = "MFSK";

import { base } from './base.ts';

export class mfsk extends base {

	constructor(
		SAMPLING_RATE: number,
		private readonly signal_freqs: number[]
	) {
		super(SAMPLING_RATE);
	}

	goertzel(samples: Float32Array, freq: number): number {
		const N = samples.length;
		const k = Math.round((N * freq) / this.SAMPLING_RATE);
		const omega = (2 * Math.PI * k) / N;
		const coeff = 2 * Math.cos(omega);
		let s_prev = 0,
			s_prev2 = 0;
		for (let i = 0; i < N; i++) {
			const s = samples[i] + coeff * s_prev - s_prev2;
			s_prev2 = s_prev;
			s_prev = s;
		}
		return (s_prev2 * s_prev2) + (s_prev * s_prev) - (coeff * s_prev * s_prev2); // ほんとは平方根だけど、具体的な数字は必要ない
	}

	detectSymbol(samples: Float32Array): number{
		let max_freq: number = -1; // はたしてやっていい初期化なのだろうか
		let max_db: number;
		this.signal_freqs.forEach((f, i) => {
			let db = this.goertzel(samples, f);
			if(max_freq === -1 || db > max_db) {
				max_db = db;
				max_freq = i;
			}
		});
		return max_freq; // return index not [Hz]
	}

	getScore(samples: Float32Array, freq: number): number {
		return this.goertzel(samples, freq);
	}

}