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
	for (let i: number = 0; i < a.length; i++)
		if (a[i] !== b[i]) return false;
	return true;
}



import { mfsk } from './mfsk.ts';

class StackBuffer {

	public constructor(
		private buffer: Float32Array
	) {}

	public get length(): number {
		return this.buffer.length;
	}

	public readSamples(count?: number): Float32Array {
		if(count === undefined) count = this.length;
		if(count > this.length) {
			throw new Error('count > length');
		}
		const sample = this.buffer.slice(0, count);
		this.buffer = this.buffer.slice(count); // 一度readしたものは削除する。
		return sample;
	}

	public add(samples: Float32Array): void {
		this.buffer = concat(this.buffer, samples);
	}

}

class audioProcessor extends AudioWorkletProcessor {

	private readonly SAMPLE_COUNT: number;
	private readonly HALF_SAMPLE_COUNT: number;
	private readonly SAMPLING_RATE: number;
	private readonly PREAMBLE: number[];
	private readonly PREAMBLE_LEN: number;
	private readonly SIGNAL_FREQS: number[];
	private readonly BITS_PER_SIGNAL: number;
	private stackBuffer: StackBuffer;

	private readonly symbols: Uint8Array;
	private symbols_index: number = 0;
	private recents: Float32Array;

	private modulator: mfsk;

	private generator: Generator;

	constructor(options: AudioWorkletNodeOptions) {
		super();

		this.SAMPLE_COUNT = options.processorOptions.SAMPLES_COUNT;
		this.HALF_SAMPLE_COUNT = Math.trunc(this.SAMPLE_COUNT / 2);
		this.SAMPLING_RATE = options.processorOptions.SAMPLE_RATE;
		this.PREAMBLE = options.processorOptions.PREAMBLE;
		this.PREAMBLE_LEN = this.PREAMBLE.length;
		this.SIGNAL_FREQS = options.processorOptions.SIGNAL_FREQS;
		this.BITS_PER_SIGNAL = options.processorOptions.BITS_PER_SIGNAL;

		this.stackBuffer = new StackBuffer(new Float32Array(0));
		this.symbols = new Uint8Array(this.PREAMBLE_LEN * 2); // 疑似リングバッファ
		this.recents = new Float32Array(this.HALF_SAMPLE_COUNT * 9);

		this.modulator = new mfsk(this.SAMPLING_RATE, this.SIGNAL_FREQS);

		this.generator = this.processing();
	}

	private log(s: any): void {
		this.port.postMessage(s);
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
			for(let i: number = this.BITS_PER_SIGNAL - 1; i > -1; --i) {
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

	private addSymbol(symbol: number): void {
		this.symbols[this.symbols_index] = symbol;
		this.symbols_index = (this.symbols_index + 1) % this.symbols.length;
	}

	private *waitSamples(count: number): Generator<void, Float32Array, void> {
		while (this.stackBuffer.length < count) {
			yield;
		}
		return this.stackBuffer.readSamples(count);
	}

	process (
		input: Float32Array[][]
	): boolean { // 128サンプルごとに呼び出される 値域は-1.0 ~ 1.0
		const inputs = input[0][0];
		if(!inputs) return true;

		this.stackBuffer.add(inputs); // 128サンプルずつすべてスタックする

		this.generator.next();

		return true;
	}

	* processing() {

		while(true) {

			let samples: Float32Array = yield* this.waitSamples(this.HALF_SAMPLE_COUNT);
			const symbol: number = this.modulator.detectSymbol(samples);
			this.addSymbol(symbol);
			this.recents = concat(this.recents.slice(this.HALF_SAMPLE_COUNT), samples);

			// this.log(`[preamble] ${symbol}, [${this.symbols.join(', ')}][${this.symbols_index}]`);
			// if(this.symbols.length >= this.PREAMBLE_LEN * 2) {} // 起動後最速でやらない限り大丈夫

			let window_1: Uint8Array = new Uint8Array(this.PREAMBLE_LEN);
			let window_2: Uint8Array = new Uint8Array(this.PREAMBLE_LEN);
			for(let i: number = 0; i < this.PREAMBLE_LEN; ++i) {
				let p: number = this.symbols_index - 1 - (2*i) + this.symbols.length;
				window_1[this.PREAMBLE_LEN - i - 1] = this.symbols[p % this.symbols.length];
				window_2[this.PREAMBLE_LEN - i - 1] = this.symbols[(p-1) % this.symbols.length];
			}

			if(isEqual(this.PREAMBLE, window_1) || isEqual(this.PREAMBLE, window_2)) {

				this.log("preamble detected");

				let phase_offset: number = isEqual(this.PREAMBLE, window_2) ? 0 : this.HALF_SAMPLE_COUNT;
				let temp_max: number = 0;
				let start_preamble: number = phase_offset;
				for(let i: number = start_preamble; i < phase_offset + this.HALF_SAMPLE_COUNT; ++i) {
					let score = this.modulator.getScore(this.recents.slice(i, i + this.HALF_SAMPLE_COUNT), this.SIGNAL_FREQS[0]);
					if(score > temp_max) {
						temp_max = score;
						start_preamble = i;
					}
				}

				let header_index = start_preamble + (this.SAMPLE_COUNT * this.PREAMBLE_LEN);
				let buf_size = this.recents.length;
				let buf = this.recents.slice(Math.min(header_index, buf_size));
				let overshoot = Math.max(0, header_index - buf_size);
				let stream_chunk: Float32Array = yield* this.waitSamples(overshoot + 6 * this.SAMPLE_COUNT - buf.length);
				let header: StackBuffer = new StackBuffer(concat(buf, stream_chunk).slice(overshoot));

				let pl_hi = this.modulator.detectSymbol(header.readSamples(this.SAMPLE_COUNT));
				let pl_lo = this.modulator.detectSymbol(header.readSamples(this.SAMPLE_COUNT));
				let payload_length = (pl_hi << 4) | pl_lo;

				let mi_hi = this.modulator.detectSymbol(header.readSamples(this.SAMPLE_COUNT));
				let mi_lo = this.modulator.detectSymbol(header.readSamples(this.SAMPLE_COUNT));
				let message_id = (mi_hi << 4) | mi_lo;

				let c8_hi = this.modulator.detectSymbol(header.readSamples(this.SAMPLE_COUNT));
				let c8_lo = this.modulator.detectSymbol(header.readSamples(this.SAMPLE_COUNT));
				let crc_raw = (c8_hi << 4) | c8_lo;
				let crc_data = [pl_hi, pl_lo, mi_hi, mi_lo]; // TODO: 負の数を扱わないならUint8にする。
				if(crc_raw === this.crc(crc_data)) {
					this.log("header crc check passed");

					this.log("Waiting for payload...")
					let payloads: StackBuffer = new StackBuffer(yield* this.waitSamples(this.SAMPLE_COUNT * payload_length));
					this.log("Payload received");

					let payload_symbols: number[] = [];
					for(let i: number = 0; i < payload_length; ++i) {
						payload_symbols.push(this.modulator.detectSymbol(payloads.readSamples(this.SAMPLE_COUNT)));
					}
					let payload_bits = this.symbol2bits(payload_symbols);

					this.log(payload_bits); // postMessage

				} else {
					this.log("header crc check failed");
				}

			}

			yield; // 一周だけで止める

		}

	}

}

registerProcessor('audio-processor', audioProcessor);