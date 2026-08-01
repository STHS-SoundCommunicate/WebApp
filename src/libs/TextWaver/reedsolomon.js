/*#!/usr/bin/env node
 * Original implementation is ZXing and ported to JavaScript by cho45.
 * Copyright 2007 ZXing authors
 *
 * Licensed under the Apache License, Version 2.0
 */

class GenericGF {
	constructor(primitive, size, generatorBase) {
		this.primitive = primitive;
		this.size = size;
		this.generatorBase = generatorBase;

		this.expTable = new Int32Array(size);
		this.logTable = new Int32Array(size);

		let x = 1;
		for (let i = 0; i < size; i++) {
			this.expTable[i] = x;
			x *= 2;

			if (x >= size) {
				x ^= primitive;
				x &= size - 1;
			}
		}

		for (let i = 0; i < size - 1; i++) {
			this.logTable[this.expTable[i]] = i;
		}

		this.zero = new GenericGFPoly(this, GenericGFPoly.COEFFICIENTS_ZERO);
		this.one = new GenericGFPoly(this, GenericGFPoly.COEFFICIENTS_ONE);
	}

	buildMonomial(degree, coefficient) {
		if (degree < 0) {
			throw new Error("IllegalArgumentException()");
		}

		if (coefficient === 0) {
			return this.zero;
		}

		const coefficients = new Int32Array(degree + 1);
		coefficients[0] = coefficient;
		return new GenericGFPoly(this, coefficients);
	}

	getZero() {
		return this.zero;
	}

	getOne() {
		return this.one;
	}

	exp(a) {
		return this.expTable[a];
	}

	log(a) {
		if (a === 0) {
			throw new Error("IllegalArgumentException()");
		}

		return this.logTable[a];
	}

	inverse(a) {
		if (a === 0) {
			throw new Error("ArithmeticException()");
		}

		return this.expTable[this.size - this.logTable[a] - 1];
	}

	multiply(a, b) {
		if (a === 0 || b === 0) {
			return 0;
		}

		return this.expTable[(this.logTable[a] + this.logTable[b]) % (this.size - 1)];
	}

	getSize() {
		return this.size;
	}

	getGeneratorBase() {
		return this.generatorBase;
	}

	toString() {
		return `GF(0x${Number(this.primitive).toString(16)},${this.size})`;
	}

	static addOrSubtract(a, b) {
		return a ^ b;
	}
}

class GenericGFPoly {

	constructor(field, coefficients) {
		if (coefficients.length === 0) {
			throw new Error("IllegalArgumentException()");
		}

		this.field = field;

		const coefficientsLength = coefficients.length;

		if (coefficientsLength > 1 && coefficients[0] === 0) {
			let firstNonZero = 1;

			while (firstNonZero < coefficientsLength && coefficients[firstNonZero] === 0) {
				firstNonZero++;
			}

			if (firstNonZero === coefficientsLength) {
				this.coefficients = GenericGFPoly.COEFFICIENTS_ZERO;
			} else {
				this.coefficients = coefficients.subarray(firstNonZero, coefficientsLength);
			}
		} else {
			this.coefficients = coefficients;
		}

		this.degree = this.coefficients.length - 1;
	}

	getCoefficients() {
		return this.coefficients;
	}

	getDegree() {
		return this.degree;
	}

	isZero() {
		return this.coefficients[0] === 0;
	}

	getCoefficient(degree) {
		return this.coefficients[this.coefficients.length - 1 - degree];
	}

	evaluateAt(a) {
		if (a === 0) {
			return this.getCoefficient(0);
		}

		const coefficients = this.coefficients;
		const size = coefficients.length;

		if (a === 1) {
			let result = 0;

			for (let i = 0; i < coefficients.length; i++) {
				result = GenericGF.addOrSubtract(result, coefficients[i]);
			}

			return result;
		}

		let result = coefficients[0];

		for (let i = 1; i < size; i++) {
			result = GenericGF.addOrSubtract(this.field.multiply(a, result), coefficients[i]);
		}

		return result;
	}

	addOrSubtract(other, buf) {
		if (this.field !== other.field) {
			throw new Error('IllegalArgumentException("GenericGFPolys do not have same GenericGF field")');
		}

		if (this.isZero()) {
			return other;
		}

		if (other.isZero()) {
			return this;
		}

		let smallerCoefficients = this.coefficients;
		let largerCoefficients = other.coefficients;

		if (smallerCoefficients.length > largerCoefficients.length) {
			const temp = smallerCoefficients;
			smallerCoefficients = largerCoefficients;
			largerCoefficients = temp;
		}

		const sumDiff = buf
			? buf.subarray(0, largerCoefficients.length)
			: new Int32Array(largerCoefficients.length);

		const lengthDiff = largerCoefficients.length - smallerCoefficients.length;

		for (let i = lengthDiff; i < largerCoefficients.length; i++) {
			sumDiff[i] = GenericGF.addOrSubtract(
				smallerCoefficients[i - lengthDiff],
				largerCoefficients[i],
			);
		}

		sumDiff.set(largerCoefficients.subarray(0, lengthDiff));

		return new GenericGFPoly(this.field, sumDiff);
	}

	multiply(other) {
		if (other instanceof GenericGFPoly) {
			return this.multiplyGenericGFPoly(other);
		}

		return this.multiplyScalar(other);
	}

	multiplyGenericGFPoly(other) {
		if (this.field !== other.field) {
			throw new Error('IllegalArgumentException("GenericGFPolys do not have same GenericGF field")');
		}

		if (this.isZero() || other.isZero()) {
			return this.field.zero;
		}

		const aCoefficients = this.coefficients;
		const bCoefficients = other.coefficients;
		const product = new Int32Array(aCoefficients.length + bCoefficients.length - 1);

		for (let i = 0; i < aCoefficients.length; i++) {
			const aCoeff = aCoefficients[i];

			for (let j = 0; j < bCoefficients.length; j++) {
				product[i + j] = GenericGF.addOrSubtract(
					product[i + j],
					this.field.multiply(aCoeff, bCoefficients[j]),
				);
			}
		}

		return new GenericGFPoly(this.field, product);
	}

	multiplyScalar(scalar) {
		if (scalar === 0) {
			return this.field.zero;
		}

		if (scalar === 1) {
			return this;
		}

		const product = new Int32Array(this.coefficients.length);

		for (let i = 0; i < this.coefficients.length; i++) {
			product[i] = this.field.multiply(this.coefficients[i], scalar);
		}

		return new GenericGFPoly(this.field, product);
	}

	multiplyByMonomial(degree, coefficient) {
		if (degree < 0) {
			throw new Error("IllegalArgumentException()");
		}

		if (coefficient === 0) {
			return this.field.zero;
		}

		const product = new Int32Array(this.coefficients.length + degree);

		for (let i = 0; i < this.coefficients.length; i++) {
			product[i] = this.field.multiply(this.coefficients[i], coefficient);
		}

		return new GenericGFPoly(this.field, product);
	}

	divide(other) {
		if (this.field !== other.field) {
			throw new Error('IllegalArgumentException("GenericGFPolys do not have same GenericGF field")');
		}

		if (other.isZero()) {
			throw new Error('IllegalArgumentException("Divide by 0")');
		}

		let quotient = this.field.getZero();
		let remainder = this;

		const denominatorLeadingTerm = other.getCoefficient(other.degree);
		const inverseDenominatorLeadingTerm = this.field.inverse(denominatorLeadingTerm);

		while (remainder.degree >= other.degree && !remainder.isZero()) {
			const degreeDifference = remainder.degree - other.degree;
			const scale = this.field.multiply(
				remainder.getCoefficient(remainder.degree),
				inverseDenominatorLeadingTerm,
			);

			const term = other.multiplyByMonomial(degreeDifference, scale);
			const iterationQuotient = this.field.buildMonomial(degreeDifference, scale);

			quotient = quotient.addOrSubtract(iterationQuotient, quotient.coefficients);
			remainder = remainder.addOrSubtract(term, remainder.coefficients);
		}

		return [quotient, remainder];
	}

	toString() {
		let result = "";

		for (let degree = this.degree; degree >= 0; degree--) {
			let coefficient = this.getCoefficient(degree);

			if (coefficient === 0) {
				continue;
			}

			if (coefficient < 0) {
				result += " - ";
				coefficient = -coefficient;
			} else if (result.length > 0) {
				result += " + ";
			}

			if (degree === 0 || coefficient !== 1) {
				const alphaPower = this.field.log(coefficient);

				if (alphaPower === 0) {
					result += "1";
				} else if (alphaPower === 1) {
					result += "a";
				} else {
					result += `a^${alphaPower}`;
				}
			}

			if (degree !== 0) {
				result += degree === 1 ? "x" : `x^${degree}`;
			}
		}

		return result;
	}
}

GenericGFPoly.COEFFICIENTS_ZERO = new Int32Array([0]);
GenericGFPoly.COEFFICIENTS_ONE = new Int32Array([1]);

class ReedSolomonEncoder {
	constructor(field) {
		this.field = field;
		this.cachedGenerators = [new GenericGFPoly(field, new Int32Array([1]))];
	}

	buildGenerator(degree) {
		if (degree >= this.cachedGenerators.length) {
			let lastGenerator = this.cachedGenerators[this.cachedGenerators.length - 1];

			for (let d = this.cachedGenerators.length; d <= degree; d++) {
				const nextGenerator = lastGenerator.multiply(
					new GenericGFPoly(
						this.field,
						new Int32Array([1, this.field.exp(d - 1 + this.field.generatorBase)]),
					),
				);

				this.cachedGenerators.push(nextGenerator);
				lastGenerator = nextGenerator;
			}
		}

		return this.cachedGenerators[degree];
	}

	encode(toEncode, ecBytes) {
		if (ecBytes === 0) {
			throw new Error('IllegalArgumentException("No error correction bytes")');
		}

		const dataBytes = toEncode.length - ecBytes;

		if (dataBytes <= 0) {
			throw new Error('IllegalArgumentException("No data bytes provided")');
		}

		const generator = this.buildGenerator(ecBytes);
		const infoCoefficients = new Int32Array(dataBytes);
		infoCoefficients.set(toEncode.subarray(0, dataBytes));

		let info = new GenericGFPoly(this.field, infoCoefficients);
		info = info.multiplyByMonomial(ecBytes, 1);

		const remainder = info.divide(generator)[1];
		const coefficients = remainder.coefficients;
		const numZeroCoefficients = ecBytes - coefficients.length;

		for (let i = 0; i < numZeroCoefficients; i++) {
			toEncode[dataBytes + i] = 0;
		}

		toEncode.set(coefficients.subarray(0, coefficients.length), dataBytes + numZeroCoefficients);
	}
}

class ReedSolomonDecoder {
	constructor(field) {
		this.field = field;
	}

	decode(received, twoS) {
		const poly = new GenericGFPoly(this.field, received);
		const syndromeCoefficients = new Int32Array(twoS);
		let noError = true;

		for (let i = 0; i < twoS; i++) {
			const evalResult = poly.evaluateAt(this.field.exp(i + this.field.generatorBase));
			syndromeCoefficients[syndromeCoefficients.length - 1 - i] = evalResult;

			if (evalResult !== 0) {
				noError = false;
			}
		}

		if (noError) {
			return;
		}

		const syndrome = new GenericGFPoly(this.field, syndromeCoefficients);
		const [sigma, omega] = this.runEuclideanAlgorithm(
			this.field.buildMonomial(twoS, 1),
			syndrome,
			twoS,
		);

		const errorLocations = this.findErrorLocations(sigma);
		const errorMagnitudes = this.findErrorMagnitudes(omega, errorLocations);

		for (let i = 0; i < errorLocations.length; i++) {
			const position = received.length - 1 - this.field.log(errorLocations[i]);

			if (position < 0) {
				throw new Error('ReedSolomonException("Bad error location")');
			}

			received[position] = GenericGF.addOrSubtract(received[position], errorMagnitudes[i]);
		}
	}

	runEuclideanAlgorithm(a, b, R) {
		if (a.degree < b.degree) {
			const temp = a;
			a = b;
			b = temp;
		}

		let rLast = a;
		let r = b;
		let tLast = this.field.zero;
		let t = this.field.one;

		while (r.degree >= R / 2) {
			const rLastLast = rLast;
			const tLastLast = tLast;

			rLast = r;
			tLast = t;

			if (rLast.isZero()) {
				throw new Error('ReedSolomonException("r_{i-1} was zero")');
			}

			r = rLastLast;

			let q = this.field.zero;
			const denominatorLeadingTerm = rLast.getCoefficient(rLast.degree);
			const dltInverse = this.field.inverse(denominatorLeadingTerm);

			while (r.degree >= rLast.degree && !r.isZero()) {
				const degreeDiff = r.degree - rLast.degree;
				const scale = this.field.multiply(r.getCoefficient(r.degree), dltInverse);

				q = q.addOrSubtract(this.field.buildMonomial(degreeDiff, scale));
				r = r.addOrSubtract(rLast.multiplyByMonomial(degreeDiff, scale));
			}

			t = q.multiply(tLast).addOrSubtract(tLastLast);

			if (r.degree >= rLast.degree) {
				throw new Error('IllegalStateException("Division algorithm failed to reduce polynomial?")');
			}
		}

		const sigmaTildeAtZero = t.getCoefficient(0);

		if (sigmaTildeAtZero === 0) {
			throw new Error('ReedSolomonException("sigmaTilde(0) was zero")');
		}

		const inverse = this.field.inverse(sigmaTildeAtZero);
		const sigma = t.multiply(inverse);
		const omega = r.multiply(inverse);

		return [sigma, omega];
	}

	findErrorLocations(errorLocator) {
		const numErrors = errorLocator.degree;

		if (numErrors === 1) {
			return new Int32Array([errorLocator.getCoefficient(1)]);
		}

		const result = new Int32Array(numErrors);
		let e = 0;

		for (let i = 1; i < this.field.size && e < numErrors; i++) {
			if (errorLocator.evaluateAt(i) === 0) {
				result[e] = this.field.inverse(i);
				e++;
			}
		}

		if (e !== numErrors) {
			throw new Error('ReedSolomonException("Error locator degree does not match number of roots")');
		}

		return result;
	}

	findErrorMagnitudes(errorEvaluator, errorLocations) {
		const s = errorLocations.length;
		const result = new Int32Array(s);

		for (let i = 0; i < s; i++) {
			const xiInverse = this.field.inverse(errorLocations[i]);
			let denominator = 1;

			for (let j = 0; j < s; j++) {
				if (i !== j) {
					denominator = this.field.multiply(
						denominator,
						GenericGF.addOrSubtract(
							1,
							this.field.multiply(errorLocations[j], xiInverse),
						),
					);
				}
			}

			result[i] = this.field.multiply(
				errorEvaluator.evaluateAt(xiInverse),
				this.field.inverse(denominator),
			);

			if (this.field.generatorBase !== 0) {
				result[i] = this.field.multiply(result[i], xiInverse);
			}
		}

		return result;
	}
}

function lazy(func) {
	let value;

	return function () {
		if (!value) {
			value = func();
		}

		return value;
	};
}

GenericGF.AZTEC_DATA_12 = lazy(() => new GenericGF(0x1069, 4096, 1));
GenericGF.AZTEC_DATA_10 = lazy(() => new GenericGF(0x409, 1024, 1));
GenericGF.AZTEC_DATA_6 = lazy(() => new GenericGF(0x43, 64, 1));
GenericGF.AZTEC_PARAM = lazy(() => new GenericGF(0x13, 16, 1));
GenericGF.QR_CODE_FIELD_256 = lazy(() => new GenericGF(0x011D, 256, 0));
GenericGF.DATA_MATRIX_FIELD_256 = lazy(() => new GenericGF(0x012D, 256, 1));
GenericGF.AZTEC_DATA_8 = GenericGF.DATA_MATRIX_FIELD_256;
GenericGF.MAXICODE_FIELD_64 = GenericGF.AZTEC_DATA_6;

function dump(array) {
	console.log(Array.prototype.join.call(array));
}

const rs = {
	GenericGF,
	GenericGFPoly,
	ReedSolomonEncoder,
	ReedSolomonDecoder,
	dump,
};

export default rs;