'use strict';

import { io } from "socket.io-client";

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var pc;
var localStream;
var remoteStream;
var sendChannel;
var receiveChannel;
var dataChannelSend = document.getElementById("textInput");
var dataChannelReceive = document.getElementById("textChatDisplay");
var sendText = document.getElementById("sendText");
var turnReady;

sendText.onclick = sendData;

var pcConfig = {
  'iceServers': [{
    'urls': 'stun:stun.l.google.com:19302'
  }]
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

socket.on('created', function (room) {
  console.log('Created room ' + room);
  isInitiator = true;
});

socket.on('full', function (room) {
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (room) {
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', function (room) {
  console.log('joined: ' + room);
  isChannelReady = true;
});

socket.on('log', function (array) {
  console.log.apply(console, array);
});


///////// Message Processing logic
function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

// This client receives a message
socket.on('message', function (message) {
  console.log('Client received message:', message);
  if (message === 'got user media') {
    maybeStart();
  } else if (message.type === 'offer') {
    if (!isInitiator && !isStarted) {
      maybeStart();
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer' && isStarted) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' && isStarted) {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    pc.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});

//////////// Stream processing logic
var localVideo = document.querySelector('#localVideo');
//var remoteVideo = document.querySelector('#remoteVideo');

navigator.mediaDevices.getUserMedia({
  video: {
    width: 200,
    height: 200,
    aspectRatio: 3 / 2,
  },
  audio: true,
}).then(gotStream)
  .catch(function (e) {
    alert('getUserMedia() error: ' + e.name);
  });

function gotStream(stream) {
  console.log('Adding local stream.');
  localStream = stream;
  localVideo.srcObject = stream;
  sendMessage('got user media');
  if (isInitiator) {
    maybeStart();
  }
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

function maybeStart() {
  console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
  if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection();
    pc.addStream(localStream);
    isStarted = true;
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall();
    }
  }
}

window.onbeforeunload = function () {
  sendMessage('bye');
};

/////////////////////////////////////////////////////////
function createPeerConnection() {
  try {
    // Allows for RTC server configuration
    var servers = null;
    var pcConstraint = null;
    var dataConstraint = null;
    pc = new RTCPeerConnection(servers, pcConstraint);
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = handleRemoteStreamRemoved;

    // create data channel
    sendChannel = pc.createDataChannel('sendDataChannel', dataConstraint);
    pc.ondatachannel = receiveChannelCallback;

    console.log('Created RTCPeerConnnection');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

function handleIceCandidate(event) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    console.log('End of candidates.');
  }
}

function handleCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}

function sendData() {
  var data = dataChannelSend.value;
  sendChannel.send(data);
  addChatLine(data, 'send');
  dataChannelSend.value = '';
  console.log("Data Sent", data);
}

function receiveChannelCallback(event) {
  console.log('Receive Channel Callback');
  receiveChannel = event.channel;
  receiveChannel.onmessage = onReceiveMessageCallback;
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

function doCall() {
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
  console.log('Sending answer to peer.');
  pc.createAnswer().then(
    setLocalAndSendMessage,
    onCreateSessionDescriptionError
  );
}

function setLocalAndSendMessage(sessionDescription) {
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message', sessionDescription);
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

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteStream = event.stream;
  const remoteVideo = document.createElement("video");
  remoteVideo.autoplay = true;
  remoteVideo.playsInline = true;
  remoteVideo.srcObject = remoteStream;
  document.getElementById("videos").appendChild(remoteVideo);
}

function handleRemoteStreamRemoved(event) {
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
  pc.close();
  pc = null;
}