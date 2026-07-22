import { concat } from "./utils.ts";

class StackBuffer {

	public constructor(
		private buffer: Float32Array
	) {}

	public get length(): number {
		return this.buffer.length;
	}

	public readSamples(count?: number): Float32Array {
		if(count === undefined) count = this.length; // 全て読み込む
		if(count > this.length)
			throw new Error('argument count is larger than length of stackBuffer');
		const sample: Float32Array = this.buffer.slice(0, count);
		this.buffer = this.buffer.slice(count); // 一度readしたものは削除する
		return sample;
	}

	public *waitSamples(count: number): Generator {
		while(count > this.length) yield;
		return this.readSamples(count);
	}

	public add(samples: Float32Array): void {
		this.buffer = concat(this.buffer, samples);
	}

	public clone(): StackBuffer {
		return new StackBuffer(this.buffer);
	}

}

export default StackBuffer;