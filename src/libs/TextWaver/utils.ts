export function crc(symbols: Uint8Array): number {
	let c: number = 0;
	symbols.forEach((s: number): void => {
		c ^= s; // XOR
		for(let _: number = 0; _ < 8; ++_) {
			if(c & 0x80) c = ((c << 1) ^ 0x07) & 0xFF;
			else c = (c << 1) & 0xFF;
		}
	});
	return c;
}

export function concat(arr1: Float32Array, arr2: Float32Array): Float32Array {
	const newArray = new Float32Array(arr1.length + arr2.length);
	newArray.set(arr1);
	newArray.set(arr2, arr1.length);
	return newArray;
}

export function isEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
	if (a.length !== b.length) return false;
	for (let i: number = 0; i < a.length; ++i)
		if (a[i] !== b[i]) return false;
	return true;
}

// utf-8 only
// audioProcessor.tsで読むときにTextEncoderを呼び出すとエラーになるので、関数内で毎回生成
function encodeUTF8(str: string): Uint8Array { return (new TextEncoder).encode(str); }

export function str2bits(str: string): Uint8Array{
	const encodedData: Uint8Array = encodeUTF8(str); // 1Byte区切りのデータ
	let result: Uint8Array = new Uint8Array(encodedData.length * 8); // 8bit = 1byte
	let key: number = 0;
	encodedData.forEach((byte: number): void => {
		for(let i: number = 0; i < 8; ++i)
			result[key++] = ((byte >> (7 - i)) & 1);
	});
	return result;
}

export function decodeUTF8(buffer: Uint8Array): string {
	return (new TextDecoder('utf-8')).decode(buffer); // 'utf-8'は冗長
}

export interface ConstValues {
	CHANNELS: number;
	BITS_PER_SIGNAL: number;
	BPS: number;
	SAMPLING_RATE: number;
	SIGNAL_FREQ_START: number;
	SIGNAL_FREQ_WIDTH: number;
	PREAMBLE: number[];
	SIGNAL_FREQS: Uint16Array;
	SIGNAL_MS: number;
	SAMPLES_COUNT: number;
	useFFT: boolean;
	useRS: boolean;
	RS_ErrorLength: number;
}