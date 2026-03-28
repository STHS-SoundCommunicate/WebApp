import $ from 'jquery';
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

const freq = $('#freq');
const freq_text = $('#freq_text');
freq.on('input', () => {
	const value = Number(freq.val());
	freq_text.val(value);
	if(lastOscillator) {
		lastOscillator.frequency.value = value;
	}
});
freq_text.on('change', () => {
	const value = Number(freq_text.val());
	freq.val(value);
	if(lastOscillator) {
		lastOscillator.frequency.value = value;
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
		oscillator.frequency.value = Number(freq.val());
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
		lastAnalyser.getByteTimeDomainData(dataArray);

		canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
		canvasCtx.fillStyle = "rgb(200, 200, 200)";
		canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);
		canvasCtx.lineWidth = 2;
		canvasCtx.strokeStyle = "rgb(0, 0, 0)";
		canvasCtx.beginPath();
		let sliceWidth = WIDTH / bufferLength;
		let x = 0;
		for(let i = 0; i < bufferLength; ++i) {
			let v = dataArray[i] / 128.0;
			let y = (v * HEIGHT) / 2;
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