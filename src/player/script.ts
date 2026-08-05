import {getAll, SAMPLING_RATE} from "../const.ts";
import { str2bytes } from "../libs/TextWaver/utils.ts";
import { mfsk } from "../libs/TextWaver/modules/mfsk.ts";
import $ from 'jquery';

let lastNode: AudioBufferSourceNode | undefined;
let audioCtx: AudioContext | undefined;
let lastSampleRate: number = SAMPLING_RATE();

async function unlockAudio(): Promise<void> {
	if(audioCtx === undefined || lastSampleRate !== SAMPLING_RATE()) {
		audioCtx = new AudioContext({
			sampleRate: SAMPLING_RATE(),
			latencyHint: 'playback'
		});
	}

	if(audioCtx.state === 'suspended')
		await audioCtx.resume();
}

async function playSound(sinData: Float32Array, sampleRate: number = SAMPLING_RATE()) {

	lastNode?.stop(); // 再生中のものを停止

	await unlockAudio();

	if(audioCtx === undefined)
		return; // これでいいのか？

	// AudioBufferの作成 (1チャンネル(モノラル), サンプル数, サンプリングレート)
	const audioBuffer: AudioBuffer = audioCtx.createBuffer(1, sinData.length, sampleRate);
	audioBuffer.getChannelData(0).set(sinData);
	const sourceNode: AudioBufferSourceNode = audioCtx.createBufferSource();
	sourceNode.buffer = audioBuffer;
	sourceNode.connect(audioCtx.destination);
	sourceNode.start();
	// sourceNode.loop = false;
	lastNode = sourceNode;
}

$("#genButton").on('click', async () => {
	let m: mfsk = new mfsk(getAll()); // constが書き換えられる可能性のために毎回生成
	let payload: string = $("#charArea").val() as string;
	let bytes: Uint8Array = str2bytes(payload);
	let waves: Float32Array = m.generateWave(bytes);
	await playSound(waves, m.constValues.SAMPLING_RATE);
});



import { io, Socket } from 'socket.io-client';
import { onJoin, onPair, disconnect, syncConst } from '../baseScript.ts';

let socket: Socket;

const ul = $('.data_list');
const connect = $('#connectButton');

let exp_data: {id: number, string_data: string}[] = [];

connect.on('click', () => {

	unlockAudio().then();

	if(socket?.disconnected === false) return;
	socket = io();

	socket.on('roomCreated', (room: string): void => {

		onJoin(room);
		$('#waiting').text('Waiting for receiver...');

		$('#disconnectButton').on('click', () => {
			disconnect(socket);
		});
		socket.on('delRoom', (): void => {
			disconnect(socket);
		});

		socket.on('paired', (): void => {

			$('#waiting').text('Receiver connected!');

			syncConst(socket);

			onPair(socket);

			socket.on('setFile', (text: string) => {
				exp_data = JSON.parse(text);
				ul.empty();
				for(let data of exp_data) {
					let li = $('<button>').text(data.id).attr('id', `exp_data_${data.id}`).addClass('data').on('click', () => {
						socket.emit('selectId', data.id);
					});
					ul.append(li);
				}
				socket.on('selectId', async (id: number) => {
					let li = $(`#exp_data_${id}`);
					li.css('background-color', 'white').siblings().css('background-color', 'lightgray');
					socket.emit('playSound', id);
				});
    		});

			socket.on('playSound', async (id: number) => {
				const string_data = exp_data.find((d: {id: number}) => d.id === id)?.string_data;
				if(string_data === undefined) return;
				let m: mfsk = new mfsk(getAll()); // constが書き換えられる可能性のために毎回生成
				let bytes: Uint8Array = str2bytes(string_data);
				let waves: Float32Array = m.generateWave(bytes);
				await playSound(waves, m.constValues.SAMPLING_RATE);
			});
			socket.on('stopSound', () => {
				console.log('stopping Sound...');
				lastNode?.stop();
			});

		});
	});

	socket.emit('createRoom');

});