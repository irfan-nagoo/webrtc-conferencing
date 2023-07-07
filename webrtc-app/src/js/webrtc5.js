'use strict';

import { io } from "socket.io-client";

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var pc = [];
var local_socket_id;
var localStream;
var sendChannel = [];
var receiveChannel;
var dataChannelSend = document.getElementById("textInput");
var dataChannelReceive = document.getElementById("textChatDisplay");
var sendText = document.getElementById("sendText");
var turnReady;

sendText.onclick = sendData;

var pcConfig = {
  'iceServers': [
    { 'urls': 'stun:stun.services.mozilla.com' },
    { 'urls': 'stun:stun.l.google.com:19302' }
  ]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  offerToRecieveAudio: true,
  offerToRecieveVideo: true,
};


/////// Signaling Logic

// prompt for room name:
var room = prompt('Enter room name:');

var socket = io("wss://192.168.29.118:8081", {
  transports: ['websocket']
});

if (room !== '') {
  socket.emit('create or join', room);
  console.log('Attempted to create or  join room', room);
}

socket.on('created', function (room, socket_id) {
  console.log('Created room ' + room);
  local_socket_id = socket_id;
  isInitiator = true;
});

socket.on('full', function (room) {
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (room, socket_id) {
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', function (room, socket_id) {
  console.log('joined: ', room, socket_id);
  local_socket_id = socket_id;
  isChannelReady = true;
});

socket.on('log', function (array) {
  console.log.apply(console, array);
});


///////// Message Processing logic
function sendMessage(message, room, to_socket_id) {
  console.log('Client sending message: ', message);
  socket.emit('message', message, room, to_socket_id);
}

// This client receives a message
socket.on('message', function (message, from_socket_id, to_socket_id) {
  if ((message !== 'got user media' && to_socket_id !== local_socket_id)
    || local_socket_id == from_socket_id) {
    console.log('Local Socket[' + local_socket_id + '], Remote Socket[' + to_socket_id + ']');
    return;
  }
  console.log('Client [' + local_socket_id + '] received message from [' +
    from_socket_id + '] with content: ', message);

  if (message === 'got user media') {
    maybeStart(from_socket_id);
  } else if (message.type === 'offer') {
    if (pc[from_socket_id] === undefined) {
      maybeStart(from_socket_id);
    }
    if (pc[from_socket_id].remoteDescription === null) {
      console.log('offer consumed by', pc[from_socket_id]);
      pc[from_socket_id].setRemoteDescription(new RTCSessionDescription(message));
      doAnswer(from_socket_id);
    }

  } else if (message.type === 'answer' && isStarted) {
    if (pc[from_socket_id].remoteDescription === null) {
      console.log('answer consumed by', pc[from_socket_id]);
      pc[from_socket_id].setRemoteDescription(new RTCSessionDescription(message));
    }
  } else if (message.type === 'candidate' && isStarted) {
    if (to_socket_id === local_socket_id) {
      var candidate = new RTCIceCandidate({
        sdpMLineIndex: message.label,
        candidate: message.candidate
      });
      pc[from_socket_id].addIceCandidate(candidate);
    }
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});

//////////// Stream processing logic
var localVideo = document.querySelector('#localVideo');

navigator.mediaDevices.getUserMedia({
  video: {
    width: 200,
    height: 200,
    aspectRatio: 3 / 2,
  },
  audio: false,
}).then(gotStream)
  .catch(function (e) {
    alert('getUserMedia() error: ' + e.name);
  });

function gotStream(stream) {
  console.log('Adding local stream.');
  localStream = stream;
  localVideo.srcObject = stream;
  sendMessage('got user media', room);
}

var constraints = {
  video: true
};

console.log('Getting user media with constraints', constraints);

if (location.hostname !== 'localhost') {
  requestTurn(
    'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
  );
}

function maybeStart(from_socket_id) {
  console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
  if (typeof localStream !== 'undefined' && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection(from_socket_id);
    pc[from_socket_id].addStream(localStream);
    isStarted = true;
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall(from_socket_id);
    }
  }
}

window.onbeforeunload = function () {
  sendMessage('bye', room);
};

/////////////////////////////////////////////////////////
function createPeerConnection(socket_id) {
  try {
    // Allows for RTC server configuration
    var servers = null;
    var pcConstraint = null;
    var dataConstraint = null;
    pc[socket_id] = new RTCPeerConnection(servers, pcConstraint);
    pc[socket_id].onicecandidate = (event) => handleIceCandidate(event, socket_id);
    pc[socket_id].onaddstream = (event) => handleRemoteStreamAdded(event, socket_id);
    pc[socket_id].onremovestream = (event) => handleRemoteStreamRemoved(event, socket_id);

    // create data channel
    sendChannel.push(pc[socket_id].createDataChannel('sendDataChannel', dataConstraint));
    pc[socket_id].ondatachannel = receiveChannelCallback;

    console.log('Created RTCPeerConnnection');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

function handleIceCandidate(event, from_socket_id) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    }, room, from_socket_id);
  } else {
    console.log('End of candidates.');
  }
}

function handleCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}

function sendData() {
  var data = dataChannelSend.value;
  sendChannel.forEach(element => element.send(data));
  addChatLine(data, 'send');
  dataChannelSend.value = '';
  console.log("Data Sent", data);
}

function receiveChannelCallback(event) {
  console.log('Receive Channel Callback');
  receiveChannel = event.channel;
  receiveChannel.onmessage = onReceiveMessageCallback;
  isInitiator = true;
}

function onReceiveMessageCallback(event) {
  console.log('Received Message');
  addChatLine(event.data, 'receive');
}

function addChatLine(data, sendRecieve) {
  const mainDiv = document.createElement("div");
  const childDiv = document.createElement("div");
  const pContent = document.createElement("p");
  const pTime = document.createElement("p");
  const img = document.createElement("img");
  const content = document.createTextNode(data);
  const currentDate = new Date();
  const time = document.createTextNode(`${currentDate.getHours()}:${currentDate.getMinutes()}`);

  if (sendRecieve === 'send') {
    mainDiv.className = "d-flex flex-row justify-content-end mb-4 pt-1";
    pContent.className = "small p-2 me-3 mb-1 text-white rounded-3 bg-primary";
    pTime.className = "small ms-3 mb-3 rounded-3 text-muted d-flex justify-content-end";
    pTime.style = "padding-right: 15px;";
    img.src = "../assets/images/avatar.jpg";
    img.alt = "avatar 1";
    img.style = "width: 45px; height: 100%";
    mainDiv.appendChild(childDiv);
    mainDiv.appendChild(img);
  } else {
    mainDiv.className = "d-flex flex-row justify-content-start";
    pContent.className = "small p-2 ms-3 mb-1 text-white rounded-3 bg-secondary";
    pTime.className = "small me-3 mb-3 rounded-3 text-muted";
    pTime.style = "padding-left: 15px;";
    img.src = "../assets/images/avatar.jpg";
    img.alt = "avatar 1";
    img.style = "width: 45px; height: 100%";
    mainDiv.appendChild(img);
    mainDiv.appendChild(childDiv);
  }
  pContent.appendChild(content);
  pTime.appendChild(time);
  childDiv.appendChild(pContent);
  childDiv.appendChild(pTime);
  dataChannelReceive.appendChild(mainDiv);
  dataChannelReceive.scrollTop = dataChannelReceive.scrollHeight;
}

function doCall(from_socket_id) {
  console.log('Sending offer to peer');
  pc[from_socket_id].createOffer((sessionDescription) => {
    pc[from_socket_id].setLocalDescription(sessionDescription);
    sendMessage(sessionDescription, room, from_socket_id);
  }, handleCreateOfferError);
}

function doAnswer(from_socket_id) {
  console.log('Sending answer to peer.');
  pc[from_socket_id].createAnswer().then((sessionDescription) => {
    pc[from_socket_id].setLocalDescription(sessionDescription);
    sendMessage(sessionDescription, room, from_socket_id);
  }, onCreateSessionDescriptionError);
}

function setLocalAndSendMessage(sessionDescription, from_socket_id) {
  console.log('setLocalAndSendMessage sending message', sessionDescription, from_socket_id);
  pc[from_socket_id].setLocalDescription(sessionDescription);
  sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
  console.log('Failed to create session description: ' + error.toString());
}

function requestTurn(turnURL) {
  var turnExists = false;
  for (var i in pcConfig.iceServers) {
    if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    console.log('Getting TURN server from ', turnURL);
    // No TURN server. Get one from computeengineondemand.appspot.com:
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4 && xhr.status === 200) {
        var turnServer = JSON.parse(xhr.responseText);
        console.log('Got TURN server: ', turnServer);
        pcConfig.iceServers.push({
          'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
          'credential': turnServer.password
        });
        turnReady = true;
      }
    };
    xhr.open('GET', turnURL, true);
    xhr.send();
  }
}

function handleRemoteStreamAdded(event, socket_id) {
  var remoteVideo = document.createElement("video");
  remoteVideo.id = socket_id;
  remoteVideo.autoplay = true;
  remoteVideo.playsInline = true;
  remoteVideo.srcObject = event.stream;
  document.getElementById("videos").appendChild(remoteVideo);
  console.log('Remote stream added. Event: ', event);
}

function handleRemoteStreamRemoved(event, socket_id) {
  console.log('Remote stream removed. Event: ', event);
}

function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage('bye');
}

function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
  isInitiator = false;
}

function stop() {
  isStarted = false;
  pc[local_socket_id].close();
  pc[local_socket_id] = null;
}