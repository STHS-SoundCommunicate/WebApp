import $ from 'jquery'; // 最悪なくせる

// function encodeUTF8(str: string): Uint8Array {
// 	const encoder = new TextEncoder; // utf-8 only
// 	return encoder.encode(str);
// }
//
// function str2bits(str: string): Uint8Array {
// 	let result: number[] = [];
// 	encodeUTF8(str).forEach((byte) => {
// 		for(let i: number = 0; i < 8; ++i) {
// 			result.push((byte >> (7 - i)) & 1);
// 		}
// 	});
// 	return new Uint8Array(result);
// }

import _const from './const.json'; // 定数読み込み

const keys: JQuery = $(".keys");
const values: JQuery = $(".values");

Object.entries(_const).forEach(([key, value]: [string, number | number[]]): void => {
	keys.append($("<span>").text(`${key}:`));
	let val: string;
	const input: JQuery = $("<input>").attr('id', `const_${key}`);
	if(value instanceof Array){
		val = value.join(', ');
		input.attr('type', 'text');
	} else {
		val = String(value);
		input.attr('type', 'number');
	}
	input.val(val);
	values.append(input);
});

function CHANNELS(): number { return Number($(`#const_channels`).val()); }
function BITS_PER_SIGNAL(): number { return Number($(`#const_bits_per_signal`).val()); }
function BPS(): number { return Number($(`#const_bps`).val()); }
function SAMPLING_RATE(): number { return Number($(`#const_sampling_rate`).val()); }
function SIGNAL_FREQ_START(): number { return Number($(`#const_signal_freq_start`).val()); }
function SIGNAL_FREQ_WIDTH(): number { return Number($(`#const_signal_freq_width`).val()); }
function PREAMBLE(): number[] {
	let str: string = String($(`#const_preamble`).val());
	return str.split(',').map(s => Number(s.trim()));
}
function SIGNAL_MS(): number { // 1シグナルの時間[ms]
	return (1 / BPS()) * BITS_PER_SIGNAL() * 1000;
}
function BAUD_RATE(): number { // 1秒で送るシグナル数[baud]
	return 1000 / SIGNAL_MS();
}
function SIGNAL_FREQS(): Uint16Array {
	let list: Uint16Array = new Uint16Array(CHANNELS());
	for(let i: number = 0; i < CHANNELS(); i++)
		list[i] = SIGNAL_FREQ_START() + (i * SIGNAL_FREQ_WIDTH());
	return list;
}
function SAMPLES_COUNT(): number {
	return Math.floor(SAMPLING_RATE() / BAUD_RATE());
}




const button: JQuery = $('#toggleButton');
button.on('click', toggleSound);

const stats: JQuery = $('#stats');

const result: JQuery = $('#result');
function log(s: string): void {
	const height: number | undefined = result.height();
	if(height === undefined) return;
	result.text(result.text() + `\n${s}`);
	result.scrollTop(result[0].scrollHeight - height);
}
function clearLog(): void { result.text(''); }

function decodeUTF8(buffer: Uint8Array): string {
	const decoder = new TextDecoder('utf-8'); // 冗長
	return decoder.decode(buffer);
}



// https://developer.mozilla.org/ja/docs/Web/API/AudioContext
let audioCtx: AudioContext;
let analyser: AnalyserNode;
// https://qiita.com/takatama/items/4fe3fe787264f1f44515#%E5%AD%A6%E3%81%B6%E6%8A%80%E8%A1%93
// https://zenn.dev/rerrah/articles/5b649722ffc3c2
// @ts-ignore
import processorUrl from "./audioProcessor.ts?worker&url"; // ビルド時のエラー回避
let audioProcessorNode: AudioWorkletNode;
let stream: MediaStream | undefined;

let isLocked: boolean = false; // 多重防止

async function toggleSound() {
	if(isLocked) return;
	isLocked = true;

	try {

		if(stream instanceof MediaStream) {
			log('Stopping microphone...');
			stream.getTracks().forEach((t: MediaStreamTrack): void => t.stop());
			log('Microphone is stopped');
			stream = undefined;
			stats.text('録音を停止しました');
			button.text('Listen');
			await audioCtx.close();
			log('audioCtx closed');
			return;
		}

		clearLog();

		audioCtx = new AudioContext( { sampleRate: SAMPLING_RATE() } );
		analyser = audioCtx.createAnalyser();
		log('audioCtx created');

		await audioCtx.audioWorklet.addModule(processorUrl);
		audioProcessorNode = new AudioWorkletNode(audioCtx, 'audio-processor', {
			processorOptions: {
				"SAMPLES_COUNT": SAMPLES_COUNT(),
				"PREAMBLE": PREAMBLE(),
				"SAMPLE_RATE": SAMPLING_RATE(),
				"SIGNAL_FREQS": SIGNAL_FREQS(),
				"BITS_PER_SIGNAL": BITS_PER_SIGNAL()
			}
		});

		audioProcessorNode.port.onmessage = (e: MessageEvent): void => {
			if(stream === undefined) return;
			if(e.data instanceof Uint8Array) {
				let str: string = decodeUTF8(e.data);
				log(str);
				toggleSound();
				stats.text("受信しました: " + str);
			} else {
				log(e.data);
			}
		};

		log("audioProcessor is ready");

		log("Preparing microphone...");
		stream = await navigator.mediaDevices.getUserMedia(
			{
				audio: {
					echoCancellation: false,
					noiseSuppression: false,
					sampleRate: SAMPLING_RATE(),
					channelCount: 1,
					autoGainControl: false
					// volume: 1.0
				}
			}
		);
		const source: MediaStreamAudioSourceNode = audioCtx.createMediaStreamSource(stream);
		source.connect(audioProcessorNode);
		source.connect(analyser);
		log("Microphone is ready");
		stats.text('録音中です...');
		button.text('Stop');
		visualize();

	} catch(e) {
		console.error(e);
		log(`Error: (${e})`);
	} finally {
		isLocked = false; // try内のreturn前に実行される
	}
}



const canvas = document.getElementById('visualizer') as HTMLCanvasElement;
const canvasCtx = canvas.getContext('2d') as CanvasRenderingContext2D;
const WIDTH: number = canvas.width;
const HEIGHT: number = canvas.height;
canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
canvasCtx.fillStyle = "rgb(200, 200, 200)";
canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

function visualize(): void { // https://developer.mozilla.org/ja/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API
	if(stream === undefined) return;
	requestAnimationFrame(visualize);
	let bufferLength: number = analyser.frequencyBinCount;
	let dataArray: Uint8Array<ArrayBuffer> = new Uint8Array(bufferLength);
	// analyser.getByteTimeDomainData(dataArray); // 時間領域(db-t図)
	analyser.getByteFrequencyData(dataArray); // 周波数領域(db-f図)
	canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
	canvasCtx.fillStyle = "rgb(200, 200, 200)";
	canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);
	canvasCtx.lineWidth = 2;
	canvasCtx.strokeStyle = "rgb(0, 0, 0)";
	canvasCtx.beginPath();
	let sliceWidth: number = WIDTH / bufferLength;
	let x: number = 0;
	for(let i: number = 0; i < bufferLength; ++i) {
		let v: number = dataArray[i] / 255;
		let y: number = HEIGHT - (v * HEIGHT);
		if(i === 0) canvasCtx.moveTo(x, y);
		else canvasCtx.lineTo(x, y);
		x += sliceWidth;
	}
	// canvasCtx.lineTo(WIDTH, HEIGHT / 2);
	canvasCtx.stroke();
}