import $ from 'jquery';

import { mfsk } from "../libs/TextWaver/modules/mfsk.ts";

import {
	PREAMBLE,
	SAMPLING_RATE,
	SIGNAL_MS,
	getAll
} from "../const.ts";

import { decodeUTF8 } from "../libs/TextWaver/utils.ts"; // ライブラリ化するならここもまとめた方がいいかな
// @ts-ignore
import processorUrl from "../libs/TextWaver/audioProcessor.ts?worker&url";

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
			processorOptions: getAll()
		});

		audioProcessorNode.port.onmessage = (e: MessageEvent): void => {
			if(stream === undefined) return;
			if(!(e.data instanceof Array)) {
				log(e.data);
				return;
			}

			switch(e.data[0]) {
				case mfsk.PREAMBLE_DETECTED:
					log('Preamble Detected');
					if(exp_isEnable) isReceived = true;
				break;
				case mfsk.HEADER_CRC_CHECK_FAILED:
					log('Header CRC Check Failed');
					if(exp_isEnable) {
						exp_counting++;
						tryStats.text(exp_counting);
						scheduleRetry();
					}
				break;
				case mfsk.HEADER_CRC_CHECK_PASSED:
					log('Header CRC Check Passed');
					log('Waiting for payload...');
				break;
				case mfsk.PAYLOAD_DETECTED:
					log('Payload Detected');

					let str: string = decodeUTF8(e.data[1]);
					log(str);



					let sum: number = 0;
					e.data[2].forEach((value: number) => {
						sum += value * value;
					});
					const rms: number = Math.sqrt(sum / e.data[2].length);
					const db: number = rms > 0 ? 20 * Math.log10(rms) : -Infinity;

					log(`Ave-Vol ${db} dBFS`);

					exp(str, db, e.data[2]);
					if(exp_runAll) {
						if(exp_dataKey >= exp_data.length - 1) {
							exp_runAll = false;
						} else {
							exp_id = exp_data[++exp_dataKey].id;
							$(`#exp_data_${exp_id}`).trigger('click');
							return;
						}
					}



					toggleSound();
					stats.text("受信しました: " + str);
				break;
				case mfsk.RS_DECODE_FAILED:
					log('RS Decode Failed');
					if(exp_isEnable) {
						exp_counting++;
						tryStats.text(exp_counting);
						scheduleRetry();
					}
				break;
				default:
					log(`Unknown message received: ${e.data}`);
				break;
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



const tryStats = $('#try');
let exp_counting: number = 1;
let exp_isEnable: boolean = false;
let exp_data: {id: number, string_data: string}[];
let exp_id: number = 0;

let exp_runAll: boolean = false;
let exp_dataKey: number = 0;

function exp(payload: string, db: number, wave_data: Float32Array): void {
	if(!exp_isEnable) return;
	exp_isEnable = false;
	clearCheckerTimers();
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
	const exp_result = {id: exp_id, detect: payload, correct: correct, wrong: wrong, db: db, try: exp_counting, pattern: wrong_pattern, wave: Array.from(wave_data)}; // wave: Array.from(wave_data)

	socket.emit('expResult', exp_result, $('#fileNameInput').val() + '.json');

}

import { io, Socket } from 'socket.io-client';
import { onJoin, onPair, disconnect as D, syncConst } from "../baseScript.ts";
let socket: Socket;
const connect = $('#connectButton');
const ul = $('.data_list');

function disconnect() {
	D(socket);
	$('#roomIdInput').css('display', 'block');
	$('.dlOpts').css('display', 'none');
}

let isReceived: boolean = false;
let retryTimeoutId: number | undefined;
let checkerTimeoutId: number | undefined;

function clearCheckerTimers(): void {
	if(checkerTimeoutId !== undefined) {
		clearTimeout(checkerTimeoutId);
		checkerTimeoutId = undefined;
	}

	if(retryTimeoutId !== undefined) {
		clearTimeout(retryTimeoutId);
		retryTimeoutId = undefined;
	}
}

function scheduleRetry(): void {
	if(retryTimeoutId !== undefined)
		clearTimeout(retryTimeoutId);

	socket.emit('stopSound');

	retryTimeoutId = setTimeout(() => {
		retryTimeoutId = undefined;
		socket.emit('playSound', exp_id);
		runChecker();
	}, 500); // 1/4秒ぐらい待っとけば前の音が残らなそう
}

function runChecker() {
	if(stream instanceof MediaStream){
		exp_isEnable = true;
		tryStats.text(exp_counting);
		isReceived = false;
		checkerTimeoutId = window.setTimeout(() => {
			if(!(stream instanceof MediaStream)){
				exp_runAll = false;
				exp_isEnable = false;
				return;
			}
			if(exp_counting >= 50) { // 50回やって無理なら無理だろ
				log('Failed to receive the signal after 50 tries. Please check the connection and try again.');
				exp_runAll = false;
				exp_isEnable = false;
				toggleSound().then();
				return;
			}
			if(isReceived) return;
			exp_counting++;
			tryStats.text(exp_counting);
			scheduleRetry();
		}, SIGNAL_MS() * PREAMBLE().length * 20); // 20は適当 (ほんとは1でもいいはずだが、余裕を持たせるために大きめにしている)
	}
}

connect.on('click', () => {

	const roomId: string = $('#roomIdInput').val() as string;
	if(roomId === '') {
		log('Please enter a room ID.');
		return;
	}

	if(socket?.disconnected === false) return;
	socket = io();

	socket.on('failedJoin', (reason: string) => {
		socket.disconnect();
		log(`Failed to join the room: ${reason}`);
	});

	$('#disconnectButton').on('click', () => {
		log('Disconnected from the server.');
		disconnect();
	});
	socket.on('delRoom', (): void => {
		log('Player disconnected.');
		disconnect();
	});

	socket.on('paired', (room: string) => {
		log('Successfully paired with the player.');

		syncConst(socket);

		socket.emit('syncConst', getAll());

		onJoin(room);

		$('#roomIdInput').css('display', 'none');

		onPair(socket);

		socket.on('setFile', (text: string) => {
			log('Exp-File is set.');
			exp_data = JSON.parse(text);
			exp_id = exp_data[0].id;
			$('#exp_result').on('click', () => {
				socket.emit('requestResult'); // request server to send the result file
			});
			$('.dlOpts').css('display', 'flex');
			ul.empty();
			let li = $('<button>').text('all').attr('id', 'exp_all').addClass('data').on('click', () => {
				exp_runAll = true;
				exp_dataKey = 0;
				exp_id = exp_data[exp_dataKey].id;
				$(`#exp_data_${exp_id}`).trigger('click');
			});
			ul.append(li);
			for(let data of exp_data) {
				let li = $('<button>').text(data.id).attr('id', `exp_data_${data.id}`).addClass('data').on('click', async () => {
					socket.emit('selectId', data.id);
				});
				ul.append(li);
			}
			socket.on('selectId', async (id: number) => {
				let li = $(`#exp_data_${id}`);
				li.css('background-color', 'white').siblings().css('background-color', 'lightgray');
				exp_id = id;
				exp_counting = 1;
				clearCheckerTimers();
				runChecker();
			});
		});

		socket.on('sendResult', (result_file) => {
			const fileName: string = $('#fileNameInput').val() + '.json';
			let blob = new Blob([JSON.stringify(result_file)], {type: 'application/json'});
			let url: string = URL.createObjectURL(blob);
			let a = document.createElement('a');
			a.href = url;
			a.download = fileName;
			a.click();
			URL.revokeObjectURL(url);
		});

	});

	socket.emit('joinRoom', roomId);

});