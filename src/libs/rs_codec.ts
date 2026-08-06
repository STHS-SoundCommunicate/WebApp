//後程おまじないを追記
const PRIMITIVE_POLYNOMIAL: number = 0x11d; //除算用の原始多項式

const GF_EXP: number[] = new Array(512).fill(0);
const GF_LOG: number[] = new Array(256).fill(0);

//GF(256)の指数、対数表を生成
function initialize_gf256_table(): void {
	let value: number = 1;
	for(let i: number = 0; i < 255; ++i) {
		GF_EXP[i] = value;
		GF_LOG[value] = i;
		value <<= 1;
		if(value & 0x100) value ^= PRIMITIVE_POLYNOMIAL;
	}

	for(let i: number = 255; i< 512; ++i) {
		GF_EXP[i] = GF_EXP[i - 255];
	}  
}

initialize_gf256_table();

function mod_255(a: number): number {
	return ((a % 255) + 255) % 255;
}
//なお未使用
function add_gf256(a: number, b: number): number {
	return a ^ b;
}
//なお未使用(2回目)
function subtract_gf256(a: number, b: number): number {
	return a ^ b;
}

function multiply_gf256(a: number, b: number): number {
	if (a === 0 || b === 0) return 0;
	return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

function divide_gf256(a: number, b: number): number {
	if (b === 0) throw new Error("ゼロ除算が許されるのは小学生までだよね");
	if (a === 0) return 0;
	return GF_EXP[mod_255(GF_LOG[a] - GF_LOG[b])];
}
//なお
function power_gf256(a: number, n: number): number {
	if (n === 0) return 1;
	if (a === 0) return 0;
	return GF_EXP[mod_255(GF_LOG[a] * n)];
}

function inverse_gf256(a: number): number {
	if (a === 0) throw new Error(
		"ゼロの逆数は存在しないとされていますが...なんと...今回に限り?!"
	);
	return GF_EXP[255 - GF_LOG[a]];
}

//多項式演算

//各項の乗算　なお
function polynomial_scale(poly: number[], x: number): number[] {
	const result: number[] = [];
	for(let i: number = 0; i < poly.length; ++i) {
		result.push(multiply_gf256(poly[i], x));
	}
	return result;
}

//多項式の加算　なお
function polynomial_add(poly1: number[], poly2: number[]): number[] {
	const maxlength: number = Math.max(poly1.length, poly2.length);
	const result: number[] = new Array(maxlength).fill(0);
	for(let i: number = 0; i < maxlength; ++i) {
		const a: number = i < poly1.length ? poly1[i] : 0;
		const b: number = i < poly2.length ? poly2[i] : 0; 
		result[i] = a ^ b;
	}
	return result;
}

//多項式の乗算
function polynomial_multiply(poly1: number[], poly2: number[]): number[] {
	const result : number[] = new Array(poly1.length + poly2.length - 1).fill(0);
	for(let i: number = 0; i < poly1.length; ++i) {
		for(let j: number = 0; j < poly2.length; ++j) {
			result[i + j] ^= multiply_gf256(poly1[i], poly2[j]);
		}
	}
	return result;
}

//多項式の値の計算
function polynomial_evaluate(poly: number[], x: number): number {
	let result: number = 0;
	let power: number = 1;

	for(let i: number = 0; i < poly.length; ++i) {
		result ^= multiply_gf256(poly[i], power);
		power = multiply_gf256(power, x);
	}
	return result;
}

//RS符号の生成多項式を生成
function generate_rs_generator_polynomial(parity_symbols: number): number[] {
	let generator: number[] = [1];
	for(let i: number = 0; i < parity_symbols; ++i) {
		const temp: number[] = [GF_EXP[i], 1];
		generator = polynomial_multiply(generator, temp);
	}
	return generator;
}

//RS符号のパリティを生成 分割度を高めるために符号だけ返す
export function generate_rs_parity(message_bytes: Uint8Array, parity_symbols: number): Uint8Array {
	const generator: number[] = generate_rs_generator_polynomial(parity_symbols);
	const encoded: Uint8Array = new Uint8Array(message_bytes.length + parity_symbols);
	encoded.set(message_bytes);

	for(let i: number = 0; i < message_bytes.length; ++i) {
		const coefficient: number = encoded[i];
		if(coefficient === 0) continue;
		const factor: number = divide_gf256(coefficient, generator[0]);
		for(let j: number = 0; j < generator.length; ++j)
			encoded[i + j] ^= multiply_gf256(generator[j], factor);
	}
	return encoded.slice(message_bytes.length);
}


/*モジュール分割的に別のプログラム内で関数呼び出してそれらを繋げたほうがいいのではと思ったので一旦未実装
export function generate_rs_protected_bytes(text: string, parity_symbols: number): number[] {
	const message_bytes: number[] = Array.from(text).map(char => char.charCodeAt(0));
	const parity_bytes: number[] = generate_rs_parity(message_bytes, parity_symbols);
	return message_bytes.concat(parity_bytes);
}
*/

//シンドローム計算
function calculate_rs_syndromes(codeword: number[], parity_symbols: number): number[] {
	const syndromes: number[] = [];
	for(let i: number = 0; i< parity_symbols; ++i) {
		const x: number = GF_EXP[i];
		let syndrome: number = 0;
		let power: number = 1;

		for(let j: number = 0; j < codeword.length; ++j) {
			syndrome ^= multiply_gf256(codeword[j], power);
			power = multiply_gf256(power, x);
		}
		syndromes.push(syndrome);
	}
	return syndromes;
}

/*RS符号の誤り検出 Python側で呼び出されてないのでコメントアウト
function has_rs_errors(codeword: number[], parity_symbols: number): boolean {
	const syndromes: number[] = calculate_rs_syndromes(codeword, parity_symbols);
	return syndromes.some((s: number): boolean => s !== 0); 
}*/

//シンドロームから誤りのある位置を特定
function berlekamp_massey(syndromes: number[]): [number[], number] {
	const sigma: number[] = [1];
	let previous_sigma: number[] = [1];

	let L: number = 0;
	let m: number = 1;
	let b: number = 1;

	for(let n: number = 0; n < syndromes.length; ++n) {
		let discrepancy: number = syndromes[n];
		for(let i: number = 1; i <= L; ++i) {
			discrepancy ^= multiply_gf256(sigma[i], syndromes[n - i]);
		}
		if(discrepancy === 0) {
			m += 1;
			continue;
		}
		const temp_sigma: number[] = sigma.slice();

		const scale: number = divide_gf256(discrepancy, b);
		while(sigma.length < previous_sigma.length + m)sigma.push(0);
		for(let i: number = 0; i < previous_sigma.length; ++i) {
			sigma[i + m] ^= multiply_gf256(scale, previous_sigma[i]);
		}
		if(2 * L <= n) {
			L = n + 1 - L;
			previous_sigma = temp_sigma;
			b = discrepancy;
			m = 1;
		}else {
			m += 1;
		}
	}
	return [sigma,L];
}
//誤りかもしれない箇所に総当たりで探索
function chien_search(error_locator: number[], code_length: number): number[] {
	const error_positions: number[] = [];
	for(let i: number = 0; i < code_length; ++i) {
		const x: number = GF_EXP[mod_255(255 - i)];
		if(polynomial_evaluate(error_locator, x) === 0)
			error_positions.push(i);
	}
	return error_positions;
}

function calculate_error_evaluator(
	syndromes: number[], error_locator: number[], parity_symbols: number
): number[] {
	const syndrome_poly: number[] = [0].concat(syndromes);
	const product: number[] = polynomial_multiply(syndrome_poly, error_locator);
	return product.slice(0, parity_symbols);
}

//誤り位置の微分
function formal_derivative(polynomial: number[]): number[] {
	const result: number[] = [];
	for(let i: number = 1; i < polynomial.length; ++i) {
		if(i % 2 === 1)
			result.push(polynomial[i]);
		else
			result.push(0);
	}
	if(result.length === 0) result.push(0);
	return result;
}

//Forney法で誤り値を計算する
function forney_algorithm(
	syndromes: number[], error_locator: number[], error_positions: number[]
): number[] {
	const error_evaluator: number[] = calculate_error_evaluator(
		syndromes, error_locator, syndromes.length
	);
	const locator_derivative: number[] = formal_derivative(error_locator);
	const error_values: number[] = [];

	for(let i: number = 0; i < error_positions.length; ++i) {
		const x: number = GF_EXP[mod_255(255 - error_positions[i])];
		const numerator: number = polynomial_evaluate(error_evaluator, x);
		const denominator: number = polynomial_evaluate(locator_derivative, x);
		const xp: number =inverse_gf256(x);

		const magnitude: number = multiply_gf256(
			multiply_gf256(xp,xp),
			divide_gf256(numerator, denominator)
		);

		error_values.push(magnitude);
	}
	return error_values;
}

//RS符号の誤り訂正
function correct_rs_errors(
	codeword: number[], parity_symbols: number
): number[] {
	const syndromes: number[] = calculate_rs_syndromes(codeword, parity_symbols);
	if(syndromes.every((s: number): boolean => s === 0)) {
		return codeword;
	}

	const [error_locator, error_count]: [number[], number] = 
		berlekamp_massey(syndromes);
	const error_positions: number[] = 
		chien_search(error_locator, codeword.length);

	if(error_positions.length !== error_count) {
		throw new Error("誤り位置を特定できません");
	}

	const error_values: number[] = 
		forney_algorithm(syndromes, error_locator, error_positions);
	const corrected: number[] = codeword.slice();

	for(let i: number = 0; i < error_positions.length; ++i) {
		corrected[error_positions[i]] ^= error_values[i];
	}
	return corrected;
}

export function rs_decode(received: Uint8Array, parity_symbols: number): Uint8Array {
	const corrected: number[] = correct_rs_errors(Array.from(received), parity_symbols);
	return Uint8Array.from(corrected.slice(0, corrected.length - parity_symbols));
}