import $ from 'jquery';
// import * as Tone from 'tone'



import _const from './const.json';
const signal_ms = 1 / _const.bps * _const.bits_per_signal * 1000;
const baud_rate = 1000 / signal_ms;
const preamble_len = _const.preamble.length;
let signal_freqs: number[] = [];
for(let i = 0; i < _const.channels; ++i) {
	signal_freqs.push(_const.signal_freq_start + i * _const.signal_freq_width);
}

// const samples = Math.trunc((_const.sampling_rate * signal_ms) / 1000);
const samples = Math.trunc(_const.sampling_rate / baud_rate);
const half_samples = Math.trunc(samples / 2);


const button = $('#toggleButton');
const stats = $('#stats');
const result = $('#result');
button.on('click', () => {
	stats.text('マイクを起動中です...');
	toggleSound();
});

// https://qiita.com/7shi/items/3866fac27ba488ec74c7

const audioCtx = new AudioContext;
const analyser = audioCtx.createAnalyser();
const gain = audioCtx.createGain();
gain.gain.value = 1;
gain.connect(analyser);
analyser.fftSize = 2048;
// https://developer.mozilla.org/ja/docs/Web/API/AudioContext
let stream: MediaStream | null = null;

function log(s: string) {
	result.text(result.text() + `\n${s}`);
	result.scrollTop(
		result[0].scrollHeight - result.height()
	);
}

function concat(arr1: Float32Array, arr2: Float32Array) {
	const newArray = new Float32Array(arr1.length + arr2.length);
	newArray.set(arr1);
	newArray.set(arr2, arr1.length);
	return newArray;
}

function encodeUTF8(str: string) {
	const encoder = new TextEncoder; // utf-8 only
	return encoder.encode(str);
}

function decodeUTF8(buffer: ArrayBuffer) {
	const decoder = new TextDecoder('utf-8'); // 冗長
	return decoder.decode(buffer);
}



function readSamples(count: number): Float32Array {
	// let s = new Float32Array(count);
	let s = new Float32Array(analyser.frequencyBinCount);
	analyser.getFloatFrequencyData(s);
	// s = s.slice(s.length - half_samples);
	console.log(s);
	return s;
}

// function readSymbol(): number {
// 	let s = readSamples(samples);
// 	if(s.length < samples) {
// 		throw new Error('samples.length < samples');
// 	}
// 	return detect_symbol(s);
// }

function listen() {

	if(stream === null) return;

	let buffer = new Float32Array(samples); // 0で初期化されるはず、、、
	let k = 0;
	let symbols: number[] = [];
	let s = readSamples(half_samples);
	if(s.length < half_samples) {
		throw new Error('samples.length < half_samples');
	}
	buffer = concat(buffer.slice(half_samples), s);
	let symbol = detect_symbol(buffer);
	symbols.push(symbol);
	++k;
	log(`[preamble] ${k}, ${symbol}, [${symbols.slice(-8).join(', ')}]`); // debug
	if(symbols.length >= preamble_len*2) {
		let window = symbols.slice(-preamble_len*2);
		let window_2 = window.filter((s, i) => i % 2 === 0);
		let window_1 = window.filter((s, i) => i % 2 === 1);
		if(window_2 === _const.preamble || window_1 === _const.preamble) {
			return;
		}
	}
	requestAnimationFrame(listen);
}

function detect_symbol(s: Float32Array) {
	let max_freq: number = 0; // はたしてやっていい初期化なのだろうか
	let max_db: number;
	signal_freqs.forEach((f) => {
		let bin = Math.round((f / _const.sampling_rate) * analyser.fftSize); // changeable
		let db = s[bin];
		if(max_freq === 0 || db > max_db) {
			max_db = db;
			max_freq = f;
		}
	});
	return max_freq;
}

// function symbol2text(symbols) {
//
// }





const canvas = document.getElementById('visualizer') as HTMLCanvasElement;
const canvasCtx = canvas.getContext('2d') as CanvasRenderingContext2D;
const WIDTH = canvas.width;
const HEIGHT = canvas.height;
canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
canvasCtx.fillStyle = "rgb(200, 200, 200)";
canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

function toggleSound() {
	if(stream instanceof MediaStream) {
		stream.getTracks().forEach((t) => t.stop());
		stream = null;
		stats.text('録音を停止しました');
		audioCtx.suspend().then();
	} else {
		audioCtx.resume().then(() => {
			navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
				stream = s;
				stream.getTracks().forEach((t) => {
					t.getSettings().sampleRate = _const.sampling_rate;
					t.getSettings().channelCount = _const.channels;
				});
				audioCtx.createMediaStreamSource(stream).connect(gain);
				stats.text('録音中です...');
				visualize();
				listen();
			}).catch((e) => {
				console.error(e);
				stats.text(`エラーが発生しました。(${e})`);
			});
		});
	}
}

function visualize() { // https://developer.mozilla.org/ja/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API
	if(stream === null) return;

	requestAnimationFrame(visualize);

	let bufferLength = analyser.frequencyBinCount;
	let dataArray = new Uint8Array(bufferLength);
	analyser.getByteTimeDomainData(dataArray); // 時間領域(db-t図)
	// analyser.getByteFrequencyData(dataArray); // 周波数領域(db-f図)
	canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
	canvasCtx.fillStyle = "rgb(200, 200, 200)";
	canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);
	canvasCtx.lineWidth = 2;
	canvasCtx.strokeStyle = "rgb(0, 0, 0)";
	canvasCtx.beginPath();
	let sliceWidth = WIDTH / bufferLength;
	let x = 0;
	for(let i = 0; i < bufferLength; ++i) {
		let v = dataArray[i] / 255;
		let y = HEIGHT - (v * HEIGHT);
		if(i === 0) {
			canvasCtx.moveTo(x, y);
		} else {
			canvasCtx.lineTo(x, y);
		}
		x += sliceWidth;
	}
	canvasCtx.lineTo(WIDTH, HEIGHT / 2);
	canvasCtx.stroke();

}