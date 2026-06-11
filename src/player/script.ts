import {BITS_PER_SIGNAL, PREAMBLE, SAMPLING_RATE, SIGNAL_FREQS, SIGNAL_MS} from "../baseScript.ts";

import { crc } from "../utils.ts";

import $ from 'jquery';

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

function generateHeader(payload: Uint8Array): Uint8Array {
	let len: number = payload.length;
	if(len > 255) throw new Error('payload.length > 255');
	let messageId: number = 0;
	let payload_length_symbols: number[]  = [len >> 4, len & 0xF];
	let message_id_symbols: number[] = [messageId >> 4, messageId & 0xF];
	let header_info_symbols: number[] = payload_length_symbols.concat(message_id_symbols);
	console.log(header_info_symbols);
	let c: number = crc(new Uint8Array(header_info_symbols));
	console.log(`info_data : ${header_info_symbols}, crc : ${c}`);
	let cyc_symbols = [c >> 4, c & 0xF];
	return new Uint8Array(PREAMBLE().concat(header_info_symbols).concat(cyc_symbols));
}

function generateWave(index: number, phase: number, sampling_rate: number): [number[], number] {
	let freq: number = SIGNAL_FREQS()[index];
	let n_signals: number = Math.floor(Number(sampling_rate * SIGNAL_MS() / 1000));
	let duration: number = n_signals / sampling_rate;
	let phase_next: number = (phase + (2 * Math.PI * duration * freq)) % (2 * Math.PI);

	let sin = [];
	for(let i: number = 0; i < n_signals; ++i)
		sin.push(Math.sin((2 * Math.PI * freq * (i / sampling_rate)) + phase));

	return [sin, phase_next];

}

// const audioCtx = new AudioContext;
// const analyser = audioCtx.createAnalyser();
// const bufferLength = analyser.frequencyBinCount;
// const dataArray = new Uint8Array(bufferLength);

function playSound(sinData: number[], sampling_rate: number){
	const audioCtx = new AudioContext;

	// 2. AudioBufferの作成 (1チャンネル(モノラル), サンプル数, サンプリングレート)
	const numberOfChannels = 1;
	const bufferLength = sinData.length;
	const audioBuffer = audioCtx.createBuffer(numberOfChannels, bufferLength, sampling_rate);

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

$("#genButton").on('click', () => {
	// let payload_str: string =
	let str = $("#charArea").val() as string;
	let bits = str2bits(str);
	let index = bits2index(bits);
	let header = generateHeader(index);
	let value = new Uint8Array(header.length + index.length);
	value.set(header);
	value.set(index, header.length);
	console.log(value);
	let phase: number = 0;
	let waves: number[] = [];
	const sampling_rate = SAMPLING_RATE();
	value.forEach((i) => {
		let a = generateWave(i, phase, sampling_rate);
		waves = waves.concat(a[0]);
		phase = a[1];
	});
	console.log(waves);
	playSound(waves, sampling_rate);
});

