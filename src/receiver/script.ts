import $ from 'jquery'; // 最悪なくせる

import {
	BITS_PER_SIGNAL,
	SAMPLING_RATE,
	SIGNAL_FREQS,
	SAMPLES_COUNT,
	PREAMBLE,
	SIGNAL_MS
} from "../const.ts";

import { decodeUTF8 } from "../utils.ts";


const button: JQuery = $('#toggleButton');
button.on('click', toggleSound);

const stats: JQuery = $('#stats');

const result: JQuery = $('#result');
const height: number = result.height() ?? 0;
function log(s: string): void {
	result.text(result.text().slice(-10000) + `\n${s}`); // 最大10000+字
	result.scrollTop(result[0].scrollHeight - height);
}
function clearLog(): void { result.text(''); }



// https://developer.mozilla.org/ja/docs/Web/API/AudioContext
let audioCtx: AudioContext;
let analyser: AnalyserNode;
// https://qiita.com/takatama/items/4fe3fe787264f1f44515#%E5%AD%A6%E3%81%B6%E6%8A%80%E8%A1%93
// https://zenn.dev/rerrah/articles/5b649722ffc3c2
// @ts-ignore
import processorUrl from "../audioProcessor.ts?worker&url"; // ビルド時のエラー回避
let audioProcessorNode: AudioWorkletNode;
let stream: MediaStream | undefined;

let isLocked: boolean = false; // 多重防止

let bufferLength: number;
let dataArray: Uint8Array<ArrayBuffer>;

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

		audioCtx = new AudioContext({ sampleRate: SAMPLING_RATE() });
		analyser = audioCtx.createAnalyser();
		bufferLength = analyser.frequencyBinCount;
		dataArray = new Uint8Array(bufferLength);
		log('audioCtx created');

		await audioCtx.audioWorklet.addModule(processorUrl);
		audioProcessorNode = new AudioWorkletNode(audioCtx, 'audio-processor', {
			processorOptions: {
				"SAMPLES_COUNT": SAMPLES_COUNT(),
				"PREAMBLE": PREAMBLE(),
				"SAMPLE_RATE": SAMPLING_RATE(),
				"SIGNAL_FREQS": SIGNAL_FREQS(),
				"BITS_PER_SIGNAL": BITS_PER_SIGNAL(),
				"SIGNAL_MS": SIGNAL_MS()
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
	// analyser.getByteTimeDomainData(dataArray); // 時間領域(db-t図)
	analyser.getByteFrequencyData(dataArray); // 周波数領域(db-f図)
	canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
	canvasCtx.fillStyle = "rgb(200, 200, 200)";
	canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);
	canvasCtx.lineWidth = 2;
	canvasCtx.strokeStyle = "rgb(0, 0, 0)";
	canvasCtx.beginPath();
	const sliceWidth: number = WIDTH / bufferLength;
	let x: number = 0;
	for(let i: number = 0; i < bufferLength; ++i) {
		const v: number = dataArray[i] / 255;
		const y: number = HEIGHT - (v * HEIGHT);
		if(i === 0) canvasCtx.moveTo(x, y);
		else canvasCtx.lineTo(x, y);
		x += sliceWidth;
	}
	// canvasCtx.lineTo(WIDTH, HEIGHT / 2); // 中心線
	canvasCtx.stroke();
}