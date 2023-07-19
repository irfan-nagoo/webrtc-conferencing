'use strict';


export function sendMessage(socket, message, room, local_user, to_socket_id) {
    console.log('Client sending message: ', message);
    socket.emit('message', message, {
        room: room,
        from_user: local_user,
        to_socket_id: to_socket_id
    });
}