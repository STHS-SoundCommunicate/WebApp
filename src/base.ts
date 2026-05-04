// https://qiita.com/hiro-hiro/items/9879a297cf5b30c474e2

export abstract class base {

	protected constructor(
		protected readonly SAMPLING_RATE: number
	) {}

	abstract detectSymbol(samples: Float32Array): number;

	abstract getScore(samples: Float32Array, freq: number): number; // [db] or something

}