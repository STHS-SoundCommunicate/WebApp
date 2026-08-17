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

export function listIds(data: {id: number, string_data: string}[], socket: Socket | undefined = undefined): void {
    const ul = $('.data_list');
    // ul.empty();
    data.forEach((item) => {
        const li = $('<button>').text(item.id).attr('id', `exp_data_${item.id}`).addClass('data').on('click', () => {
            socket?.emit('selectId', item.id);
        });
        ul.append(li);
    });
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
			const c = $(`#const_${key}`);
			if(typeof config[key] === 'boolean') {
				c.prop('checked', config[key]);
				return;
			}
			if(config[key] instanceof Array) config[key] = config[key].join(', ');
			c.val(config[key]);
		})
	});

    $('.const_params').on('change', () => {
        socket.emit('syncConst', getAll());
    });
}