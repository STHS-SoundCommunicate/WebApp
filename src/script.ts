import $ from 'jquery'; // 最悪なくせる
// import * as Tone from 'tone'


import _const from './const.json'; // 定数読み込み
const SIGNAL_MS: number = 1 / _const.bps * _const.bits_per_signal * 1000; // 1シグナルの時間[ms]
const BAUD_RATE: number = 1000 / SIGNAL_MS; // 1秒で送るシグナル数[baud]
let SIGNAL_FREQS: number[] = []; // 使用しているシグナル周波数
for(let i: number = 0; i < _const.channels; ++i) {
	SIGNAL_FREQS.push(_const.signal_freq_start + i * _const.signal_freq_width);
}
// const samples = Math.trunc((_const.sampling_rate * signal_ms) / 1000);
const SAMPLES_COUNT: number = Math.trunc(_const.sampling_rate / BAUD_RATE);



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



const audioCtx = new AudioContext( { sampleRate: _const.sampling_rate } );
const analyser: AnalyserNode = audioCtx.createAnalyser(); // debug
analyser.fftSize = 2048;


// https://qiita.com/takatama/items/4fe3fe787264f1f44515#%E5%AD%A6%E3%81%B6%E6%8A%80%E8%A1%93
// https://zenn.dev/rerrah/articles/5b649722ffc3c2
// @ts-ignore
import processorUrl from "./audioProcessor.ts?worker&url"; // ビルド時のエラー回避
let audioProcessorNode: AudioWorkletNode;


// https://developer.mozilla.org/ja/docs/Web/API/AudioContext
let stream: MediaStream | undefined;

async function toggleSound() {
	if(stream instanceof MediaStream) {
		log('Stopping microphone...');
		stream.getTracks().forEach((t) => t.stop());
		log('Microphone is stopped');
		stream = undefined;
		stats.text('録音を停止しました');
		await audioCtx.suspend();
		log('audioCtx suspended');
	} else {

		clearLog();

		await audioCtx.resume();
		log('audioCtx resumed');

		try {
			if(audioProcessorNode === undefined) {
				await audioCtx.audioWorklet.addModule(processorUrl);
				audioProcessorNode = new AudioWorkletNode(audioCtx, 'audio-processor', {
					processorOptions: {
						"SAMPLES_COUNT": SAMPLES_COUNT,
						"PREAMBLE": _const.preamble,
						"SAMPLE_RATE": _const.sampling_rate,
						"SIGNAL_FREQS": SIGNAL_FREQS,
						"BITS_PER_SIGNAL": _const.bits_per_signal
					}
				});
				audioProcessorNode.port.onmessage = (e) => {
					if(stream === undefined) return;
					log(e.data);
					if(e.data instanceof Uint8Array) {
						let str = decodeUTF8(e.data);
						log(str);
					}
					if(e.data === "correct preamble detected!") {
						toggleSound();
					}
				};
				log("audioProcessor is ready");
			}

			log("Preparing microphone...");
			stream = await navigator.mediaDevices.getUserMedia(
				{
					audio: {
						echoCancellation: true,
						sampleRate: _const.sampling_rate,
						channelCount: _const.channels
					}
				}
			);
			stream.getTracks().forEach((t) => {
				t.getSettings().channelCount = _const.channels;
			});
			audioCtx.createMediaStreamSource(stream).connect(audioProcessorNode);
			audioCtx.createMediaStreamSource(stream).connect(analyser); // debug
			log("Microphone is ready");
			stats.text('録音中です...');
			visualize();
		} catch(e) {
			console.error(e);
			log(`Error: (${e})`);
		}
	}
}



const canvas = document.getElementById('visualizer') as HTMLCanvasElement;
const canvasCtx = canvas.getContext('2d') as CanvasRenderingContext2D;
const WIDTH: number = canvas.width;
const HEIGHT: number = canvas.height;
canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
canvasCtx.fillStyle = "rgb(200, 200, 200)";
canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

function visualize() { // https://developer.mozilla.org/ja/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API
	if(stream === undefined) return;

	requestAnimationFrame(visualize);

	let bufferLength = analyser.frequencyBinCount;
	let dataArray = new Uint8Array(bufferLength);
	// analyser.getByteTimeDomainData(dataArray); // 時間領域(db-t図)
	analyser.getByteFrequencyData(dataArray); // 周波数領域(db-f図)
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