'use strict';

import { sendMessage } from "./signaling.js";
import { MessageType } from "./constants.js";

var screenShareBtn = document.getElementById("screenShareBtn");

export async function startScreenShare(socket, peerConnections, displayStream, displaySenders, room) {
  console.log('Starting screen sharing...');
  try {
    displayStream[0] = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: "always",
        displaySurface: "monitor",
        logicalSurface: false
      },
      audio: false
    });

    var displayTrack = displayStream[0].getVideoTracks()[0];
    displayTrack.onended = () => stopScreenShare(socket, peerConnections, displayStream, 
      displaySenders, room);

    // send screen share activated message to room
    sendMessage(socket, {
      type: MessageType.SCREEN_SHARE,
      screen_track_id: displayStream[0].id
    }, room);

    for (let socket_id in peerConnections) {
      if (peerConnections[socket_id] !== null) {
        console.log('Adding Display Track', displayStream[0].id);
        displaySenders[socket_id] = peerConnections[socket_id].addTrack(displayTrack, displayStream[0]);
      }
    }
    screenShareBtn.disabled = true;
  } catch (e) {
    alert('Screen sharing is not supported on mobile devices');
    console.error('getDisplayMedia() error: ', e);
  }
}

export function stopScreenShare(socket, peerConnections, displayStream, displaySenders, room) {
  console.log('Stopping screen sharing...');
  screenShareBtn.disabled = false;
  displayStream[0] = undefined;
  sendMessage(socket, { type: MessageType.SCREEN_UNSHARE }, room);
  for (let socket_id in peerConnections) {
    if (peerConnections[socket_id] !== null && displaySenders[socket_id] !== null) {
      peerConnections[socket_id].removeTrack(displaySenders[socket_id]);
    }
  }
}

