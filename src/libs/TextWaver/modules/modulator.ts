// https://qiita.com/hiro-hiro/items/9879a297cf5b30c474e2

import StackBuffer from "../StackBuffer.ts";
import { ConstValues } from "../utils.ts";

export abstract class modulator {

	public static readonly PREAMBLE_DETECTED: 0 = 0;
	public static readonly HEADER_CRC_CHECK_PASSED: 1 = 1;
	public static readonly HEADER_CRC_CHECK_FAILED: 2 = 2;
	public static readonly PAYLOAD_DETECTED: 3 = 3;

	public static readonly RS_DECODE_FAILED: 4 = 4;

	protected constructor(
		public readonly constValues: ConstValues
	) {}

	public abstract detectSymbol(samples: Float32Array): number;

	/*
	log() : MessagePortのpostMessageを用いて、script.tsに送信する
	Stateフラグとデータを配列形式で渡す。そのほかはデバッグログ系統。
	 */
	public abstract process(stackBuffer: StackBuffer, log: (s: any) => void): Generator;

	public abstract generateWave(bits: Uint8Array): Float32Array;

}