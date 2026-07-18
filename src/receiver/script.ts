import $ from 'jquery';

import {
	BITS_PER_SIGNAL,
	SAMPLING_RATE,
	SIGNAL_FREQS,
	SAMPLES_COUNT,
	PREAMBLE,
	SIGNAL_MS, CHANNELS, BPS, SIGNAL_FREQ_START, SIGNAL_FREQ_WIDTH
} from "../const.ts";

import { decodeUTF8 } from "../utils.ts"; // ライブラリ化するならここもまとめた方がいいかな

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
import processorUrl from "../audioProcessor.ts?worker&url";

let audioProcessorNode: AudioWorkletNode;
let stream: MediaStream | undefined;

let isLocked: boolean = false; // 多重防止

let bufferLength: number;
let dataArray: Uint8Array<ArrayBuffer>;

let exp_counting: number = 1;
let exp_isEnable: boolean = false;
let exp_data: {id: number, string_data: string}[];
let exp_id: number = 0;
let exp_results: {id: number, detect: string, correct: number, wrong: number, db: number, try: number, pattern: { [key: string]: string }[], wave: number[]}[] = [];

function exp(payload: string, db: number, wave_data: Float32Array): void {
	if(!exp_isEnable) return;
	let data = exp_data.find((d): boolean => d.id === exp_id);
	if(data === undefined) return;

	let correct: number = 0;
	let wrong: number = 0;

	let result: string = data.string_data;
	let wrong_pattern: { [key: string]: string }[] = [];

	payload.split('').forEach((c: string, i: number): void => {
		if(c === data.string_data.charAt(i)) {
			correct++;
			result = result.slice(0, i) + data.string_data.charAt(i).toLowerCase() + result.slice(i + 1);
		} else {
			wrong_pattern.push({[data?.string_data.charAt(i)]: c});
			wrong++;
		}
	});

	log(`Result: ${result} \n Correct: ${correct}, Wrong: ${wrong} Tries: ${exp_counting}`);

	exp_results.push({id: exp_id, detect: payload, correct: correct, wrong: wrong, db: db, try: exp_counting, pattern: wrong_pattern, wave: Array.from(wave_data)});
}

let isFileSaving: boolean = false;
function exp_result(isLocal: boolean): void { // jsonをダウンロード
	const fileName: string = $('#fileNameInput').val() + '.json';
	const result_file = {
		"config": {
			"CHANNELS": CHANNELS(),
			"BITS_PER_SIGNAL": BITS_PER_SIGNAL(),
			"BPS": BPS(),
			"SAMPLE_RATE": SAMPLING_RATE(),
			"SIGNAL_FREQ_START": SIGNAL_FREQ_START(),
			"SIGNAL_FREQ_WIDTH": SIGNAL_FREQ_WIDTH(),
			"PREAMBLE": PREAMBLE()
		},
		"exp_results": exp_results
	};
	if(isLocal){ // save to local
		let blob = new Blob([JSON.stringify(result_file)], {type: 'application/json'});
		let url: string = URL.createObjectURL(blob);
		let a = document.createElement('a');
		a.href = url;
		a.download = fileName;
		a.click();
		URL.revokeObjectURL(url);
	} else { // save to server
		if (isFileSaving) {
			log("File saving is already in progress.");
			return;
		}
		isFileSaving = true;
		log(`Saving ${fileName}...`);
		saveFile(fileName, result_file).then(async (res: Response) => {
			const json = await res.json();
			if(json.success){
				log(`Saved ${json.file}`);
			} else {
				log(`Failed to save ${json.file}`);
			}
		}).finally(() => {
			isFileSaving = false;
		});
	}
}

async function saveFile(fileName: string, data: any): Promise<Response> {
	return await fetch("/save", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
			file: fileName,
			data: data
		})
    });
}



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
			if(e.data instanceof Array) {

				let str: string = decodeUTF8(e.data[0]);
				log(str);

				exp(str, e.data[1], e.data[2]);

				toggleSound();
				stats.text("受信しました: " + str);

			} else {
				if(e.data === 'header crc check failed')
					exp_counting++;
				log(e.data);
			}
		};

		log("audioProcessor is ready");

		log("Preparing microphone...");
		stream = await navigator.mediaDevices.getUserMedia(
			{
				audio: { // https://note.com/npaka/n/n87acd80a4266
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



const ul = $('.data_list');
$('#fileInput').on('change', async (event) => {
	let file: File = (event.target as HTMLInputElement).files![0];
	$('#fileLabel').text(file.name);
	let text: string = await file.text();
	exp_data = JSON.parse(text);
	exp_isEnable = true;
	exp_id = exp_data[0].id;
	$('#exp_result').on('click', () => {
		try {
			exp_result($('#isLocal').prop('checked'));
		} catch(e) {
			log(`Error: ${e}`);
			isFileSaving = false;
		}
	}).css('display', 'block');
	$('.dlOpts').css('display', 'flex');
	ul.empty();
	for(let data of exp_data) {
		let li = $('<button>').text(data.id).addClass('data').on('click', async () => {
			li.css('background-color', 'white').siblings().css('background-color', 'lightgray');
			exp_id = data.id;
			exp_counting = 1;
		});
		ul.append(li);
	}
});