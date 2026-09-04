import _const from './libs/TextWaver/const.json';
import $ from "jquery";

const keys: JQuery = $(".keys");
const values: JQuery = $(".values");

Object.entries(_const).forEach(([key, value]: [string, number | number[] | boolean]): void => {
	keys.append($("<span>").text(`${key}:`));
	let val: string;
	const input: JQuery = $("<input>").attr('id', `const_${key}`).addClass('const_params');
	if(value instanceof Array){
		val = value.join(', ');
		input.attr('type', 'text')
			 .val(val);
	} else if(typeof value === 'boolean') {
		input.attr('type', 'checkbox');
		input.prop('checked', value);
	} else {
		val = String(value);
		input.attr('type', 'number')
			 .val(val);
	}
	values.append(input);

	// const methodName = key.toUpperCase();
	// this[methodName] = () => { return $(`#const_channels`).val(); };

});

export function CHANNELS(): number { return Number($(`#const_CHANNELS`).val()); }
export function BITS_PER_SIGNAL(): number { return Number($(`#const_BITS_PER_SIGNAL`).val()); }
export function BPS(): number { return Number($(`#const_BPS`).val()); }
export function SAMPLING_RATE(): number { return Number($(`#const_SAMPLING_RATE`).val()); }
export function SIGNAL_FREQ_START(): number { return Number($(`#const_SIGNAL_FREQ_START`).val()); }
export function SIGNAL_FREQ_WIDTH(): number { return Number($(`#const_SIGNAL_FREQ_WIDTH`).val()); }
export function PREAMBLE(): number[] {
	let str: string = String($(`#const_PREAMBLE`).val());
	return str.split(',').map(s => Number(s.trim()));
}
export function SIGNAL_MS(): number { // 1シグナルの時間[ms]
	return (1 / BPS()) * BITS_PER_SIGNAL() * 1000;
}
export function BAUD_RATE(): number { // 1秒で送るシグナル数[baud]
	return 1000 / SIGNAL_MS();
}

export function SIGNAL_FREQS(): number[] {
	let list: number[] = [];
	for(let i: number = 0; i < CHANNELS(); ++i){
		let freq: number = SIGNAL_FREQ_START() + (i * SIGNAL_FREQ_WIDTH());
		list.push(freq);
	}
	return list;
}
export function SAMPLES_COUNT(): number {
	return Math.floor(SAMPLING_RATE() / BAUD_RATE());
}

export function useFFT(): boolean { return $('#const_useFFT').prop('checked'); }

export function useFFTPreambleChecker(): boolean { return $('#const_useFFTPreambleChecker').prop('checked'); }

export function useRS(): boolean { return $('#const_useRS').prop('checked'); }

export function useHeaderRS(): boolean { return $('#const_useHeaderRS').prop('checked'); }

export function RS_ErrorLength(): number { return Number($(`#const_RS_ErrorLength`).val()); }
export function Header_RS_ParityBytes(): number { return Number($(`#const_Header_RS_ParityBytes`).val()); }

export function useAutoRSLength(): boolean { return $('#const_useAutoRSLength').prop('checked'); }

import { ConstValues } from "./libs/TextWaver/utils.ts";
export function getAll(): ConstValues {
	return {
			"CHANNELS": CHANNELS(),
			"BITS_PER_SIGNAL": BITS_PER_SIGNAL(),
			"BPS": BPS(),
			"SAMPLING_RATE": SAMPLING_RATE(),
			"SIGNAL_FREQ_START": SIGNAL_FREQ_START(),
			"SIGNAL_FREQ_WIDTH": SIGNAL_FREQ_WIDTH(),
			"PREAMBLE": PREAMBLE(),
			"SIGNAL_FREQS": SIGNAL_FREQS(),
			"SIGNAL_MS": SIGNAL_MS(),
			"BAUD_RATE": BAUD_RATE(),
			"SAMPLES_COUNT": SAMPLES_COUNT(),
			"useFFT": useFFT(),
			"useFFTPreambleChecker": useFFTPreambleChecker(),
			"useRS": useRS(),
			"useAutoRSLength": useAutoRSLength(),
			"useHeaderRS": useHeaderRS(),
			"RS_ErrorLength": RS_ErrorLength(),
			"Header_RS_ParityBytes": Header_RS_ParityBytes()
		};
}