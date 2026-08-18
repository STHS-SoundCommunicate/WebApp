import { Socket } from "socket.io-client";
import $ from "jquery";
import { getAll } from "./const.ts";
import ChangeEvent = JQuery.ChangeEvent;

export function onPair(socket: Socket): void {
    $('#fileLabel').css('display', 'block');
    $('#fileInput').on('change', async (event: ChangeEvent) => {
        let file: File = (event.target as HTMLInputElement).files![0];
        let text: string = await file.text();
        socket.emit('setFile', text);
    });
}

export function onJoin(room: string): void {
    $('#connectButton').css('display', 'none');
    $('#disconnectButton').css('display', 'block')
    $('#roomInfo').css('display', 'block');
    $('#roomId').text(room);
}

export function listIds(data: {id: number, string_data: string}[], socket: Socket | undefined = undefined): void {
    const ul = $('.data_list');
    data.forEach((item: {id: number}): void => {
        const li = $('<button>').text(item.id).attr('id', `exp_data_${item.id}`).addClass('data').on('click', (): void => {
            socket?.emit('selectId', item.id);
        });
        ul.append(li);
    });
}

export function disconnect(socket: Socket): void {
    console.log('disconnect');
    socket.disconnect();
	$('#roomInfo').css('display', 'none');
	$('#fileLabel').css('display', 'none');
	$('.data_list').empty();
	$('#connectButton').css('display', 'block');
	$('#disconnectButton').css('display', 'none');
}

export function syncConst(socket: Socket) {
    socket.on('syncConst', (config: { [key: string]: string | number | number[] }): void => {
		Object.keys(config).forEach((key: string): void => {
			const c = $(`#const_${key}`);
			if(typeof config[key] === 'boolean') {
				c.prop('checked', config[key]);
				return;
			}
			if(config[key] instanceof Array) config[key] = config[key].join(', ');
			c.val(config[key]);
		})
	});

    $('.const_params').on('change', (): void => {
        socket.emit('syncConst', getAll());
    });
}