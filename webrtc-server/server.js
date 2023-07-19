'use strict';

require('dotenv').config();
const logger = require('./src/js/winston-logging.js').logger;
const nodeStatic = require('node-static');
const fs = require('fs');
const https = require('https');

logger.info('Starting Node Server at port[' + process.env.SERVER_PORT + '] ....');
var fileServer = new (nodeStatic.Server)();

const options = {
    ca: fs.readFileSync('ssl/CAcert.pem', 'utf8'),
    key: fs.readFileSync('ssl/key.pem', 'utf8'),
    cert: fs.readFileSync('ssl/cert.pem', 'utf8'),
    passphrase: process.env.SSL_KEY_PASSPHRASE
};

var app = https.createServer(options, function (req, res) {
    fileServer.serve(req, res);
}).listen(process.env.SERVER_PORT);


var io = require('socket.io')(app, {
    cors: {
        origin: process.env.CORS_ALLOW_URL,
        methods: JSON.parse(process.env.CORS_ALLOW_METHODS)
    }
});

io.on('connection', function (socket) {

    socket.on('message', function (message, metaData) {
        logger.info('Message from Client: %o', message);
        io.to(metaData.room).emit('message', message, {
            from_user: metaData.from_user,
            from_socket_id: socket.id,
            to_socket_id: metaData.to_socket_id
        });
    });

    socket.on('create or join', function (room) {
        logger.info('Received request to create or join room ' + room);
        var participantsInRoom = io.sockets.adapter.rooms.get(room);
        var numParticipants = participantsInRoom ? participantsInRoom.size : 0;
        logger.info('Room ' + room + ' now has ' + numParticipants + ' client(s)');

        if (numParticipants === 0) {
            socket.join(room);
            logger.info('Client ID ' + socket.id + ' created room ' + room);
            socket.emit('created', room, socket.id);
        } else if (numParticipants <= parseInt(process.env.MAX_PARTICIPANTS_IN_ROOM)) {
            logger.info('Client ID ' + socket.id + ' joined room ' + room);
            io.in(room).emit('join', room, socket.id);
            socket.join(room);
            socket.emit('joined', room, socket.id);
            io.in(room).emit('ready')
        } else {
            socket.emit('full', room);
        }

    });

    socket.on('disconnect', function () {
        logger.info('Recieved disconnect');
        socket.broadcast.emit('close', socket.id);
    });

});

logger.info('Node Startup Completed!');

