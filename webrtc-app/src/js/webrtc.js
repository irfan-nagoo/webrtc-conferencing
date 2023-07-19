'use strict';

import * as bootstrap from 'bootstrap';
import { io } from 'socket.io-client';
import { envConfig } from './config.js'
import { MAX_BUFFER_SIZE, MessageType } from './constants.js';
import { sendData, filesSelected, bufferOrSend, handelOnMessage } from './chat.js';
import { startScreenShare, stopScreenShare } from './screen-share.js';
import { addUserOverlay, toggleMicOverlay } from './overlay.js';
import { sendMessage } from './signaling.js';

var isInitiator = false;
var loginModal;
var room;
var local_user;
var local_socket_id;
var localStream;
var peerConnections = [];
var sendDataChannel = [];
var displayStream = [];
var displaySenders = [];
var screen_track_id;
var localVideo = document.getElementById("localVideo");
var sendTextBtn = document.getElementById("sendTextBtn");
var fileInputBtn = document.getElementById("fileInputBtn");
var joinConferenceBtn = document.getElementById("joinConferenceBtn");
var micOnOffBtn = document.getElementById("micOnOffBtn");
var videoOnOffBtn = document.getElementById("videoOnOffBtn");
var screenShareBtn = document.getElementById("screenShareBtn");
var hangUpBtn = document.getElementById("hangupBtn");

sendTextBtn.onclick = () => sendData(sendDataChannel, local_user);
fileInputBtn.onchange = filesSelected;
joinConferenceBtn.onclick = join;
micOnOffBtn.onclick = toggleAudio;
videoOnOffBtn.onclick = toggleVideo;
screenShareBtn.onclick = () => startScreenShare(socket, peerConnections, displayStream,
  displaySenders, room);
hangUpBtn.onclick = hangup;


// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  offerToRecieveAudio: true,
  offerToRecieveVideo: true
};

var constraints = {
  video: {
    width: { min: 200, ideal: 720, max: 1080 },
    height: { min: 200, ideal: 720, max: 1080 },
  },
  audio: true,
};


// browser events
window.onload = () => {
  loginModal = new bootstrap.Modal(document.getElementById("loginModal"), {});
  loginModal.show();
};

window.onbeforeunload = (event) => {
  sendMessage(socket, { type: MessageType.BYE }, room, local_user);
};

// Socket creation and configuration logic
var socket = io(envConfig.signalingServerUrl, {
  transports: [envConfig.signalingServerTransport],
  closeOnBeforeunload: false
});

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
});

socket.on('joined', function (room, socket_id) {
  console.log('joined: ', room, socket_id);
  local_socket_id = socket_id;
});


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
    case MessageType.GOT_USER_MEDIA:
      maybeStart(metaData.from_socket_id, metaData.from_user);
      break;
    case MessageType.OFFER:
      if (peerConnections[metaData.from_socket_id] === undefined) {
        maybeStart(metaData.from_socket_id, metaData.from_user);
      }
      peerConnections[metaData.from_socket_id].setRemoteDescription(new RTCSessionDescription(message));
      sendAnswer(metaData.from_socket_id);
      break;
    case MessageType.ANSWER:
      peerConnections[metaData.from_socket_id].setRemoteDescription(new RTCSessionDescription(message));
      break;
    case MessageType.CANDIDATE:
      var candidate = new RTCIceCandidate({
        sdpMLineIndex: message.label,
        candidate: message.candidate
      });
      peerConnections[metaData.from_socket_id].addIceCandidate(candidate);
      break;
    case MessageType.SCREEN_SHARE:
      handleShareScreen(message);
      break;
    case MessageType.SCREEN_UNSHARE:
      handleUnshareScreen(metaData);
      break;
    case MessageType.MUTE:
      handleMuteUnMute(true, metaData);
      break;
    case MessageType.UNMUTE:
      handleMuteUnMute(false, metaData);
      break;
    case MessageType.BYE:
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


// Start
function join() {
  loginModal.hide();
  local_user = document.getElementById("user").value;
  room = document.getElementById("room").value;
  room = room.toUpperCase().trim();
  socket.emit('create or join', room);
  console.log('Attempted to create or  join room', room);
  console.log('Getting user media with constraints', constraints);
  navigator.mediaDevices.getUserMedia(constraints).then(gotStream)
    .catch(function (e) {
      alert('The Audio/Video media devices could not be started');
      console.error('getUserMedia() error: ', e);
    });

  var mainDiv = document.getElementById("localVideoDiv");
  toggleMicOverlay(false, mainDiv);
  addUserOverlay(mainDiv, "overlay-text", local_user);
}

//Local stream processing
function gotStream(stream) {
  console.log('Adding local stream.', stream);
  localStream = stream;
  setVideoAttributes(localVideo, stream, false);
  sendMessage(socket, { type: MessageType.GOT_USER_MEDIA }, room, local_user);
}

function maybeStart(from_socket_id, from_user) {
  console.log('maybeStart() ', localStream);
  if (localStream !== undefined) {
    console.log('creating peer connection');
    createPeerConnection(from_socket_id, from_user);

    // add tracks
    for (const track of localStream.getTracks()) {
      peerConnections[from_socket_id].addTrack(track, localStream);
    }

    // is sharing screen active
    if (displayStream[0] !== undefined) {
      console.log('Sharing screen on');
      sendMessage(socket, {
        type: MessageType.SCREEN_SHARE,
        screen_track_id: displayStream[0].id
      }, room, local_user);
      var displayTrack = displayStream[0].getVideoTracks()[0];
      displayTrack.onended = () => stopScreenShare(socket, peerConnections, displayStream,
        displaySenders, room);
      console.log('Adding Display Track', displayStream[0].id);
      displaySenders[from_socket_id] = peerConnections[from_socket_id].addTrack(displayTrack, displayStream[0]);
    }

    console.log('isInitiator', isInitiator);
  }
}


// Creating peer connection
function createPeerConnection(socket_id, from_user) {
  try {
    // Allows for RTC server configuration
    var pcConfig = envConfig.iceServers;
    var pcConstraint = null;
    var dataConstraint = null;
    peerConnections[socket_id] = new RTCPeerConnection(pcConfig, pcConstraint);
    peerConnections[socket_id].onicecandidate = (event) => handleIceCandidate(event, socket_id);
    peerConnections[socket_id].ontrack = (event) => handleOnTrack(event, socket_id, from_user);
    peerConnections[socket_id].onnegotiationneeded = (event) => handleOnNegotiationNeeded(event, socket_id);

    // create and configure data channel
    sendDataChannel[socket_id] = peerConnections[socket_id].createDataChannel('sendDataChannel', dataConstraint);
    sendDataChannel[socket_id].bufferedAmountLowThreshold = MAX_BUFFER_SIZE;
    sendDataChannel[socket_id].onbufferedamountlow = () => { bufferOrSend(sendDataChannel[socket_id], socket_id) };
    sendDataChannel[socket_id].onerror = (event) => { console.error("Error while transfering data:", event) };
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
    sendMessage(socket, {
      type: MessageType.CANDIDATE,
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    }, room, local_user, from_socket_id);
  } else {
    console.log('End of candidates.');
  }
}

async function sendOffer(from_socket_id) {
  console.log('Sending offer to peer');
  var offer = await peerConnections[from_socket_id].createOffer(sdpConstraints);
  await peerConnections[from_socket_id].setLocalDescription(offer);
  sendMessage(socket, offer, room, local_user, from_socket_id);
}

async function sendAnswer(from_socket_id) {
  console.log('Sending answer to peer.');
  var answer = await peerConnections[from_socket_id].createAnswer(sdpConstraints);
  await peerConnections[from_socket_id].setLocalDescription(answer);
  sendMessage(socket, answer, room, local_user, from_socket_id);;
}

function handleOnNegotiationNeeded(event, from_socket_id) {
  console.log("onnegotiationneeded event:", event);
  if (isInitiator) {
    sendOffer(from_socket_id);
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
    setVideoAttributes(remoteVideo, event.streams[0], false);
    mainDiv.appendChild(remoteVideo);
    toggleMicOverlay(false, mainDiv);
    addUserOverlay(mainDiv, "overlay-text", from_user);
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
      var screenVideo = document.getElementById("screenVideo");
      setVideoAttributes(screenVideo, event.streams[0], true)
      addUserOverlay(screenVideoDiv, "overlay-text-screen", from_user + "'s Screen");
      console.log('Screen Share added. Event: ', event);
    }
  }
}

// add common video attributes
function setVideoAttributes(video, stream, isMuted) {
  video.srcObject = stream;
  video.autoplay = true;
  video.playsInline = true;
  if (isMuted) {
    video.muted = true;
  }
}

function receiveChannelCallback(event) {
  console.log('Receive Channel Callback');
  var receiveChannel = event.channel;
  receiveChannel.onmessage = handelOnMessage();

  isInitiator = true;
  // is muted
  if (!localStream.getAudioTracks()[0].enabled) {
    sendMessage(socket, { type: MessageType.MUTE }, room, local_user);
  }
}

function handleMuteUnMute(isMute, metaData) {
  console.log("Handling mute/unmute");
  const mainDivList = document.querySelectorAll("[socket='" + metaData.from_socket_id + "']");
  if (mainDivList !== null) {
    mainDivList.forEach(mainDiv => {
      if (mainDiv.id === "remoteVideoDiv") {
        toggleMicOverlay(isMute, mainDiv);
      }
    });
  }
}

function handleShareScreen(message) {
  console.info("Screen Sharing session is active");
  screen_track_id = message.screen_track_id;
  screenShareBtn.disabled = true;
}

function handleUnshareScreen(metaData) {
  console.log('Recieved screen unshare');
  screen_track_id = undefined;
  screenShareBtn.disabled = false;
  document.getElementById("screenVideo").srcObject = null;
  document.getElementById("screenVideoDiv").hidden = true;
}


function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage(socket, { type: MessageType.BYE }, room, local_user);
  socket.disconnect();
  location.reload();
}

function toggleAudio() {
  var mainDiv = document.getElementById("localVideoDiv");
  var micOnOffImg = document.getElementById("micOnOffImg");
  localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
  if (localStream.getAudioTracks()[0].enabled) {
    micOnOffBtn.className = "btn btn-circle btn-light";
    micOnOffImg.src = "../assets/icons/mic.svg";
    toggleMicOverlay(false, mainDiv);
    sendMessage(socket, { type: MessageType.UNMUTE }, room, local_user);
  } else {
    micOnOffBtn.className = "btn btn-circle btn-warning";
    micOnOffImg.src = "../assets/icons/mic-mute.svg";
    toggleMicOverlay(true, mainDiv);
    sendMessage(socket, { type: MessageType.MUTE }, room, local_user);
  }
}

function toggleVideo() {
  var videoOnOffImg = document.getElementById("videoOnOffImg");
  localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
  if (localStream.getVideoTracks()[0].enabled) {
    videoOnOffBtn.className = "btn btn-circle btn-light";
    videoOnOffImg.src = "../assets/icons/camera-video.svg";
  } else {
    videoOnOffBtn.className = "btn btn-circle btn-warning";
    videoOnOffImg.src = "../assets/icons/camera-video-off.svg";
  }
}

function handleRemoteHangup(metaData) {
  console.log('Session terminated for user: ', metaData.from_user);
  stop(metaData);
}

function stop(metaData) {
  if (metaData === null || metaData === undefined) {
    console.log('Closing All conections...')
    for (let socket_id in peerConnections) {
      if (peerConnections[socket_id] !== null) {
        peerConnections[socket_id].close();
        peerConnections[socket_id] == null;
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
        screenShareBtn.disabled = false;
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