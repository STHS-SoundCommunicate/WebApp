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

export function CHANNELS(): number { return Number($(`#const_channels`).val()); }
export function BITS_PER_SIGNAL(): number { return Number($(`#const_bits_per_signal`).val()); }
export function BPS(): number { return Number($(`#const_bps`).val()); }
export function SAMPLING_RATE(): number { return Number($(`#const_sampling_rate`).val()); }
export function SIGNAL_FREQ_START(): number { return Number($(`#const_signal_freq_start`).val()); }
export function SIGNAL_FREQ_WIDTH(): number { return Number($(`#const_signal_freq_width`).val()); }
export function PREAMBLE(): number[] {
	let str: string = String($(`#const_preamble`).val());
	return str.split(',').map(s => Number(s.trim()));
}
export function SIGNAL_MS(): number { // 1シグナルの時間[ms]
	return (1 / BPS()) * BITS_PER_SIGNAL() * 1000;
}
export function BAUD_RATE(): number { // 1秒で送るシグナル数[baud]
	return 1000 / SIGNAL_MS();
}

export function SIGNAL_FREQS(): Uint16Array {
	let list: Uint16Array = new Uint16Array(CHANNELS());
	for(let i: number = 0; i < CHANNELS(); ++i)
		list[i] = SIGNAL_FREQ_START() + (i * SIGNAL_FREQ_WIDTH());
	return list;
}
export function SAMPLES_COUNT(): number {
	return Math.floor(SAMPLING_RATE() / BAUD_RATE());
}

export function useFFT(): boolean { return $('#const_useFFT').prop('checked'); }

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
			"SAMPLES_COUNT": SAMPLES_COUNT(),
			"useFFT": useFFT()
		};
}