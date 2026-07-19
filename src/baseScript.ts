import { Socket } from "socket.io-client";
import $ from "jquery";
import { getAll } from "./const.ts";

export function onPair(socket: Socket) {
    $('#fileLabel').css('display', 'block');
    $('#fileInput').on('change', async (event) => {
        let file: File = (event.target as HTMLInputElement).files![0];
        let text: string = await file.text();
        socket.emit('setFile', text);
    });
}

export function onJoin(room: string) {
    $('#connectButton').css('display', 'none');
    $('#disconnectButton').css('display', 'block')
    $('#roomInfo').css('display', 'block');
    $('#roomId').text(room);
}

export function disconnect(socket: Socket) {
    console.log('disconnect');
    socket.disconnect();
	$('#roomInfo').css('display', 'none');
	$('#fileLabel').css('display', 'none');
	$('.data_list').empty();
	$('#connectButton').css('display', 'block');
	$('#disconnectButton').css('display', 'none');
}

export function syncConst(socket: Socket) {
    socket.on('syncConst', (config: { [key: string]: string | number | number[] }) => {
		Object.keys(config).forEach((key: string) => {
			if(config[key] instanceof Array) config[key] = config[key].join(', ');
			$(`#const_${key}`).val(config[key]);
		})
	});

    $('.const_params').on('change', () => {
        socket.emit('syncConst', getAll());
    });

}