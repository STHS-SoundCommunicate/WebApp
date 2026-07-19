import _const from './const.json';
import $ from "jquery";

const keys: JQuery = $(".keys");
const values: JQuery = $(".values");

Object.entries(_const).forEach(([key, value]: [string, number | number[]]): void => {
	keys.append($("<span>").text(`${key}:`));
	let val: string;
	const input: JQuery = $("<input>").attr('id', `const_${key}`).addClass('const_params');
	if(value instanceof Array){
		val = value.join(', ');
		input.attr('type', 'text');
	} else {
		val = String(value);
		input.attr('type', 'number');
	}
	input.val(val);
	values.append(input);
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

export function getAll(): { [key: string]: string | number | number[] } {
	return {
			"channels": CHANNELS(),
			"bits_per_signal": BITS_PER_SIGNAL(),
			"bps": BPS(),
			"sampling_rate": SAMPLING_RATE(),
			"signal_freq_start": SIGNAL_FREQ_START(),
			"signal_freq_width": SIGNAL_FREQ_WIDTH(),
			"preamble": PREAMBLE()
		};
}