// https://qiita.com/hiro-hiro/items/9879a297cf5b30c474e2

import StackBuffer from "../StackBuffer.ts";

export abstract class modulator {

	protected constructor(
		public readonly SAMPLING_RATE: number
	) {}

	public abstract detectSymbol(samples: Float32Array): number;

	/*
	log() : MessagePortのpostMessageを用いて、script.tsに送信する
	ArrayBufferが渡されたときのみ解析後のデータである。それ以外はデバッグログ
	 */
	public abstract process(stackBuffer: StackBuffer, log: (s: any) => void): Generator;

	public abstract generateWave(bits: Uint8Array): Float32Array;

}