'use strict';

var os = require('os');
var nodeStatic = require('node-static');
const fs = require('fs');
const https = require('https');

console.log('Starting Node Server....');
var fileServer = new (nodeStatic.Server)();

const options = {
    ca: fs.readFileSync('ssl/CAcert.pem', 'utf8'),
    key: fs.readFileSync('ssl/key.pem', 'utf8'),
    cert: fs.readFileSync('ssl/cert.pem', 'utf8'),
    passphrase: 'changeit'
};

var app = https.createServer(options, function (req, res) {
    fileServer.serve(req, res);
}).listen(8081);


var io = require('socket.io')(app, {
    cors: {
        origin: "https://192.168.29.118:8080",
        methods: ["GET", "POST"]
    }
});

io.on('connection', function (socket) {

    // convenience function to log server messages on the client
    function log() {
        var array = ['Message from Server:'];
        array.push.apply(array, arguments);
        console.log("Message from Client: ", arguments[1]);
        socket.emit('log', array);
    }

    socket.on('message', function (message, metaData) {
        log('Client [' + socket.id + '] said: ', message);
        io.to(metaData.room).emit('message', message, { 
            from_user: metaData.from_user, 
            from_socket_id: socket.id, 
            to_socket_id: metaData.to_socket_id
         });
    });

    socket.on('create or join', function (room) {
        log('Received request to create or join room ' + room);

        var clientsInRoom = io.sockets.adapter.rooms.get(room);
        console.log(clientsInRoom);
        var numClients = clientsInRoom ? clientsInRoom.size : 0;
        log('Room ' + room + ' now has ' + numClients + ' client(s)');

        if (numClients === 0) {
            socket.join(room);
            log('Client ID ' + socket.id + ' created room ' + room);
            socket.emit('created', room, socket.id);
        } else if (numClients <= 10) {
            log('Client ID ' + socket.id + ' joined room ' + room);
            io.in(room).emit('join', room, socket.id);
            socket.join(room);
            socket.emit('joined', room, socket.id);
            io.in(room).emit('ready')
        } else {
            socket.emit('full', room);
        }

    });

    socket.on('ipaddr', function () {
        var nwIntFaces = os.networkInterfaces();
        for (var dev in nwIntFaces) {
            nwIntFaces[dev].forEach(function (details) {
                if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
                    socket.emit('ipaddr', details.address);
                }
            });
        }
    });

    socket.on('bye', function () {
        console.log('recieved bye');
    });


});

console.log('Node Startup Completed!');

