import { mfsk } from './modules/mfsk.ts';
import { modulator } from "./modules/modulator.ts";
import StackBuffer from "./StackBuffer.ts";

// AudioWorkletProcessorはブラウザ側に存在し、このクラスをそこに渡すので、IDE補完ができない。
// https://developer.mozilla.org/ja/docs/Web/API/AudioWorkletProcessor
// @ts-ignore
class audioProcessor extends AudioWorkletProcessor {

	private readonly stackBuffer: StackBuffer; // マイク入力のバイナリをすべて格納
	private m: modulator;
	private generator: Generator;

	constructor(options: AudioWorkletNodeOptions) {
		super();
		this.stackBuffer = new StackBuffer(new Float32Array(0));
		this.m = new mfsk(options.processorOptions); // constが書き換えられる可能性のために毎回生成
		const log = (s: any) => {
			// @ts-ignore
			this.port.postMessage(s);
		};
		this.generator = this.m.process(this.stackBuffer, log); // クラスのアドレス値が渡されて、変更も反映されるはず、、、
	}

	// noinspection JSUnusedGlobalSymbols
	process (input: Float32Array[][]): boolean { // 128サンプルごとに呼び出される 値域は-1.0 ~ 1.0
		const inputs: Float32Array = input[0][0];
		if(!inputs) return true;
		this.stackBuffer.add(inputs); // 128サンプルずつすべてスタックする
		this.generator.next(); // this.m.process()を実行（再開）
		return true;
	}
}

// @ts-ignore
registerProcessor('audio-processor', audioProcessor);