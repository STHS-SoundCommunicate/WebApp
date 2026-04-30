import $ from 'jquery';
import * as Tone from 'tone'

const button = $('#playButton');
button.on('click', toggleSound);

const vol = $('#vol');
vol.on('input', () => {
	const value = vol.val();
	if(!value || Array.isArray(value)) return;
	$('#vol_value').text(value);
	if(lastGainNode) {
		lastGainNode.gain.value = Number(value);
	}
});

// https://dotnsf.blog.jp/archives/1072493704.html

const char = $('#charInput');
char.on('change', () => {
	const value: string = String(char.val());
	if(lastOscillator) {

	}
});

const audioCtx = new AudioContext;
// https://developer.mozilla.org/ja/docs/Web/API/AudioContext
let isPlaying: boolean = false;
let lastOscillator: OscillatorNode | null = null;
let lastGainNode: GainNode | null = null;
let lastAnalyser: AnalyserNode | null = null;

function toggleSound() { // https://developer.mozilla.org/ja/docs/Web/API/BaseAudioContext/createOscillator
	if(isPlaying) {
		lastOscillator?.stop();
		lastOscillator = null;
		lastGainNode = null;
		lastAnalyser = null;
	} else {
		const oscillator = audioCtx.createOscillator();
		const gainNode = audioCtx.createGain();
		oscillator.type = 'sine';
		// oscillator.frequency.value = Number(freq.val());
		gainNode.gain.value = Number(vol.val()); // 0 ~ 1
		gainNode.connect(audioCtx.destination);
		oscillator.connect(gainNode);
		oscillator.start();
		lastOscillator = oscillator;
		lastGainNode = gainNode;
		let analyser = audioCtx.createAnalyser();
		lastOscillator.connect(analyser);
		lastAnalyser = analyser;
	}
	isPlaying = !isPlaying;
}

const canvas = document.getElementById('visualizer') as HTMLCanvasElement;
const canvasCtx = canvas.getContext('2d') as CanvasRenderingContext2D;
const WIDTH = canvas.width;
const HEIGHT = canvas.height;
canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
canvasCtx.fillStyle = "rgb(200, 200, 200)";
canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

function visualize() { // https://developer.mozilla.org/ja/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API
	if(lastAnalyser instanceof AnalyserNode) {

		lastAnalyser.fftSize = 2048;
		let bufferLength = lastAnalyser.frequencyBinCount;
		let dataArray = new Uint8Array(bufferLength);
		// lastAnalyser.getByteTimeDomainData(dataArray); // 時間領域(db-t図)
		lastAnalyser.getByteFrequencyData(dataArray); // 周波数領域(db-f図)
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

	requestAnimationFrame(visualize);

}

visualize();