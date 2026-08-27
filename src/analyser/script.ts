import $ from 'jquery';
import { ConstValues } from "../libs/TextWaver/utils.ts";
import {mfsk} from "../libs/TextWaver/modules/mfsk.ts";
import ChangeEvent = JQuery.ChangeEvent;
import {fft, getNormalizedSpectrum} from "../libs/TextWaver/fft.ts";

let m: mfsk;

const counter = $('.symbolCountBox');
const symbolCountInput = $('#symbolCount') as JQuery<HTMLInputElement>;
function updateSymbolCountValue(): void { $('#symbolCountValue').text(symbolCountInput.val() as string); }
$('#symbolCountDown').on('click', () => {
	symbolCountInput[0].stepDown();
	symbolCountInput.trigger('input');
	symbolCountInput.trigger('change');
});
$('#symbolCountUp').on('click', () => {
	symbolCountInput[0].stepUp();
	symbolCountInput.trigger('input');
	symbolCountInput.trigger('change');
});

$('#fileInput').on('change', async (event: ChangeEvent) => {
	let file: File = (event.target as HTMLInputElement).files![0];
	let text: string = await file.text();
	const json = JSON.parse(text);

	counter.css('display', 'none');

	const config: ConstValues = json.config;
	// @ts-ignore // Uint16を直接保存してたのは愚策でした
	if(config.SIGNAL_FREQS.data !== undefined) {
		// @ts-ignore
		const uint8 = new Uint8Array(config.SIGNAL_FREQS.data);
		config.SIGNAL_FREQS = Array.from(new Uint16Array(uint8.buffer));
	}
	console.log(config);

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

	const ul = $('.data_list');
	ul.empty();
	exp_results.forEach((item: {id: number, wrong: number}): void => {
		const li = $('<button>').text(item.id).attr('id', `exp_data_${item.id}`).addClass('data');
		if(item.wrong > 0)
			li.css('background-color', 'lightgreen');
		ul.append(li);
	});

	m = new mfsk(config);
	$('.data').on('click', (e: JQuery.ClickEvent): void => {
		const target = $(e.target);
		const id: number = Number(target.attr('id')!.split('exp_data_')[1]);
		$(e.target).css('background-color', 'white').siblings().css('background-color', 'lightgray');

		const correct_str: string = data.find((item: { id: number }): boolean => item.id === id)!.string_data;
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
        } | undefined = exp_results.find((item: { id: number }): boolean => item.id === id);
		if(result === undefined) return;

		const payload: Float32Array = new Float32Array(result.wave); // detectSymbolに必要
		const payload_length: number = payload.length / config.SAMPLES_COUNT; // symbol_count
		let w_index: Uint8Array = new Uint8Array(payload_length);
		let correct: number = 0;
		let wrong: number = 0;
		let c_p_count: { [key: number]: number } = {};
		let w_p_count: { [key: number]: number } = {};
		for(let i: number = 0; i < payload_length; ++i) {
			w_index[i] = m.detectSymbol(payload.slice(i * config.SAMPLES_COUNT, (i + 1) * config.SAMPLES_COUNT));
			if(w_index[i] === c_index[i]) correct++;
			else {
				wrong++;
				console.log(`${c_index[i]} -> ${w_index[i]}`);
				c_p_count[c_index[i]] = (c_p_count[c_index[i]] || 0) + 1;
				w_p_count[w_index[i]] = (w_p_count[w_index[i]] || 0) + 1;
			}
		}

		console.log(`CorrectCount: ${JSON.stringify(c_p_count)}`);
		console.log(`WrongCount: ${JSON.stringify(w_p_count)}`);

		$('#result').html(`
		Detect: ${w_index.join(', ')}<br>
		Correct: ${c_index.join(', ')}<br>
		Correct: ${correct} / Wrong: ${wrong} / Total: ${payload_length}<br>
		Try: ${result.try}<br>
		db: ${result.db} dBFS
		`);

		counter.css('display', 'flex');
		symbolCountInput.attr('max', payload_length - 1);
		symbolCountInput.val(0);

		symbolCountInput.off('change').on('change', (): void => {
			updateSymbolCountValue();

			const symbol_count: number = Number(symbolCountInput.val());
			if(symbol_count > payload_length) {
				symbolCountInput.val(payload_length);
				updateSymbolCountValue();
				return;
			}

			const wave: Float32Array = payload.slice(symbol_count * config.SAMPLES_COUNT, (symbol_count + 1) * config.SAMPLES_COUNT);

			// const fft_array: number[] = fft(wave);
			// config.SIGNAL_FREQS.forEach((freq: number): void => {
			// 	const score: number = scoreOnFFT(fft_array, freq, config.SAMPLING_RATE);
			// 	console.log(`${freq} Hz: ${score}`);
			// });

			visualize(wave, config.SAMPLING_RATE, config.SIGNAL_FREQS, config.SIGNAL_FREQ_WIDTH);

			const w_index_on: number = w_index[symbol_count];
			const c_index_on: number = c_index[symbol_count];
			// console.log(`${c_index_on} -> ${w_index_on}`);
			const stats = $('#stats');
			stats.text(`${c_index_on} -> ${w_index_on}`);
			if(w_index_on === c_index_on) {
				stats.css('background-color', '').css('color', '');
			} else {
				stats.css('background-color', 'red').css('color', 'white');
			}

		});
		$('#symbolCountDown').trigger('click');
	});
});

import Chart from 'chart.js/auto';

const canvas = document.getElementById('visualizer') as HTMLCanvasElement;
let barChart: Chart;

function visualize(wave: Float32Array, sampleRate: number, signal_freqs: number[], markerStepHz: number): void { // https://developer.mozilla.org/ja/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API

	const fft_array: number[] = fft(wave);
	let normalized_spectrum: number[] = getNormalizedSpectrum(fft_array);
	const maxFrequency: number = signal_freqs[signal_freqs.length - 1];
	const minFrequency: number = signal_freqs[0];

	const N: number = normalized_spectrum.length;// normalizeしたものはN/2になってる
	// bin * sampleRate / N = freq
	const binWidth: number = sampleRate / N;
    const binMin: number = Math.round((minFrequency * N) / sampleRate); // const bin: number = Math.round((freq * N) / sampleRate);
    const binMax: number = Math.round((maxFrequency * N) / sampleRate);
    if (binMin < 0 || binMax > N - 1) return;
	normalized_spectrum = normalized_spectrum.slice(binMin, binMax + 1);
	// console.log(normalized_spectrum);

	const labels: number[] = Array.from(normalized_spectrum, (_: any, i: number): number => (i + binMin) * binWidth); // x軸のラベルを周波数に変換

	barChart?.destroy();
	barChart = new Chart(canvas, {
		type: 'line',
		data: {
			labels: labels,
			datasets: [
				{
					label: 'Wave',
					data: normalized_spectrum,
					// fill: false,
					borderColor: 'rgb(75, 192, 192)',
					tension: 0.1
				},
				{
					label: 'Signal Frequencies',
					data: labels.map((labelFreq: number): number | null => {
						const signalFreq: number | undefined = signal_freqs.find((freq: number): boolean => {
							const bin: number = Math.round((freq * N) / sampleRate);
							const binFrequency: number = bin * binWidth;
							return Math.abs(labelFreq - binFrequency) < binWidth / 2;
						});

						if(signalFreq === undefined) return null;

						const bin: number = Math.round((signalFreq * N) / sampleRate);
						return normalized_spectrum[bin - binMin] ?? null;
					}),
					pointBackgroundColor: 'red',
					pointBorderColor: 'red',
					pointRadius: 5,
					showLine: false
				}
			]
		},
		options: {
			scales: {
				x: {
					type: 'linear',
					position: 'bottom',
					title: {
						display: true,
						text: 'Frequency [Hz]'
					},
					min: minFrequency - 100,
					max: maxFrequency + 100,
					ticks: {
						stepSize: markerStepHz
					}
				},
				y: {
					title: {
						display: true,
						text: 'Amplitude'
					}
				}
			}
		}
	});
}