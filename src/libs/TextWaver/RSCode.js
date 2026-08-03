import rs from './reedsolomon.js';

function RS(messageLength, errorCorrectionLength) {
    const dataLength = messageLength - errorCorrectionLength;
    const encoder = new rs.ReedSolomonEncoder(rs.GenericGF.AZTEC_PARAM()); // 0~15までの符号を使用する。
    const decoder = new rs.ReedSolomonDecoder(rs.GenericGF.AZTEC_PARAM());
    return {
		dataLength: dataLength,
		messageLength: messageLength,
		errorCorrectionLength: errorCorrectionLength,

		encode: function (message) {
			try {
				encoder.encode(message, errorCorrectionLength);
			} catch (error) {
				console.warn('Reed-Solomon encode failed:', error);
				return false;
			}
			return true;
		},

		decode: function (message) {
			try {
				decoder.decode(message, errorCorrectionLength);
			} catch (error) {
				console.warn('Reed-Solomon decode failed:', error);
				return false;
			}
			return true;
		}
	};
}

/*
 * messageはUint8Arrayなどのクラスであり、ポインタのように直接弄れる。
 */
export function encode(message, errorCorrectionLength) { return RS(message.length, errorCorrectionLength).encode(message); }
export function decode(message, errorCorrectionLength) { return RS(message.length, errorCorrectionLength).decode(message); }