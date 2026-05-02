import $ from 'jquery';
// import * as Tone from 'tone'

const button = $('#toggleButton');
const stats = $('#stats');
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
				audioCtx.createMediaStreamSource(stream).connect(gain);
				stats.text('録音中です...');
			}).catch((e) => {
				console.error(e);
				stats.text(`エラーが発生しました。(${e})`);
			});
		});
	}
}

function visualize() { // https://developer.mozilla.org/ja/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API
	if(stream instanceof MediaStream) {

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

	requestAnimationFrame(visualize);

}

visualize();