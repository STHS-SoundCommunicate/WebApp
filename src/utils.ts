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
	for (let i: number = 0; i < a.length; i++)
		if (a[i] !== b[i]) return false;
	return true;
}