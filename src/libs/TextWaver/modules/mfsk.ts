// https://qiita.com/hiro-hiro/items/9879a297cf5b30c474e2

// const TITLE: string = "MFSK";

import { modulator } from './modulator.ts';
import {concat, crc, isEqual, ConstValues, bytes2bits, str2bytes} from "../utils.ts";
import StackBuffer from "../StackBuffer.ts";

import { fft, scoreOnFFT } from '../fft.ts';

import { generate_rs_parity, rs_decode } from '../rs_codec.ts';

export class mfsk extends modulator {

	private readonly HALF_SAMPLE_COUNT: number;

	private readonly symbols: Uint8Array; // 固定長リングバッファ
	private symbols_index: number = 0; // リングバッファ用ポインタ
	private recents: Float32Array;

	private readonly window_1: Uint8Array;
	private readonly window_2: Uint8Array;

	constructor(
		constValues: ConstValues,
	) {
		super(constValues);

		this.HALF_SAMPLE_COUNT = Math.floor(this.constValues.SAMPLES_COUNT / 2);

		this.symbols = new Uint8Array(this.constValues.PREAMBLE.length * 2); // 疑似リングバッファ
		this.recents = new Float32Array(this.HALF_SAMPLE_COUNT * 9);

		this.window_1 = new Uint8Array(this.constValues.PREAMBLE.length);
		this.window_2 = new Uint8Array(this.constValues.PREAMBLE.length);
	}

	private goertzel(samples: Float32Array, freq: number): number {
		const N: number = samples.length;
		const k: number = Math.round((N * freq) / this.constValues.SAMPLING_RATE);
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

	public detectSymbol(samples: Float32Array): number {
		if(this.constValues.useFFT) return this.detectSymbolOnFFT(samples);
		else return this.detectSymbolOnGoertzel(samples);
	}

	public detectSymbolOnGoertzel(samples: Float32Array): number {
		let max_freq: number = -1; // はたしてやっていい初期化なのだろうか
		let max_db: number = -Infinity;
		this.constValues.SIGNAL_FREQS.forEach((f: number, i: number): void => {
			let score: number = this.goertzel(samples, f);
			if(score > max_db) {
				max_db = score;
				max_freq = i; // 何個目のチャンネルか
			}
		});
		return max_freq; // return index, not [Hz]
	}

	public detectSymbolOnFFT(samples: Float32Array): number {
		let max_freq: number = -1; // はたしてやっていい初期化なのだろうか
		let max_db: number = -Infinity;
		let fft_array: number[] = fft(samples);
		this.constValues.SIGNAL_FREQS.forEach((f: number, i: number): void => {
			let score: number = scoreOnFFT(fft_array, f, this.constValues.SAMPLING_RATE);
			if(score > max_db) {
				max_db = score;
				max_freq = i; // 何個目のチャンネルか
			}
		});
		return max_freq; // return index, not [Hz]
	}



	private addSymbol(symbol: number): void {
		this.symbols[this.symbols_index] = symbol;
		this.symbols_index = (this.symbols_index + 1) % this.symbols.length;
	}

	private symbol2bytes(symbols: Uint8Array): Uint8Array {
		let bits: number[] = [];
		symbols.forEach((s: number): void => {
			for(let i: number = this.constValues.BITS_PER_SIGNAL - 1; i >= 0; --i)
				bits.push((s >> i) & 1);
		});
		const bytes: Uint8Array = new Uint8Array(bits.length / 8); // ほんとに要素数あってる？
		for(let i: number = 0; i < bits.length - 7; i += 8) {
			let b: number = 0;
			bits.slice(i, i + 8).forEach((bit: number): void => { b = (b << 1) | bit; });
			bytes[Math.floor(i / 8)] = b;
		}
		return bytes;
	}

	private readPreamble(samples: Float32Array): [boolean, number] {

		const symbol: number = this.detectSymbol(samples);
		this.addSymbol(symbol);
		this.recents = concat(this.recents.slice(this.HALF_SAMPLE_COUNT), samples);

		// log(`[preamble] ${symbol}, [${this.symbols.join(', ')}][${this.symbols_index}]`);

		for(let i: number = 0; i < this.constValues.PREAMBLE.length; ++i) {
			let p: number = this.symbols_index - 1 - (2*i) + this.symbols.length;
			this.window_1[this.constValues.PREAMBLE.length - i - 1] = this.symbols[p % this.symbols.length]; // 偶数列
			this.window_2[this.constValues.PREAMBLE.length - i - 1] = this.symbols[(p-1) % this.symbols.length]; // 奇数列
		}

		let phase_offset: number;
		if(isEqual(this.constValues.PREAMBLE, this.window_1)) {
			phase_offset = this.HALF_SAMPLE_COUNT;
		} else if(isEqual(this.constValues.PREAMBLE, this.window_2)) {
			phase_offset = 0;
		} else {
			return [false, -1];
		}

		let temp_max: number = 0;
		let start_preamble: number = phase_offset;
		// for(let i: number = start_preamble; i < phase_offset + this.HALF_SAMPLE_COUNT; ++i) {
		//
		// 	let score: number;
		// 	// if(this.constValues.useFFT) {
		// 	// 	score = scoreOnFFT(fft(this.recents.slice(i, i + this.HALF_SAMPLE_COUNT)), this.constValues.SIGNAL_FREQS[0], this.constValues.SAMPLING_RATE);
		// 	// } else {
		// 		score = this.goertzel(this.recents.slice(i, i + this.HALF_SAMPLE_COUNT), this.constValues.SIGNAL_FREQS[0]); // TODO: 計算効率の向上はできないか？
		// 	// }
		// 	if(score > temp_max) {
		// 		temp_max = score;
		// 		start_preamble = i;
		// 	}
		// }
		if(this.constValues.useFFTPreambleChecker) {
			const coarseStep: number = 8;
			let coarseStart: number = start_preamble;

			for(let i: number = phase_offset; i < phase_offset + this.HALF_SAMPLE_COUNT; i += coarseStep) {
				const score: number = scoreOnFFT(fft(this.recents.slice(i, i + this.HALF_SAMPLE_COUNT)), this.constValues.SIGNAL_FREQS[0], this.constValues.SAMPLING_RATE);
				if(score > temp_max) {
					temp_max = score;
					coarseStart = i;
				}
			}

			const fineStart: number = Math.max(phase_offset, coarseStart - coarseStep);
			const fineEnd: number = Math.min(phase_offset + this.HALF_SAMPLE_COUNT, coarseStart + coarseStep + 1);

			temp_max = 0;
			start_preamble = coarseStart;

			for(let i: number = fineStart; i < fineEnd; ++i) {
				const score: number = scoreOnFFT(fft(this.recents.slice(i, i + this.HALF_SAMPLE_COUNT)), this.constValues.SIGNAL_FREQS[0], this.constValues.SAMPLING_RATE);
				if(score > temp_max) {
					temp_max = score;
					start_preamble = i;
				}
			}
		} else {
			for(let i: number = start_preamble; i < phase_offset + this.HALF_SAMPLE_COUNT; ++i) {
				const score: number = this.goertzel(this.recents.slice(i, i + this.HALF_SAMPLE_COUNT), this.constValues.SIGNAL_FREQS[0]); // TODO: 計算効率の向上はできないか？
				if(score > temp_max) {
					temp_max = score;
					start_preamble = i;
				}
			}
		}

		return [true, start_preamble];

	}

	private readonly crc_data: Uint8Array = new Uint8Array(4);
	private readonly HEADER_INFO_SYMBOLS: number = 4; //他で書いているかもしれないので必要であれば直して
	// ヘッダ検査部のシンボル数。
	private headerCheckSymbols(): number {
		return this.constValues.useHeaderRS ? this.constValues.Header_RS_ParityBytes * 2 : 2;
	}

	// プリアンブルを除いたヘッダ全体のシンボル数。
	private headerSymbols(): number {
		return this.HEADER_INFO_SYMBOLS + this.headerCheckSymbols();
	}

	private wait: number = 0;

	public *process(stackBuffer: StackBuffer, log: (s: any) => void): Generator {
		while(true) {

			let samples: Float32Array = yield* stackBuffer.waitSamples(this.HALF_SAMPLE_COUNT);
			let isPreamble: [boolean, number] = this.readPreamble(samples);

			this.wait++;

			if(isPreamble[0]) {

				if(this.wait < 10) continue; // 実験用？
				this.wait = 0;

				log([mfsk.PREAMBLE_DETECTED]);

				let header_index: number = isPreamble[1] + (this.constValues.SAMPLES_COUNT * this.constValues.PREAMBLE.length);
				let buf_size: number = this.recents.length;
				let buf: Float32Array = this.recents.slice(Math.min(header_index, buf_size));
				let overshoot: number = Math.max(0, header_index - buf_size);
				let stream_chunk: Float32Array = yield* stackBuffer.waitSamples(overshoot + this.headerSymbols() * this.constValues.SAMPLES_COUNT - buf.length);
				let header: StackBuffer = new StackBuffer(concat(buf, stream_chunk).slice(overshoot));

				let pl_hi: number = this.detectSymbol(header.readSamples(this.constValues.SAMPLES_COUNT)),
					pl_lo: number = this.detectSymbol(header.readSamples(this.constValues.SAMPLES_COUNT));
				let payload_length: number = (pl_hi << 4) | pl_lo; // 16channelだから4シフトしてる？

				let mi_hi: number = this.detectSymbol(header.readSamples(this.constValues.SAMPLES_COUNT)),
					mi_lo: number = this.detectSymbol(header.readSamples(this.constValues.SAMPLES_COUNT));
				let message_id: number = (mi_hi << 4) | mi_lo;

				let check_symbols: number[] = [];
				for(let i: number = 0; i < this.headerCheckSymbols(); ++i)
					check_symbols.push(this.detectSymbol(header.readSamples(this.constValues.SAMPLES_COUNT)));

				let headerOk: boolean;
				if(this.constValues.useHeaderRS) {
					const codeword: Uint8Array = new Uint8Array(2 + this.constValues.Header_RS_ParityBytes);
					codeword[0] = payload_length;
					codeword[1] = message_id;
					for(let i: number = 0; i < this.constValues.Header_RS_ParityBytes; ++i)
						codeword[2 + i] = (check_symbols[i * 2] << 4) | check_symbols[i * 2 + 1];
					const corrected: Uint8Array | false = this.removeRSparity(codeword, this.constValues.Header_RS_ParityBytes);
					headerOk = corrected !== false;
					if(corrected !== false) {
						payload_length = corrected[0];
						message_id = corrected[1];
					}
				} else {
					this.crc_data[0] = pl_hi;
					this.crc_data[1] = pl_lo;
					this.crc_data[2] = mi_hi;
					this.crc_data[3] = mi_lo; // 0~255なはず
					headerOk = ((check_symbols[0] << 4) | check_symbols[1]) === crc(this.crc_data);
				}

				if(headerOk) {

					log([mfsk.HEADER_CRC_CHECK_PASSED]);

					let payloads: StackBuffer = new StackBuffer(yield* stackBuffer.waitSamples(this.constValues.SAMPLES_COUNT * payload_length));
					let payloads_wave: Float32Array = payloads.clone().readSamples();
					let payload_symbols: Uint8Array = new Uint8Array(payload_length); // TODO: Uint8でいいのか？Arrayでもあんまかわらん
					for(let i: number = 0; i < payload_length; ++i)
						payload_symbols[i] = this.detectSymbol(payloads.readSamples(this.constValues.SAMPLES_COUNT));

					log(`[${this.constValues.PREAMBLE.join(', ')}, ${pl_hi}, ${pl_lo}, ${mi_hi}, ${mi_lo}, ${check_symbols.join(', ')}, ${payload_symbols.join(', ')}]`);

					let payload_bytes: Uint8Array = this.symbol2bytes(payload_symbols);
					if(this.constValues.useRS) {
						let parity_len: number = this.constValues.RS_ErrorLength;
						if(this.constValues.useAutoRSLength)
							parity_len = Math.floor(payload_bytes.length / 3); // payload + parity
						console.log(parity_len);
						const corrected: Uint8Array | false = this.removeRSparity(payload_bytes, parity_len);
						if(corrected === false) {
							log([mfsk.RS_DECODE_FAILED]);
							continue;
						}
						payload_bytes = corrected;
					}
					log([mfsk.PAYLOAD_DETECTED, payload_bytes, payloads_wave]);

				} else {
					log([mfsk.HEADER_CRC_CHECK_FAILED]);
				}
			}
			yield; // 一周だけで止める
		}
	}

	private addRSparity(bytes: Uint8Array, parityBytes: number): Uint8Array {
		const parity: Uint8Array = generate_rs_parity(bytes, parityBytes);
		const result: Uint8Array = new Uint8Array(bytes.length + parity.length);
		result.set(bytes);
		result.set(parity, bytes.length);
		return result;
	}

	private removeRSparity(bytes: Uint8Array, parityBytes: number): Uint8Array | false {
		return rs_decode(bytes, parityBytes);
	}

	public generateWave(bytes: Uint8Array): Float32Array { // bytes: 生のデータ
		let parity_len: number = this.constValues.RS_ErrorLength;
		if(this.constValues.useAutoRSLength)
			parity_len = Math.floor(bytes.length / 2);
		console.log(parity_len);
		const rs_bytes: Uint8Array = this.constValues.useRS ? this.addRSparity(bytes, parity_len) : bytes;
		const bits: Uint8Array = bytes2bits(rs_bytes);
		const index: Uint8Array = this.bits2index(bits);

		const header: Uint8Array = this.generateHeader(index);

		console.log(`[${header.join(', ')}, ${index.join(', ')}]`);

		const n_signals: number = Math.floor(this.constValues.SAMPLING_RATE * this.constValues.SIGNAL_MS / 1000);
		const duration: number = n_signals / this.constValues.SAMPLING_RATE;

		let waves: Float32Array = new Float32Array((header.length + index.length) * n_signals);
		let key: number = 0;
		let phase: number = 0;
		const sinWaver = (value: number): void => {
			const freq: number = this.constValues.SIGNAL_FREQS[value];
			for(let i: number = 0; i < n_signals; ++i)
				waves[key++] = (Math.sin((2 * Math.PI * freq * (i / this.constValues.SAMPLING_RATE)) + phase));
			phase = (phase + (2 * Math.PI * duration * freq)) % (2 * Math.PI);
		};

		header.forEach(sinWaver);
		index.forEach(sinWaver);

		return waves;
	}

	private generateHeader(payload: Uint8Array): Uint8Array {
		const len: number = payload.length;
		if(len > 255) throw new Error('payload.length > 255');
		const messageId: number = 0;
		const payload_length_symbols: number[]  = [len >> 4, len & 0xF];
		const message_id_symbols: number[] = [messageId >> 4, messageId & 0xF];
		const header_info_symbols: number[] = payload_length_symbols.concat(message_id_symbols);

		let check_symbols: number[];
		if(this.constValues.useHeaderRS) {
			const parity: Uint8Array = generate_rs_parity(new Uint8Array([len, messageId]), this.constValues.Header_RS_ParityBytes);
			check_symbols = [];
			parity.forEach((b: number): void => { check_symbols.push(b >> 4, b & 0xF); });
		} else {
			const c: number = crc(new Uint8Array(header_info_symbols)); // 0~15の値が入った4byte列が入力
			// console.log(`info_data: ${header_info_symbols}, crc: ${c}`);
			check_symbols = [c >> 4, c & 0xF];
		}
		return new Uint8Array(this.constValues.PREAMBLE.concat(header_info_symbols).concat(check_symbols));
	}

	private bits2index(bits: Uint8Array): Uint8Array { // mfskでは4bitを1indexとして管理するため、4bitごとに管理
		let result: Uint8Array = new Uint8Array(Math.floor(bits.length / this.constValues.BITS_PER_SIGNAL));
		let key: number = 0;
		for(let i: number = 0; i < bits.length; i += this.constValues.BITS_PER_SIGNAL) {
			let index: number = 0;
			for(let j: number = 0; j < this.constValues.BITS_PER_SIGNAL; ++j)
				index = (index << 1) | bits[i + j];
			result[key++] = index;
		}
		return result;
	}

	public str2index(str: string): Uint8Array {
		const bytes: Uint8Array = str2bytes(str);
		let parity_len: number = this.constValues.RS_ErrorLength;
		if(this.constValues.useAutoRSLength)
			parity_len = Math.floor(bytes.length / 2);
		const rs_bytes: Uint8Array = this.constValues.useRS ? this.addRSparity(bytes, parity_len) : bytes;
		return this.bits2index(bytes2bits(rs_bytes));
	}

}