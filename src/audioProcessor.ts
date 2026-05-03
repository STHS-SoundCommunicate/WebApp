// AudioWorkletProcessorはブラウザ側に存在し、このクラスをそこに渡すので、IDE補完ができない。
// https://developer.mozilla.org/ja/docs/Web/API/AudioWorkletProcessor

function concat(arr1: Float32Array, arr2: Float32Array): Float32Array {
	const newArray = new Float32Array(arr1.length + arr2.length);
	newArray.set(arr1);
	newArray.set(arr2, arr1.length);
	return newArray;
}

function isEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
} // Copilot



// function encodeUTF8(str: string): Uint8Array {
// 	const encoder = new TextEncoder; // utf-8 only
// 	return encoder.encode(str);
// }
//
// function str2bits(str: string): Uint8Array {
// 	let result: number[] = [];
// 	encodeUTF8(str).forEach((byte) => {
// 		for(let i: number = 0; i < 8; ++i) {
// 			result.push((byte >> (7 - i)) & 1);
// 		}
// 	});
// 	return new Uint8Array(result);
// }
//

// function decodeUTF8(buffer: Uint8Array): string {
// 	const decoder = new TextDecoder('utf-8'); // 冗長
// 	return decoder.decode(buffer);
// }



class audioProcessor extends AudioWorkletProcessor {

	private readonly sample_count: number;
	private readonly half_sample_count: number;
	private readonly sample_rate: number;
	private readonly preamble: number[];
	private readonly preamble_len: number;
	private readonly signal_freqs: number[];
	private readonly bits_per_signal: number;
	private buffer: Float32Array;

	private symbols: number[] = []; // TODO: Uint8のリングバッファとかにした方がいい
	private recents: Float32Array;

	private goertzel(samples: Float32Array, freq: number): number {
		const N = samples.length;
		const k = Math.round((N * freq) / this.sample_rate);
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

	private log(s: any): void {
		this.port.postMessage(s);
	}

	private readSamples(count: number): Float32Array {
		if(this.buffer.length < count) {
			throw new Error('buffer.length < count');
		}
		const samples = this.buffer.slice(0, count);
		this.buffer = this.buffer.slice(count); // 一度readしたものは削除する。
		return samples;
	}

	private detect_symbol(samples: Float32Array): number{
		let max_freq: number = -1; // はたしてやっていい初期化なのだろうか
		let max_db: number;
		this.signal_freqs.forEach((f, i) => {
			let db = this.goertzel(samples, f);
			if(max_freq === -1 || db > max_db) {
				max_db = db;
				max_freq = i
			}
		});
		return max_freq; // return index not [Hz]
	}

	private crc(symbols: number[]): number {
		let c = 0;
		symbols.forEach((s) => {
			c ^= s; // XOR
			for(let _: number = 0; _ < 8; ++_) {
				if(c & 0x80){
					c = ((c << 1) ^ 0x07) & 0xFF;
				} else {
					c = (c << 1) & 0xFF;
				}
			}
		});
		return c;
	}

	private symbol2bits(symbols: number[]): Uint8Array {
		let bits: number[] = [];
		symbols.forEach((s) => {
			for(let i: number = this.bits_per_signal - 1; i > -1; --i) {
				bits.push((s >> i) & 1);
			}
		});
		let bytes: number[] = [];
		for(let i: number = 0; i < bits.length - 7; i += 8) {
			let b: number = 0;
			bits.slice(i, i + 8).forEach((bit) => {
				b = (b << 1) | bit;
			});
			bytes.push(b);
		}
		return (new Uint8Array(bytes));
	}

	constructor(options: AudioWorkletNodeOptions) {
		super();

		this.sample_count = options.processorOptions.SAMPLES_COUNT;
		this.half_sample_count = Math.trunc(this.sample_count / 2);
		this.sample_rate = options.processorOptions.SAMPLE_RATE;
		this.preamble = options.processorOptions.PREAMBLE;
		this.preamble_len = this.preamble.length;
		this.signal_freqs = options.processorOptions.SIGNAL_FREQS;
		this.bits_per_signal = options.processorOptions.BITS_PER_SIGNAL;

		this.buffer = new Float32Array;
		this.recents = new Float32Array(this.half_sample_count * 9);
	}

	process (
		input: Float32Array[][],
		output: Float32Array[][], // 不要？
		parameters: any // 不要？
	): boolean { // 128サンプルごとに呼び出される Float32は-1.0~1.0
		const inputs = input[0][0];
		if(!inputs) return true;

		this.buffer = concat(this.buffer, inputs); // 128サンプルずつすべてスタックする

		if(this.buffer.length >= this.sample_count * 50){ // overshoot読み込み用 ここでthis.bufferの大きさが決まるようなもん
			const samples = this.readSamples(this.half_sample_count);
			const symbol = this.detect_symbol(samples);
			this.symbols.push(symbol);
			this.symbols = this.symbols.slice(-this.preamble_len*2);
			this.recents = concat(this.recents.slice(this.half_sample_count), samples);
			// this.port.postMessage(`[preamble] ${symbol}, [${this.symbols.join(', ')}]`);
			this.log(`[preamble] ${symbol}, [${this.buffer.length}]`);
			if(this.symbols.length >= this.preamble_len * 2) {
				let window_2 = this.symbols.filter((s, i) => i % 2 === 0);
				let window_1 = this.symbols.filter((s, i) => i % 2 === 1);
				if(isEqual(this.preamble, window_1) || isEqual(this.preamble, window_2)) {
					let phase_offset: number = isEqual(this.preamble, window_2) ? 0 : this.half_sample_count;
					let temp_max: number = 0;
					let start_preamble: number = phase_offset;
					for(let i: number = start_preamble; i < phase_offset + this.half_sample_count; ++i) {
						let score = this.goertzel(this.recents.slice(i, i + this.half_sample_count), this.signal_freqs[0]);
						if(score > temp_max) {
							temp_max = score;
							start_preamble = i;
						}
					}
					let header_index = start_preamble + this.sample_count * this.preamble_len;
					let buf_size = this.recents.length;
					let buf = this.recents.slice(Math.min(header_index, buf_size));
					let overshoot = Math.max(0, header_index - buf_size);
					let stream_chunk = this.readSamples(overshoot + 6 * this.sample_count - buf.length);
					let header = concat(buf, stream_chunk).slice(overshoot);

					let pl_hi = this.detect_symbol(header.slice(0, this.sample_count));
					let pl_lo = this.detect_symbol(header.slice(this.sample_count, this.sample_count * 2));
					let payload_length = (pl_hi << 4) | pl_lo;

					let mi_hi = this.detect_symbol(header.slice(this.sample_count * 2, this.sample_count * 3));
					let mi_lo = this.detect_symbol(header.slice(this.sample_count * 3, this.sample_count * 4));
					let message_id = (mi_hi << 4) | mi_lo;

					let c8_hi = this.detect_symbol(header.slice(this.sample_count * 4, this.sample_count * 5));
					let c8_lo = this.detect_symbol(header.slice(this.sample_count * 5, this.sample_count * 6));
					let crc_raw = (c8_hi << 4) | c8_lo;
					let crc_data = [pl_hi, pl_lo, mi_hi, mi_lo]; // TODO: 負の数を扱わないならUint8にする。
					if(crc_raw === this.crc(crc_data)){
						this.log('crc check passed'); // プリアンブル検出

						let payload_symbols = [];
						for(let i: number = 0; i < payload_length; ++i) {
							payload_symbols.push(this.detect_symbol(this.readSamples(this.sample_count)));
						}
						// this.log(`[${payload_symbols.join(', ')}]`);
						let payload_bits = this.symbol2bits(payload_symbols);
						this.log(payload_bits);

						this.log("correct preamble detected!");
					} else {
						this.log('crc check failed');
					}


					return true;
				}
			}
		}
		return true;
	}
}
registerProcessor('audio-processor', audioProcessor);