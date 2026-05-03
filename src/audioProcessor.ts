// AudioWorkletProcessorはブラウザ側に存在し、このクラスをそこに渡すので、IDE補完ができない。
// https://developer.mozilla.org/ja/docs/Web/API/AudioWorkletProcessor
class audioProcessor extends AudioWorkletProcessor {

	private readonly sample_count: number;
	private readonly half_sample_count: number;
	private readonly sample_rate: number;
	private readonly preamble: number[];
	private readonly preamble_len: number;
	private readonly signal_freqs: number[];
	private buffer: Float32Array;

	// private k: number = 0;
	private symbols: number[] = [];

	private concat(arr1: Float32Array, arr2: Float32Array): Float32Array {
		const newArray = new Float32Array(arr1.length + arr2.length);
		newArray.set(arr1);
		newArray.set(arr2, arr1.length);
		return newArray;
	}

	private isEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false;
		}
		return true;
	} // Copilot

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
		return max_freq;
	}

	constructor(options: AudioWorkletNodeOptions) {
		super();
		this.sample_count = options.processorOptions.SAMPLES_COUNT;
		this.half_sample_count = Math.trunc(this.sample_count / 2);
		this.sample_rate = options.processorOptions.SAMPLE_RATE;
		this.preamble = options.processorOptions.PREAMBLE;
		this.preamble_len = this.preamble.length;
		this.signal_freqs = options.processorOptions.SIGNAL_FREQS;
		this.buffer = new Float32Array;
	}

	process (
		input: Float32Array[][],
		output: Float32Array[][],
		parameters: any
	): boolean { // 128サンプルごとに呼び出される Float32は-1.0~1.0
		const inputs = input[0][0];
		if(!inputs) return true;

		this.buffer = this.concat(this.buffer, inputs); // 128サンプルずつすべてスタックする

		if(this.buffer.length >= this.sample_count){
			const samples = this.buffer.slice(0, this.sample_count);
			this.buffer = this.buffer.slice(this.half_sample_count); // 半分だけ残す
			const symbol = this.detect_symbol(samples);
			this.port.postMessage(`[preamble] ${symbol}, [${this.symbols.slice(-8).join(', ')}]`);
			this.symbols.push(symbol);
			if(this.symbols.length >= this.preamble_len * 2) {
				let window = this.symbols.slice(-this.preamble_len * 2);
				let window_2 = window.filter((s, i) => i % 2 === 0);
				let window_1 = window.filter((s, i) => i % 2 === 1);
				if(this.isEqual(this.preamble, window_1) || this.isEqual(this.preamble, window_2)) {
					this.port.postMessage("correct preamble detected!");
					return true;
				}
			}
		}
		return true;
	}
}
registerProcessor('audio-processor', audioProcessor);