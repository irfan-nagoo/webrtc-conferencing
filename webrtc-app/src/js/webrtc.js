'use strict';

import { io } from "socket.io-client";
import * as bootstrap from 'bootstrap';

var isChannelReady = false;
var isInitiator = false;
var pc = [];
var local_socket_id;
var localStream;
var sendChannel = [];
var receiveChannel;
var localVideo = document.getElementById("localVideo");
var dataChannelSend = document.getElementById("textInput");
var dataChannelReceive = document.getElementById("textChatDisplay");
var sendText = document.getElementById("sendText");
var joinConference = document.getElementById("joinButton");
var turnReady;

sendText.onclick = sendData;
joinConference.onclick = start;

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

var constraints = {
  video: {
    width: 200,
    height: 200,
    aspectRatio: 3 / 2,
  },
  audio: true,
};


/////// Signaling Logic
var loginModal;
var room;
var local_user;
var socket = io("wss://192.168.29.118:8081", {
  transports: ['websocket']
});

window.onload = () => {
  loginModal = new bootstrap.Modal(document.getElementById("loginModal"), {});
  loginModal.show();
};

function start() {
  loginModal.hide();
  local_user = document.getElementById("user").value;
  room = document.getElementById("room").value;
  socket.emit('create or join', room);
  console.log('Attempted to create or  join room', room);
  console.log('Getting user media with constraints', constraints);
  navigator.mediaDevices.getUserMedia(constraints).then(gotStream)
    .catch(function (e) {
      alert('getUserMedia() error: ' + e.name);
    });

  var userDiv = document.createElement("div");
  userDiv.className = "overlay";
  userDiv.appendChild(document.createTextNode(local_user));
  document.getElementById("localVideoDiv").appendChild(userDiv);

  //For non localhost clients
  if (location.hostname !== 'localhost') {
    requestTurn(
      'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
    );
  }

}

///////// Connection protocol
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
  socket.emit('message', message, {
    room: room,
    from_user: local_user,
    to_socket_id: to_socket_id
  });
}

// This client receives a message
socket.on('message', function (message, metaData) {
  if ((message !== 'got user media' && metaData.to_socket_id !== local_socket_id)
    || local_socket_id === metaData.from_socket_id) {
    console.log('Local Socket[' + local_socket_id + '], Remote Socket[' + metaData.to_socket_id + ']');
    return;
  }
  console.log('Client [' + local_socket_id + '] received message from [' +
    metaData.from_socket_id + '] with content: ', message);
  if (message === 'got user media') {
    maybeStart(metaData.from_socket_id, metaData.from_user);
  } else if (message.type === 'offer') {
    if (pc[metaData.from_socket_id] === undefined) {
      maybeStart(metaData.from_socket_id, metaData.from_user);
    }
    if (pc[metaData.from_socket_id].remoteDescription === null) {
      pc[metaData.from_socket_id].setRemoteDescription(new RTCSessionDescription(message));
      doAnswer(metaData.from_socket_id);
    }
  } else if (message.type === 'answer') {
    if (pc[metaData.from_socket_id].remoteDescription === null) {
      pc[metaData.from_socket_id].setRemoteDescription(new RTCSessionDescription(message));
    }
  } else if (message.type === 'candidate') {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    pc[metaData.from_socket_id].addIceCandidate(candidate);
  } else if (message === 'bye') {
    handleRemoteHangup(metaData);
  }
});

//////////// Stream processing logic
function gotStream(stream) {
  console.log('Adding local stream.');
  localStream = stream;
  localVideo.srcObject = stream;
  sendMessage('got user media', room);
}

function maybeStart(from_socket_id, from_user) {
  console.log('>>>>>>> maybeStart() ', localStream, isChannelReady);
  if (typeof localStream !== 'undefined' && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection(from_socket_id, from_user);
    pc[from_socket_id].addStream(localStream);
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall(from_socket_id);
    }
  }
}

window.onbeforeunload = function () {
  sendMessage('bye', room);
  return true;
};

/////////////////////////////////////////////////////////
function createPeerConnection(socket_id, from_user) {
  try {
    // Allows for RTC server configuration
    var servers = null;
    var pcConstraint = null;
    var dataConstraint = null;
    pc[socket_id] = new RTCPeerConnection(servers, pcConstraint);
    pc[socket_id].onicecandidate = (event) => handleIceCandidate(event, socket_id);
    pc[socket_id].onaddstream = (event) => handleRemoteStreamAdded(event, socket_id, from_user);
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
  var data = {
    content: dataChannelSend.value,
    user: local_user
  };
  sendChannel.forEach(element => element.send(JSON.stringify(data)));
  addChatLine(data, 'send');
  dataChannelSend.value = '';
  console.log("Data Sent", data.content);
}

function receiveChannelCallback(event) {
  console.log('Receive Channel Callback');
  receiveChannel = event.channel;
  receiveChannel.onmessage = onReceiveMessageCallback;
  isInitiator = true;
}

function onReceiveMessageCallback(event) {
  console.log('Received Message', event);
  addChatLine(JSON.parse(event.data), 'receive');
}

function addChatLine(data, sendRecieve) {
  const mainDiv = document.createElement("div");
  const childDiv = document.createElement("div");
  const contentDiv = document.createElement("div");
  const userDiv = document.createElement("div");
  const pTime = document.createElement("p");
  const img = document.createElement("img");
  const content = document.createTextNode(data.content);
  const userContent = document.createTextNode("~" + data.user);
  const currentDate = new Date();
  const time = document.createTextNode(`${currentDate.getHours()}:${currentDate.getMinutes()}`);

  if (sendRecieve === 'send') {
    mainDiv.className = "d-flex flex-row justify-content-end mb-4 pt-1";
    contentDiv.className = "small p-2 me-3 mb-1 text-white rounded-3";
    contentDiv.id = "sendChatText"
    pTime.className = "small ms-3 mb-3 rounded-3 text-muted d-flex justify-content-end";
    pTime.id = "sendChatTime";
    img.src = "../assets/images/avatar.jpg";
    img.alt = data.user;
    img.id = "chatImage";
    userDiv.className = "d-flex flex-row justify-content-end";
    userDiv.id = "sendChatUser";
    mainDiv.appendChild(childDiv);
    mainDiv.appendChild(img);
  } else {
    mainDiv.className = "d-flex flex-row justify-content-start";
    contentDiv.className = "small p-2 ms-3 mb-1 text-white rounded-3 bg-secondary";
    contentDiv.id = "recieveChatText";
    pTime.className = "small me-3 mb-3 rounded-3 text-muted";
    pTime.id = "recieveChatTime";
    img.src = "../assets/images/avatar.jpg";
    img.alt = data.user;
    img.id = "chatImage";
    userDiv.className = "d-flex flex-row justify-content-start";
    userDiv.id = "recieveChatUser";
    mainDiv.appendChild(img);
    mainDiv.appendChild(childDiv);
  }
  userDiv.appendChild(userContent);
  contentDiv.appendChild(content);
  contentDiv.appendChild(userDiv);
  pTime.appendChild(time);
  childDiv.appendChild(contentDiv);
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

function handleRemoteStreamAdded(event, socket_id, from_user) {
  var mainDiv = document.createElement("div");
  mainDiv.id = "remoteVideoDiv";
  mainDiv.className = "p-2";
  var remoteVideo = document.createElement("video");
  //remoteVideo.id = socket_id;
  remoteVideo.autoplay = true;
  remoteVideo.playsInline = true;
  remoteVideo.srcObject = event.stream;
  mainDiv.appendChild(remoteVideo);

  var userDiv = document.createElement("div");
  userDiv.className = "overlay";
  userDiv.appendChild(document.createTextNode(from_user));
  mainDiv.appendChild(userDiv);

  document.getElementById("videos").appendChild(mainDiv);
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

function handleRemoteHangup(metaData) {
  console.log('Session terminated.');
  stop(metaData);
  isInitiator = false;
}

function stop() {
  pc[local_socket_id].close();
  pc[local_socket_id] = null;
}