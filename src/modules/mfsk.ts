// https://qiita.com/hiro-hiro/items/9879a297cf5b30c474e2

// const TITLE: string = "MFSK";

import { modulator } from './modulator.ts';
import { concat, crc, isEqual } from "../utils.ts";
import StackBuffer from "../StackBuffer.ts";

export class mfsk extends modulator {

	private readonly HALF_SAMPLE_COUNT: number;

	private readonly symbols: Uint8Array; // 固定長リングバッファ
	private symbols_index: number = 0; // リングバッファ用ポインタ
	private recents: Float32Array;

	private readonly window_1: Uint8Array;
	private readonly window_2: Uint8Array;

	constructor(
		SAMPLING_RATE: number,

		private readonly SIGNAL_FREQS: Uint16Array,
		private readonly PREAMBLE: number[],
		private readonly BITS_PER_SIGNAL: number,
		private readonly SIGNAL_MS: number,
		private readonly SAMPLE_COUNT: number,
	) {
		super(SAMPLING_RATE);

		this.HALF_SAMPLE_COUNT = Math.floor(this.SAMPLE_COUNT / 2);

		this.symbols = new Uint8Array(this.PREAMBLE.length * 2); // 疑似リングバッファ
		this.recents = new Float32Array(this.HALF_SAMPLE_COUNT * 9);

		this.window_1 = new Uint8Array(this.PREAMBLE.length);
		this.window_2 = new Uint8Array(this.PREAMBLE.length);
	}

	private goertzel(samples: Float32Array, freq: number): number {
		const N: number = samples.length;
		const k: number = Math.round((N * freq) / this.SAMPLING_RATE);
		const omega: number = (2 * Math.PI * k) / N;
		const coeff: number = 2 * Math.cos(omega);
		let s_prev: number = 0;
		let s_prev2: number = 0;
		for (let i: number = 0; i < N; i++) {
			const s: number = samples[i] + (coeff * s_prev) - s_prev2;
			s_prev2 = s_prev;
			s_prev = s;
		}
		return (s_prev2 * s_prev2) + (s_prev * s_prev) - (coeff * s_prev * s_prev2); // ほんとは平方根だけど、比較できればいいので具体的な数字は必要ない
	}

	private nextPowerOfTwo(n: number): number {
		return 1 << Math.ceil(Math.log2(n));
	}

	private fftReal(samples: Float32Array): { re: Float64Array; im: Float64Array } {
		const N: number = this.nextPowerOfTwo(samples.length);
		const re: Float64Array = new Float64Array(N);
		const im: Float64Array = new Float64Array(N);

		for (let i: number = 0; i < samples.length; ++i) {
			re[i] = samples[i];
		}

		this.fftInPlace(re, im);

		return { re, im };
	}

	private fftInPlace(re: Float64Array, im: Float64Array): void {
		const N: number = re.length;

		for (let i: number = 1, j: number = 0; i < N; ++i) {
			let bit: number = N >> 1;

			for (; (j & bit) !== 0; bit >>= 1) j ^= bit;

			j ^= bit;

			if (i < j) {
				const tr: number = re[i];
				const ti: number = im[i];

				re[i] = re[j];
				im[i] = im[j];
				re[j] = tr;
				im[j] = ti;
			}
		}

		for (let len: number = 2; len <= N; len <<= 1) {
			const angle: number = -2 * Math.PI / len;
			const wlenR: number = Math.cos(angle);
			const wlenI: number = Math.sin(angle);

			for (let i: number = 0; i < N; i += len) {
				let wr: number = 1;
				let wi: number = 0;

				for (let j: number = 0; j < len / 2; ++j) {
					const uR: number = re[i + j];
					const uI: number = im[i + j];

					const vR: number = re[i + j + len / 2] * wr - im[i + j + len / 2] * wi;
					const vI: number = re[i + j + len / 2] * wi + im[i + j + len / 2] * wr;

					re[i + j] = uR + vR;
					im[i + j] = uI + vI;

					re[i + j + len / 2] = uR - vR;
					im[i + j + len / 2] = uI - vI;

					const nextWr: number = wr * wlenR - wi * wlenI;
					wi = wr * wlenI + wi * wlenR;
					wr = nextWr;
				}
			}
		}
	}

	private score(spectrum: { re: Float64Array; im: Float64Array }, freq: number): number {
		const N: number = spectrum.re.length;
		const bin: number = Math.round((18000 * N) / this.SAMPLING_RATE);
		if (bin < 0 || bin >= N / 2) return 0;
		const real: number = spectrum.re[bin];
		const imag: number = spectrum.im[bin];
		console.log((real * real) + (imag * imag));
		return (real * real) + (imag * imag);
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

	private getScore(samples: Float32Array, freq: number): number { // もっといい感じに管理できないかな
		return this.goertzel(samples, freq);
	}



	private addSymbol(symbol: number): void {
		this.symbols[this.symbols_index] = symbol;
		this.symbols_index = (this.symbols_index + 1) % this.symbols.length;
	}

	private symbol2bits(symbols: number[]): Uint8Array {
		let bits: number[] = [];
		symbols.forEach((s: number): void => {
			for(let i: number = this.BITS_PER_SIGNAL - 1; i >= 0; --i)
				bits.push((s >> i) & 1);
		});
		let bytes: number[] = [];
		for(let i: number = 0; i < bits.length - 7; i += 8) {
			let b: number = 0;
			bits.slice(i, i + 8).forEach((bit: number): void => { b = (b << 1) | bit; });
			bytes.push(b);
		}
		return (new Uint8Array(bytes));
	}

	private readPreamble(samples: Float32Array): [boolean, number] {

		const symbol: number = this.detectSymbol(samples);
		this.addSymbol(symbol);
		this.recents = concat(this.recents.slice(this.HALF_SAMPLE_COUNT), samples);

		// log(`[preamble] ${symbol}, [${this.symbols.join(', ')}][${this.symbols_index}]`);

		for(let i: number = 0; i < this.PREAMBLE.length; ++i) {
			let p: number = this.symbols_index - 1 - (2*i) + this.symbols.length;
			this.window_1[this.PREAMBLE.length - i - 1] = this.symbols[p % this.symbols.length]; // 偶数列
			this.window_2[this.PREAMBLE.length - i - 1] = this.symbols[(p-1) % this.symbols.length]; // 奇数列
		}

		let phase_offset: number;
		if(isEqual(this.PREAMBLE, this.window_1)) {
			phase_offset = this.HALF_SAMPLE_COUNT;
		} else if(isEqual(this.PREAMBLE, this.window_2)) {
			phase_offset = 0;
		} else {
			return [false, -1];
		}

		let temp_max: number = 0;
		let start_preamble: number = phase_offset;
		for(let i: number = start_preamble; i < phase_offset + this.HALF_SAMPLE_COUNT; ++i) {
			let score: number = this.getScore(this.recents.slice(i, i + this.HALF_SAMPLE_COUNT), this.SIGNAL_FREQS[0]);
			if(score > temp_max) {
				temp_max = score;
				start_preamble = i;
			}
		}

		return [true, start_preamble];

	}

	private readonly crc_data: Uint8Array = new Uint8Array(4);

	public *process(stackBuffer: StackBuffer, log: (s: any) => void): Generator {
		while(true) {

			let samples: Float32Array = yield* stackBuffer.waitSamples(this.HALF_SAMPLE_COUNT);
			let isPreamble: [boolean, number] = this.readPreamble(samples);

			if(isPreamble[0]) {

				log("preamble detected");

				let header_index: number = isPreamble[1] + (this.SAMPLE_COUNT * this.PREAMBLE.length);
				let buf_size: number = this.recents.length;
				let buf: Float32Array = this.recents.slice(Math.min(header_index, buf_size));
				let overshoot: number = Math.max(0, header_index - buf_size);
				let stream_chunk: Float32Array = yield* stackBuffer.waitSamples(overshoot + 6 * this.SAMPLE_COUNT - buf.length);
				let header: StackBuffer = new StackBuffer(concat(buf, stream_chunk).slice(overshoot));

				let pl_hi: number = this.detectSymbol(header.readSamples(this.SAMPLE_COUNT)),
					pl_lo: number = this.detectSymbol(header.readSamples(this.SAMPLE_COUNT));
				let payload_length: number = (pl_hi << 4) | pl_lo; // 16channelだから4シフトしてる？

				let mi_hi: number = this.detectSymbol(header.readSamples(this.SAMPLE_COUNT)),
					mi_lo: number = this.detectSymbol(header.readSamples(this.SAMPLE_COUNT));
				let message_id: number = (mi_hi << 4) | mi_lo;

				let c8_hi: number = this.detectSymbol(header.readSamples(this.SAMPLE_COUNT)),
					c8_lo: number = this.detectSymbol(header.readSamples(this.SAMPLE_COUNT));
				let crc_raw: number = (c8_hi << 4) | c8_lo;

				this.crc_data[0] = pl_hi;
				this.crc_data[1] = pl_lo;
				this.crc_data[2] = mi_hi;
				this.crc_data[3] = mi_lo; // 0~255なはず

				if(crc_raw === crc(this.crc_data)) {

					log("header crc check passed");

					log("Waiting for payload...");
					let payloads: StackBuffer = new StackBuffer(yield* stackBuffer.waitSamples(this.SAMPLE_COUNT * payload_length));
					log("Payload received");

					let payload_symbols: number[] = [];
					for(let _: number = 0; _ < payload_length; ++_)
						payload_symbols.push(this.detectSymbol(payloads.readSamples(this.SAMPLE_COUNT)));
					log(`[${this.PREAMBLE.join(', ')}, ${this.crc_data.join(', ')}, ${c8_hi}, ${c8_lo}, ${payload_symbols.join(', ')}]`);
					let payload_bits: Uint8Array = this.symbol2bits(payload_symbols);

					log(payload_bits); // postMessage

				} else {
					log("header crc check failed");
				}

			}

			yield; // 一周だけで止める
		}
	}








	public generateWave(bits: Uint8Array): Float32Array { // bits: 符号化されたデータ（ヘッダなども含む）
		const index: Uint8Array = this.bits2index(bits);
		const header: Uint8Array = this.generateHeader(index);

		const n_signals: number = Math.floor(this.SAMPLING_RATE * this.SIGNAL_MS / 1000);
		const duration: number = n_signals / this.SAMPLING_RATE;

		let waves: Float32Array = new Float32Array((header.length + index.length) * n_signals);
		let key: number = 0;
		let phase: number = 0;

		const sinWaver = (value: number): void => {
			const freq: number = this.SIGNAL_FREQS[value];
			for(let i: number = 0; i < n_signals; ++i)
				waves[key++] = (Math.sin((2 * Math.PI * freq * (i / this.SAMPLING_RATE)) + phase));
			phase = (phase + (2 * Math.PI * duration * freq)) % (2 * Math.PI);
		};

		header.forEach((value: number): void =>
			sinWaver(value)
		);

		// header.forEach(sinWaver); // これで動きそうじゃね？

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