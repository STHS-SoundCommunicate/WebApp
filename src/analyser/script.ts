import $ from 'jquery';
import { ConstValues } from "../libs/TextWaver/utils.ts";
import { listIds } from "../baseScript.ts";
import {mfsk} from "../libs/TextWaver/modules/mfsk.ts";


let m: mfsk;

$('#fileInput').on('change', async (event) => {
	let file: File = (event.target as HTMLInputElement).files![0];
	let text: string = await file.text();
	const json = JSON.parse(text);
	const config: ConstValues = json.config;

	// @ts-ignore // Uint16を直接保存してたのは愚策でした
	if(config.SIGNAL_FREQS.data !== undefined) {
		// @ts-ignore
		const uint8Array = new Uint8Array(config.SIGNAL_FREQS.data);
		config.SIGNAL_FREQS = Array.from(new Uint16Array(uint8Array.buffer));
	}

	const data: {id: number, string_data: string}[] = json.data;
	const exp_results: {
		id: number,
		detect: string,
		correct: number,
		wrong: number,
		db: number,
		try: number,
		pattern: {[key: string]: string}[],
		wave: number[]
	}[] = json.exp_results;
	listIds(data);
	m = new mfsk(config);
	$('.data').on('click', (e: JQuery.ClickEvent): void => {
		const target = $(e.target);
		const id: number = Number(target.attr('id')!.split('exp_data_')[1]);
		$(e.target).css('background-color', 'white').siblings().css('background-color', 'lightgray');

		const correct_str: string = data.find((item) => item.id === id)!.string_data;
		const c_index: Uint8Array = m.str2index(correct_str);

		const result: {
            id: number;
            detect: string;
            correct: number;
            wrong: number;
            db: number;
            try: number;
            pattern: { [p: string]: string }[];
            wave: number[]
        } | undefined = exp_results.find((item) => item.id === id);
		if(result === undefined) return;
		const payload: Float32Array = new Float32Array(result.wave);
		const payload_length: number = payload.length / config.SAMPLES_COUNT; // symbol_count
		let w_index: Uint8Array = new Uint8Array(payload_length);
		let correct: number = 0;
		let wrong: number = 0;
		// let pattern: { [key: number]: number }[] = [];
		let c_p_count: { [key: number]: number } = {};
		let w_p_count: { [key: number]: number } = {};
		for(let i: number = 0; i < payload_length; ++i) {
			w_index[i] = m.detectSymbol(payload.slice(i * config.SAMPLES_COUNT, (i + 1) * config.SAMPLES_COUNT));
			if(w_index[i] === c_index[i]) correct++;
			else {
				wrong++;
				// pattern.push({ [c_index[i]]: w_index[i] });
				console.log(`${c_index[i]} -> ${w_index[i]}`);
				c_p_count[c_index[i]] = (c_p_count[c_index[i]] || 0) + 1;
				w_p_count[w_index[i]] = (w_p_count[w_index[i]] || 0) + 1;
			}
		}

		console.log(`${c_index.join(', ')}`);
		console.log(`${w_index.join(', ')}`);
		console.log(`${correct} / ${wrong} / ${payload_length}`);

		c_p_count = Object.fromEntries(Object.entries(c_p_count).sort((a, b) => b[1] - a[1]));
		w_p_count = Object.fromEntries(Object.entries(w_p_count).sort((a, b) => b[1] - a[1]));

		console.log(`${JSON.stringify(c_p_count)}`);
		console.log(`${JSON.stringify(w_p_count)}`);
	});
});