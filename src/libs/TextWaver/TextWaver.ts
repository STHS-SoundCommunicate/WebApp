// @ts-ignore
import url from './audioProcessor.ts?worker&url';
import {ConstValues} from "./utils.ts";
import defaultConst from './const.json';

function createConstValues(config = defaultConst): ConstValues {

	let values = config as ConstValues;

	values.SIGNAL_MS = (1 / values.BPS) * values.BITS_PER_SIGNAL * 1000;
	values.BAUD_RATE = 1000 / values.SIGNAL_MS;
	values.SIGNAL_FREQS = [];
	for(let i: number = 0; i < values.CHANNELS; ++i){
		let freq: number = values.SIGNAL_FREQ_START + (i * values.SIGNAL_FREQ_WIDTH);
		values.SIGNAL_FREQS.push(freq);
	}
	values.SAMPLES_COUNT = Math.floor(values.SAMPLING_RATE / values.BAUD_RATE);

	return values;
	
}

let audioCtx: AudioContext | undefined;
let stream: MediaStream | undefined;

async function startRecord(onMessage: (e: MessageEvent) => void, config = defaultConst) {
	if(stream instanceof MediaStream) return stream;
	const values: ConstValues = createConstValues(config);

	//@ts-ignore
	audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: values.SAMPLING_RATE });
	await audioCtx.audioWorklet.addModule(url);
	let audioProcessorNode: AudioWorkletNode = new AudioWorkletNode(audioCtx, 'audio-processor', {
		processorOptions: values
	});
	audioProcessorNode.port.onmessage = onMessage;

	stream = await navigator.mediaDevices.getUserMedia(
		{
			audio: { // https://note.com/npaka/n/n87acd80a4266
				echoCancellation: false,
				noiseSuppression: false,
				sampleRate: values.SAMPLING_RATE,
				channelCount: 1,
				autoGainControl: false
				// volume: 1.0
			}
		}
	);
	const source: MediaStreamAudioSourceNode = audioCtx.createMediaStreamSource(stream);
	source.connect(audioProcessorNode);

	return stream;

}

async function stopRecord(): Promise<boolean> {
	if(stream instanceof MediaStream) {
		stream?.getTracks().forEach((t: MediaStreamTrack): void => t.stop());
		stream = undefined;
		await audioCtx?.close();
		audioCtx = undefined;
		return true;
	}
	return false;
}

export default {startRecord, stopRecord};