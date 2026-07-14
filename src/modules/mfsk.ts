// https://qiita.com/hiro-hiro/items/9879a297cf5b30c474e2

// const TITLE: string = "MFSK";

import { modulator } from './modulator.ts';
import { crc } from "../utils.ts";

export class mfsk extends modulator {

	// private readonly SAMPLE_COUNT: number;
	// private readonly HALF_SAMPLE_COUNT: number;
	// private readonly SAMPLING_RATE: number;
	// private readonly PREAMBLE: number[];
	// private readonly PREAMBLE_LEN: number;
	// private readonly SIGNAL_FREQS: Uint16Array;
	// private readonly BITS_PER_SIGNAL: number;
	// private readonly SIGNAL_MS: number;

	constructor(
		SAMPLING_RATE: number,
		private readonly SIGNAL_FREQS: Uint16Array,
		private readonly PREAMBLE: number[],
		private readonly BITS_PER_SIGNAL: number,
		private readonly SIGNAL_MS: number
	) {
		super(SAMPLING_RATE);
	}

	private goertzel(samples: Float32Array, freq: number): number {
		const N: number = samples.length;
		const k: number = Math.round((N * freq) / this.SAMPLING_RATE);
		const omega: number = (2 * Math.PI * k) / N;
		const coeff: number = 2 * Math.cos(omega);
		let s_prev: number = 0;
		let s_prev2: number = 0;
		for (let i: number = 0; i < N; ++i) {
			const s: number = samples[i] + (coeff * s_prev) - s_prev2;
			s_prev2 = s_prev;
			s_prev = s;
		}
		return (s_prev2 * s_prev2) + (s_prev * s_prev) - (coeff * s_prev * s_prev2); // ほんとは平方根だけど、比較できればいいので具体的な数字は必要ない
	}

	public detectSymbol(samples: Float32Array): number {
		let max_freq: number = -1; // はたしてやっていい初期化なのだろうか
		let max_db: number = -Infinity;
		this.SIGNAL_FREQS.forEach((f: number, i: number): void => {
			let score: number = this.getScore(samples, f);
			if(score > max_db) {
				max_db = score;
				max_freq = i; // 何個目のチャンネルか
			}
		});
		return max_freq; // return index, not [Hz]
	}

	public getScore(samples: Float32Array, freq: number): number { // もっといい感じに管理できないかな
		return this.goertzel(samples, freq);
	}








	public generateWave(bits: Uint8Array): Float32Array { // bits: 符号化されたデータ（ヘッダなども含む）
		const index: Uint8Array = this.bits2index(bits);
		const header: Uint8Array = this.generateHeader(index);

		const n_signals: number = Math.floor(this.SAMPLING_RATE * this.SIGNAL_MS / 1000);
		const duration: number = n_signals / this.SAMPLING_RATE;

		let waves: Float32Array = new Float32Array((header.length + index.length) * n_signals);
		let key: number = 0;
		let phase: number = 0;

		const sinWaver = (value: number) => {
			const freq: number = this.SIGNAL_FREQS[value];
			for(let i: number = 0; i < n_signals; ++i)
				waves[key++] = (Math.sin((2 * Math.PI * freq * (i / this.SAMPLING_RATE)) + phase));
			phase = (phase + (2 * Math.PI * duration * freq)) % (2 * Math.PI);
		};

		header.forEach((value: number): void =>
			sinWaver(value)
		);
		index.forEach((value: number): void =>
			sinWaver(value)
		);

		return waves;
	}

	private generateHeader(payload: Uint8Array): Uint8Array {
		const len: number = payload.length;
		if(len > 255) throw new Error('payload.length > 255');
		const messageId: number = 0;
		const payload_length_symbols: number[]  = [len >> 4, len & 0xF];
		const message_id_symbols: number[] = [messageId >> 4, messageId & 0xF];
		const header_info_symbols: number[] = payload_length_symbols.concat(message_id_symbols);
		console.log(header_info_symbols);
		const c: number = crc(new Uint8Array(header_info_symbols));
		console.log(`info_data : ${header_info_symbols}, crc : ${c}`);
		const cyc_symbols: number[] = [c >> 4, c & 0xF];
		return new Uint8Array(this.PREAMBLE.concat(header_info_symbols).concat(cyc_symbols));
	}

	private bits2index(bits: Uint8Array): Uint8Array { // mfskでは4bitを1indexとして管理するため、4bitごとに管理
		let result: Uint8Array = new Uint8Array(Math.floor(bits.length / this.BITS_PER_SIGNAL)); // TODO: Check -> 要素数怪しい
		let key: number = 0;
		for(let i: number = 0; i < bits.length; i += this.BITS_PER_SIGNAL) {
			let index: number = 0;
			for(let j: number = 0; j < this.BITS_PER_SIGNAL; ++j)
				index = (index << 1) | bits[i + j];
			result[key++] = index;
		}
		return new Uint8Array(result);
	}

}