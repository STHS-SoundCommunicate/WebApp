import {BITS_PER_SIGNAL, PREAMBLE, SAMPLING_RATE, SIGNAL_FREQS, SIGNAL_MS} from "../baseScript.ts";

import {crc} from "../audioProcessor.ts";

const encoder = new TextEncoder; // utf-8 only
function encodeUTF8(str: string): Uint8Array {
	return encoder.encode(str);
}

function str2bits(str: string): Uint8Array {
	let result: number[] = [];
	encodeUTF8(str).forEach((byte) => {
		for(let i: number = 0; i < 8; ++i) {
			result.push((byte >> (7 - i)) & 1);
		}
	});
	return new Uint8Array(result);
}

function bits2index(bits: Uint8Array): Uint8Array {
	let result = [];
	const bits_per_signal: number = BITS_PER_SIGNAL();
	for(let i: number = 0; i < bits.length; i += bits_per_signal) {
		let index: number = 0;
		for(let j: number = 0; j < bits_per_signal; ++j) {
			index = (index << 1) | bits[i + j];
		}
		result.push(index);
	}
	return new Uint8Array(result);
}

function generateHeader(payload: Uint8Array) {
	let len: number = payload.length;
	if(len > 255) throw new Error('payload.length > 255');
	let messageId = 0;
	let payload_length_symbols  = [len >> 4, len & 0xF];
	let message_id_symbols = [messageId >> 4, messageId & 0xF];
	let header_info_symbols = payload_length_symbols.concat(message_id_symbols);
	let c: number = crc(new Uint8Array(header_info_symbols));
	console.log(`info_data : ${header_info_symbols}, crc : ${crc}`);
	let cyc_symbols = [c >> 4, c & 0xF];
	return PREAMBLE().concat(header_info_symbols).concat(cyc_symbols);
}

function generateWave(index: number, phase: number) {
	let freq: number = SIGNAL_FREQS()[index];
	let sample_rate: number = SAMPLING_RATE();
	let n_signals: number = Number(sample_rate * SIGNAL_MS() / 1000);
	let duration = n_signals / sample_rate;
	let phase_next = phase + (2 * Math.PI * duration * freq) % (2 * Math.PI);

	let sin = [];
	for(let i: number = 0; i < n_signals; ++i) {
		sin.push(Math.sin(2 * Math.PI * (i / sample_rate) + phase));
	}

	return [sin, phase_next];

}

// const audioCtx = new AudioContext;
// const analyser = audioCtx.createAnalyser();
// const bufferLength = analyser.frequencyBinCount;
// const dataArray = new Uint8Array(bufferLength);

function playSound(sinData: number[], sampleRate: number){
	const audioCtx = new AudioContext;

	// 2. AudioBufferの作成 (1チャンネル(モノラル), サンプル数, サンプリングレート)
	const numberOfChannels = 1;
	const bufferLength = sinData.length;
	const audioBuffer = audioCtx.createBuffer(numberOfChannels, bufferLength, sampleRate);

	// 3. バッファのチャンネルデータ（Float32Array）を取得し、sinデータをコピー
	const channelData = audioBuffer.getChannelData(0);
	channelData.set(sinData);

	// 4. 再生用のソースノードを作成してバッファをセット
	const sourceNode = audioCtx.createBufferSource();
	sourceNode.buffer = audioBuffer;

	// 5. ソースノードを出力先（スピーカー）に接続
	sourceNode.connect(audioCtx.destination);

	// 6. 再生開始
	sourceNode.start();
}

