import {BITS_PER_SIGNAL, PREAMBLE, SAMPLING_RATE, SIGNAL_FREQS, SIGNAL_MS} from "../const.ts";
import { str2bits } from "../utils.ts";
import { mfsk } from "../modules/mfsk.ts";
import $ from 'jquery';

async function playSound(sinData: Float32Array, sampleRate: number = SAMPLING_RATE()) {
	const audioCtx = new AudioContext({ sampleRate: sampleRate });
	// AudioBufferの作成 (1チャンネル(モノラル), サンプル数, サンプリングレート)
	const numberOfChannels = 1;
	const bufferLength: number = sinData.length;
	const audioBuffer: AudioBuffer = audioCtx.createBuffer(numberOfChannels, bufferLength, sampleRate);
	// バッファのチャンネルデータ（Float32Array）を取得し、sinデータをコピー
	const channelData: Float32Array = audioBuffer.getChannelData(0);
	channelData.set(sinData);
	// 再生用のソースノードを作成してバッファをセット
	const sourceNode: AudioBufferSourceNode = audioCtx.createBufferSource();
	sourceNode.buffer = audioBuffer;
	sourceNode.connect(audioCtx.destination);
	sourceNode.start();
}

$("#genButton").on('click', async () => {
	let m: mfsk = new mfsk(SAMPLING_RATE(), SIGNAL_FREQS(), PREAMBLE(), BITS_PER_SIGNAL(), SIGNAL_MS());
	let payload: string = $("#charArea").val() as string;
	let bits: Uint8Array = str2bits(payload);
	let waves: Float32Array = m.generateWave(bits);
	await playSound(waves, m.SAMPLING_RATE);
});