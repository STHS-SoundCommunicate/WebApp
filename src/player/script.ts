import { BITS_PER_SIGNAL, PREAMBLE, SAMPLES_COUNT, SAMPLING_RATE, SIGNAL_FREQS, SIGNAL_MS } from "../const.ts";
import { str2bits } from "../utils.ts";
import { mfsk } from "../modules/mfsk.ts";
import $ from 'jquery';

let lastNode: AudioBufferSourceNode | undefined;

async function playSound(sinData: Float32Array, sampleRate: number = SAMPLING_RATE(), loop: boolean = false) {

	lastNode?.stop();

	const audioCtx = new AudioContext({ // https://developer.mozilla.org/ja/docs/Web/API/AudioContext/AudioContext
		sampleRate: sampleRate,
		latencyHint: 'playback'
	});


	const sinData_silent = new Float32Array(sinData.length + 20000);
	sinData_silent.set(sinData);
	for(let i: number = 0; i < 20000; ++i) sinData_silent[sinData.length + i] = 0;


	// AudioBufferの作成 (1チャンネル(モノラル), サンプル数, サンプリングレート)
	const audioBuffer: AudioBuffer = audioCtx.createBuffer(1, sinData_silent.length, sampleRate);
	// バッファのチャンネルデータ（Float32Array）を取得し、sinデータをコピー
	const channelData: Float32Array = audioBuffer.getChannelData(0);
	channelData.set(sinData_silent);
	// 再生用のソースノードを作成してバッファをセット
	const sourceNode: AudioBufferSourceNode = audioCtx.createBufferSource();
	sourceNode.buffer = audioBuffer;
	sourceNode.connect(audioCtx.destination);
	sourceNode.start();
	sourceNode.loop = loop;
	lastNode = sourceNode;
}

$("#genButton").on('click', async () => {
	let m: mfsk = new mfsk(SAMPLING_RATE(), SIGNAL_FREQS(), PREAMBLE(), BITS_PER_SIGNAL(), SIGNAL_MS(), SAMPLES_COUNT()); // constが書き換えられる可能性のために毎回生成
	let payload: string = $("#charArea").val() as string;
	let bits: Uint8Array = str2bits(payload);
	let waves: Float32Array = m.generateWave(bits);
	await playSound(waves, m.SAMPLING_RATE);
});



const ul = $('.data_list');
$('#fileInput').on('change', async (event) => {
	let file: File = (event.target as HTMLInputElement).files![0];
	$('#fileLabel').text(file.name);
	let text: string = await file.text();
	let json = JSON.parse(text);
	ul.empty();
	for(let data of json) {
		let li = $('<button>').text(data.id).addClass('data').on('click', async () => {
			li.css('background-color', 'white').siblings().css('background-color', 'lightgray');
			let m: mfsk = new mfsk(SAMPLING_RATE(), SIGNAL_FREQS(), PREAMBLE(), BITS_PER_SIGNAL(), SIGNAL_MS(), SAMPLES_COUNT()); // constが書き換えられる可能性のために毎回生成
			let bits: Uint8Array = str2bits(data.string_data);
			let waves: Float32Array = m.generateWave(bits);
			await playSound(waves, m.SAMPLING_RATE, true);
		});
		ul.append(li);
	}
});