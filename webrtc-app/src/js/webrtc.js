'use strict';

import * as bootstrap from 'bootstrap';
import { io } from "socket.io-client";

var isChannelReady = false;
var isInitiator = false;
var peerConnections = [];
var local_socket_id;
var localStream;
var sendDataChannel = [];
var receiveChannel;
var displayStream;
var displaySenders = [];
var screen_track_id;
var localVideo = document.getElementById("localVideo");
var dataChannelSend = document.getElementById("textInput");
var dataChannelReceive = document.getElementById("textChatDisplay");
var sendText = document.getElementById("sendText");
var inputFile = document.getElementById("fileInput");
var joinConference = document.getElementById("joinButton");
var micOnOff = document.getElementById("micOnOff");
var videoOnOff = document.getElementById("videoOnOff");
var screenShare = document.getElementById("screenShare");
var hangUp = document.getElementById("hangup");
var turnReady;

sendText.onclick = sendData;
joinConference.onclick = start;
micOnOff.onclick = toggleAudio;
videoOnOff.onclick = toggleVideo;
screenShare.onclick = startScreenShare;
hangUp.onclick = hangup;
inputFile.onchange = filesSelected;

var pcConfig = {
  'iceServers': [
    { 'urls': 'stun:stun.services.mozilla.com' },
    { 'urls': 'stun:stun.l.google.com:19302' }
  ]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  offerToRecieveAudio: true,
  offerToRecieveVideo: true
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
  transports: ['websocket'],
  closeOnBeforeunload: false
});

// browser events
window.onload = () => {
  loginModal = new bootstrap.Modal(document.getElementById("loginModal"), {});
  loginModal.show();
};

window.onbeforeunload = (event) => {
  sendMessage({ type: 'bye' }, room);
};


/// Start
function start() {
  loginModal.hide();
  local_user = document.getElementById("user").value;
  room = document.getElementById("room").value;
  room = room.toUpperCase().trim();
  socket.emit('create or join', room);
  console.log('Attempted to create or  join room', room);
  console.log('Getting user media with constraints', constraints);
  navigator.mediaDevices.getUserMedia(constraints).then(gotStream)
    .catch(function (e) {
      alert('The Audio/Video media devices could not be');
      console.error('getUserMedia() error: ', e);
    });

  var micDiv = document.createElement("div");
  micDiv.className = "overlay-mic";
  micDiv.id = "micDiv";
  var micImg = document.createElement("img");
  micImg.src = "../assets/icons/mic.svg";
  micImg.className = "mic-on-svg";
  micDiv.appendChild(micImg);
  document.getElementById("localVideoDiv").appendChild(micDiv);

  var userDiv = document.createElement("div");
  userDiv.className = "overlay-text";
  userDiv.id = "userDiv";
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
  if ((metaData.to_socket_id !== undefined && metaData.to_socket_id !== local_socket_id)
    || local_socket_id === metaData.from_socket_id) {
    console.log('Local Socket[' + local_socket_id + '], Remote Socket[' + metaData.to_socket_id + ']');
    return;
  }
  console.log('Client [' + local_socket_id + '] received message from [' +
    metaData.from_socket_id + '] with content: ', message);

  switch (message.type) {
    case 'got user media':
      maybeStart(metaData.from_socket_id, metaData.from_user);
      break;
    case 'offer':
      if (peerConnections[metaData.from_socket_id] === undefined) {
        maybeStart(metaData.from_socket_id, metaData.from_user);
      }
      peerConnections[metaData.from_socket_id].setRemoteDescription(new RTCSessionDescription(message));
      doAnswer(metaData.from_socket_id);
      break;
    case 'answer':
      peerConnections[metaData.from_socket_id].setRemoteDescription(new RTCSessionDescription(message));
      break;
    case 'candidate':
      var candidate = new RTCIceCandidate({
        sdpMLineIndex: message.label,
        candidate: message.candidate
      });
      peerConnections[metaData.from_socket_id].addIceCandidate(candidate);
      break;
    case 'sharescreen':
      console.info("Screen Sharing session is active");
      screen_track_id = message.screen_track_id;
      screenShare.disabled = true;
      break;
    case 'unsharescreen':
      handleUnshareScreen(metaData);
      break;
    case 'mute':
      handleMuteUnMute(true, metaData);
      break;
    case 'unmute':
      handleMuteUnMute(false, metaData);
      break;
    case 'bye':
      handleRemoteHangup(metaData);
      break;
    default:
      console.log("Unknown message type: ", message.type);
  }
});

socket.on('close', function (from_socket_id) {
  if (peerConnections[from_socket_id] !== null && peerConnections[from_socket_id] !== undefined) {
    handleRemoteHangup({ from_socket_id: from_socket_id })
  }
});

//////////// Stream processing logic
function gotStream(stream) {
  console.log('Adding local stream.', stream);
  localStream = stream;
  localVideo.srcObject = stream;
  sendMessage({ type: 'got user media' }, room);
}

function maybeStart(from_socket_id, from_user) {
  console.log('>>>>>>> maybeStart() ', localStream, isChannelReady);
  if (localStream !== undefined && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection(from_socket_id, from_user);

    // add tracks
    for (const track of localStream.getTracks()) {
      peerConnections[from_socket_id].addTrack(track, localStream);
    }

    // is sharing screen active
    if (displayStream !== undefined) {
      console.log('>>>>>> Sharing screen on');
      sendMessage({
        type: "sharescreen",
        screen_track_id: displayStream.id
      }, room);
      var displayTrack = displayStream.getVideoTracks()[0];
      displayTrack.onended = stopScreenShare;
      console.log('Adding Display Track', displayStream.id);
      displaySenders[from_socket_id] = peerConnections[from_socket_id].addTrack(displayTrack, displayStream);
    }
    console.log('isInitiator', isInitiator);
  }
}


/////////////////////////////////////////////////////////
function createPeerConnection(socket_id, from_user) {
  try {
    // Allows for RTC server configuration
    var servers = null;
    var pcConstraint = null;
    var dataConstraint = null;
    peerConnections[socket_id] = new RTCPeerConnection(servers, pcConstraint);
    peerConnections[socket_id].onicecandidate = (event) => handleIceCandidate(event, socket_id);
    peerConnections[socket_id].ontrack = (event) => handleOnTrack(event, socket_id, from_user);
    peerConnections[socket_id].onnegotiationneeded = (event) => handleOnNegotiationNeeded(event, socket_id);

    // create data channel
    sendDataChannel.push(peerConnections[socket_id].createDataChannel('sendDataChannel', dataConstraint));
    peerConnections[socket_id].ondatachannel = receiveChannelCallback;

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

async function doCall(from_socket_id) {
  console.log('Sending offer to peer');
  var offer = await peerConnections[from_socket_id].createOffer(sdpConstraints);
  await peerConnections[from_socket_id].setLocalDescription(offer);
  sendMessage(offer, room, from_socket_id);
}

async function doAnswer(from_socket_id) {
  console.log('Sending answer to peer.');
  var answer = await peerConnections[from_socket_id].createAnswer(sdpConstraints);
  await peerConnections[from_socket_id].setLocalDescription(answer);
  sendMessage(answer, room, from_socket_id);;
}

function handleOnNegotiationNeeded(event, from_socket_id) {
  console.log("onnegotiationneeded event:", event);
  if (isInitiator) {
    doCall(from_socket_id);
  }
}

function handleOnTrack(event, socket_id, from_user) {
  var mainDiv = document.querySelector("[socket='" + socket_id + "']");
  if (mainDiv === null) {
    // add stream and track
    mainDiv = document.createElement("div");
    mainDiv.id = "remoteVideoDiv";
    mainDiv.className = "p-2";
    mainDiv.setAttribute("socket", socket_id);
    var remoteVideo = document.createElement("video");
    remoteVideo.id = "remoteVideo";
    remoteVideo.autoplay = true;
    remoteVideo.playsInline = true;
    remoteVideo.srcObject = event.streams[0];
    mainDiv.appendChild(remoteVideo);

    var micDiv = document.createElement("div");
    micDiv.className = "overlay-mic";
    micDiv.id = "micDiv";
    var micImg = document.createElement("img");
    micImg.src = "../assets/icons/mic.svg";
    micImg.className = "mic-on-svg";
    micImg.id = "micImg";
    micDiv.appendChild(micImg);
    mainDiv.appendChild(micDiv);

    var userDiv = document.createElement("div");
    userDiv.className = "overlay-text";
    userDiv.id = "userDiv";
    userDiv.appendChild(document.createTextNode(from_user));
    mainDiv.appendChild(userDiv);
    document.getElementById("videos").appendChild(mainDiv);
    console.log('Remote stream and track added. Event: ', event);
  } else {
    // add only track to existing stream
    var video = mainDiv.getElementsByTagName("video")[0];
    if (event.streams[0].id !== screen_track_id) {
      video.srcObject.addTrack(event.track);
      console.log('Remote track added. Event: ', event);
    } else {
      var screenVideoDiv = document.getElementById("screenVideoDiv");
      screenVideoDiv.hidden = false;
      screenVideoDiv.setAttribute("socket", socket_id);
      var screenShareVideo = document.getElementById("screenVideo");
      screenShareVideo.srcObject = event.streams[0];
      var userDiv = document.createElement("div");
      userDiv.className = "overlay-text-screen";
      userDiv.id = "userDiv";
      userDiv.appendChild(document.createTextNode(from_user + "'s Screen"));
      screenVideoDiv.appendChild(userDiv);
      console.log('Screen Share added. Event: ', event);
    }
  }
}

function filesSelected(event) {
  var files;
  for (const file of event.srcElement.files) {
    files = files ? files + ', ' + file.name : file.name;
  }
  dataChannelSend.value = files;
}

async function sendData() {
  var data = {
    type: 'text',
    content: dataChannelSend.value,
    user: local_user
  };

  if (inputFile.files.length === 0) {
    // text data
    if (!dataChannelSend.value) {
      return;
    }
    sendDataChannel.forEach(channel => {
      if (channel.readyState === 'open') {
        channel.send(JSON.stringify(data))
      } else {
        console.log("Data channel state[" + channel.readyState + "] not open");
      }
    });
  } else {
    // file transfer
    await transferFiles(inputFile.files);
    inputFile.value = "";
  }
  addChatLine(data, 'send');
  dataChannelSend.value = '';
  console.log("Data Sent", data.content);
}

async function transferFiles(files) {
  const MAX_DATA_CHUNK_SIZE = 65535;
  for (const file of files) {
    var arrayBuffer = await file.arrayBuffer();
    var numberOfChunks = arrayBuffer.byteLength / MAX_DATA_CHUNK_SIZE | 0;
    var data = {
      type: 'file',
      name: file.name,
      content: arrayBuffer.byteLength,
      user: local_user
    };

    sendDataChannel.forEach(channel => {
      if (channel.readyState === 'open') {
        // send size and user
        channel.send(JSON.stringify(data))

        // send actual chunk
        for (var i = 0; i < numberOfChunks; i++) {
          var begin = i * MAX_DATA_CHUNK_SIZE;
          var end = (i + 1) * MAX_DATA_CHUNK_SIZE;
          channel.send(arrayBuffer.slice(begin, end));
        }

        // send remaining chunk (if any)
        if (arrayBuffer.byteLength % MAX_DATA_CHUNK_SIZE) {
          channel.send(arrayBuffer.slice(numberOfChunks * MAX_DATA_CHUNK_SIZE));
        }
        console.log("File Sending Complete!");
      } else {
        console.log("Data channel state[" + channel.readyState + "] not open");
      }
    });
  }
}

function receiveChannelCallback(event) {
  console.log('Receive Channel Callback');
  isInitiator = true;
  receiveChannel = event.channel;
  receiveChannel.onmessage = handelOnMessage();
}

function handelOnMessage() {
  var fileBuffer, currSize, fileName, userName;
  return function onMessage(event) {
    console.log('Received Message', event);
    if (typeof event.data === "string") {
      var data = JSON.parse(event.data);
      if (data.type === "text") {
        addChatLine(data, 'receive');
      } else {
        fileBuffer = new Uint8ClampedArray(parseInt(data.content));
        fileName = data.name;
        userName = data.user;
        currSize = 0;
      }
      return;
    }

    // add chunk
    var dataChunk = new Uint8ClampedArray(event.data);
    fileBuffer.set(dataChunk, currSize);
    currSize += dataChunk.byteLength;
    if (currSize === fileBuffer.byteLength) {
      // transfer complete
      console.log("File Receiving Complete!");
      var file = new Blob([fileBuffer])
      var aTag = document.createElement("a");
      var content = document.createTextNode(fileName);
      aTag.href = window.URL.createObjectURL(file);
      aTag.download = fileName;
      aTag.appendChild(content);
      addChatLine({
        type: 'file',
        content: aTag,
        user: userName
      }, "receive");

    }
  }
}

function handleMuteUnMute(isMute, metaData) {
  console.log("Handling mute/unmute");
  var mainDiv = document.querySelector("[socket='" + metaData.from_socket_id + "']");
  toggleMicImage(isMute, mainDiv);
}

function addChatLine(data, sendRecieve) {
  const mainDiv = document.createElement("div");
  const childDiv = document.createElement("div");
  const contentDiv = document.createElement("div");
  const userDiv = document.createElement("div");
  const pTime = document.createElement("p");
  const img = document.createElement("img");
  var content;
  if (data.type === "file") {
    content = data.content;
  } else {
    content = document.createTextNode(data.content);
  }
  const userContent = document.createTextNode("~" + data.user);
  const currentDate = new Date();
  const time = document.createTextNode(`${currentDate.getHours()}
                                    :${currentDate.getMinutes()}`);

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

function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage({ type: 'bye' }, room);
  socket.disconnect();
  location.reload();
}

function toggleAudio() {
  var mainDiv = document.getElementById("localVideoDiv");
  var micOnOffImg = document.getElementById("micOnOffImg");
  localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
  if (localStream.getAudioTracks()[0].enabled) {
    micOnOff.className = "btn btn-circle btn-light";
    micOnOffImg.src = "../assets/icons/mic.svg";
    toggleMicImage(false, mainDiv);
    sendMessage({ type: 'unmute' }, room);
  } else {
    micOnOff.className = "btn btn-circle btn-warning";
    micOnOffImg.src = "../assets/icons/mic-mute.svg";
    toggleMicImage(true, mainDiv);
    sendMessage({ type: 'mute' }, room);
  }
}

function toggleVideo() {
  var videoOnOffImg = document.getElementById("videoOnOffImg");
  localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
  if (localStream.getVideoTracks()[0].enabled) {
    videoOnOff.className = "btn btn-circle btn-light";
    videoOnOffImg.src = "../assets/icons/camera-video.svg";
  } else {
    videoOnOff.className = "btn btn-circle btn-warning";
    videoOnOffImg.src = "../assets/icons/camera-video-off.svg";
  }
}

async function startScreenShare() {
  console.log('Starting screen sharing...');
  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: "always",
        displaySurface: "monitor",
        logicalSurface: false
      },
      audio: false
    });

    var displayTrack = displayStream.getVideoTracks()[0];
    displayTrack.onended = stopScreenShare;
    sendMessage({
      type: "sharescreen",
      screen_track_id: displayStream.id
    }, room);
    for (let property in peerConnections) {
      if (peerConnections[property] !== null) {
        console.log('Adding Display Track', displayStream.id);
        displaySenders[property] = peerConnections[property].addTrack(displayTrack, displayStream);
      }
    }
    screenShare.disabled = true;
  } catch (e) {
    alert('Screen sharing is not supported on mobile devices');
    console.error('getDisplayMedia() error: ', e);
  }
}

function stopScreenShare() {
  console.log('Stopping screen sharing...');
  screenShare.disabled = false;
  displayStream = undefined;
  sendMessage({ type: "unsharescreen" }, room);
  for (let property in peerConnections) {
    if (peerConnections[property] !== null) {
      peerConnections[property].removeTrack(displaySenders[property]);
    }
  }
}

function handleUnshareScreen(metaData) {
  console.log('Recieved screen unshare');
  screen_track_id = undefined;
  screenShare.disabled = false;
  document.getElementById("screenVideo").srcObject = null;
  document.getElementById("screenVideoDiv").hidden = true;
}

function toggleMicImage(isMute, mainDiv) {
  var divList = mainDiv.getElementsByTagName("div")
  for (const element of divList) {
    if (element.id === "micDiv") {
      element.remove();
      break;
    }
  };
  var micDiv = document.createElement("div");
  micDiv.className = "overlay-mic";
  micDiv.id = "micDiv";
  var micImg = document.createElement("img");
  if (isMute) {
    micImg.src = "../assets/icons/mic-mute.svg";
    micImg.className = "mic-off-svg";
  } else {
    micImg.src = "../assets/icons/mic.svg";
    micImg.className = "mic-on-svg";
  }
  micImg.id = "micImg";
  micDiv.appendChild(micImg);
  mainDiv.appendChild(micDiv);
}

function handleRemoteHangup(metaData) {
  console.log('Session terminated for user: ', metaData.from_user);
  stop(metaData);
}

function stop(metaData) {
  if (metaData === null || metaData === undefined) {
    console.log('Closing All conections...')
    for (let property in peerConnections) {
      if (peerConnections[property] !== null) {
        peerConnections[property].close();
        peerConnections[property] == null;
      }
    }
    return;
  }

  const mainDivList = document.querySelectorAll("[socket='" + metaData.from_socket_id + "']");
  if (mainDivList !== null) {
    mainDivList.forEach(mainDiv => {
      if (mainDiv.id === "screenVideoDiv") {
        mainDiv.hidden = true;
        mainDiv.removeAttribute("socket");
        mainDiv.getElementsByTagName("video")[0].srcObject = null;
        screenShare.disabled = false;
      } else {
        mainDiv.remove();
      }
    });
  }
  if (peerConnections[metaData.from_socket_id] !== null) {
    console.log('Closing conection...')
    peerConnections[metaData.from_socket_id].close();
    peerConnections[metaData.from_socket_id] = null;
  }
}